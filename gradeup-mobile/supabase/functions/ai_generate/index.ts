import { createClient } from 'npm:@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GenerateKind = 'flashcards' | 'flashcards_pdf' | 'quiz';

interface RequestBody {
  kind: GenerateKind;
  /** Note content or extracted PDF text for flashcard/quiz generation. */
  content?: string;
  /** Number of items to generate. */
  count?: number;
  /** Quiz-specific fields. */
  quiz_type?: 'mcq' | 'true_false' | 'mixed' | 'short_answer';
  difficulty?: 'easy' | 'medium' | 'hard';
}

// ---------------------------------------------------------------------------
// CORS & Response helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorJson(message: string, code = 'ERROR', status = 200) {
  return json({ error: { message, code } }, status);
}

// ---------------------------------------------------------------------------
// Rate limiting (per-user, per-day)
// ---------------------------------------------------------------------------

const DAILY_LIMIT_FREE = 20; // max AI generations per day for free users
const DAILY_LIMIT_PLUS = 100;
const DAILY_LIMIT_PRO = 500;

async function checkRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  subscriptionPlan: string,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from('ai_token_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString());

  const used = error ? 0 : (count ?? 0);
  const limit =
    subscriptionPlan === 'pro'
      ? DAILY_LIMIT_PRO
      : subscriptionPlan === 'plus'
        ? DAILY_LIMIT_PLUS
        : DAILY_LIMIT_FREE;

  return { allowed: used < limit, used, limit };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildFlashcardPrompt(content: string, count: number): { system: string; user: string } {
  return {
    system: `You are an expert study assistant. Generate exactly ${count} high-quality flashcards.

Rules:
- Focus on key concepts, definitions, and exam-relevant content
- Avoid trivial or filler content
- Each flashcard should test one important concept
- Keep questions clear and concise
- Answers must be accurate and helpful

Return ONLY a JSON array:
[{"front":"question","back":"answer"}]

No markdown, no explanation, ONLY the JSON array.`,
    user: `Generate exactly ${count} flashcards from the following content:\n\n${content}`,
  };
}

function buildQuizPrompt(
  content: string,
  count: number,
  quizType: string,
  difficulty: string,
): { system: string; user: string } {
  const typeInstr: Record<string, string> = {
    mcq: 'Multiple choice questions with exactly 4 options. Set "correctIndex" to the 0-based index of the correct option.',
    true_false:
      'True/False questions. Options must be exactly ["True", "False"]. Set "correctIndex" to 0 for True, 1 for False.',
    short_answer:
      'Short answer questions. Set "options" to an empty array []. Set "correctIndex" to -1. Include "expectedAnswer" with the correct answer text.',
    mixed: 'A mix of MCQ (4 options), True/False (2 options: ["True","False"]), and Short Answer (empty options, include "expectedAnswer"). Vary the types.',
  };

  const diffInstr: Record<string, string> = {
    easy: 'Basic recall and definition questions.',
    medium: 'Application and understanding questions requiring some reasoning.',
    hard: 'Analysis and synthesis questions that require deep understanding.',
  };

  return {
    system: `You are a quiz question generator. Generate exactly ${count} questions.

Rules:
- ${typeInstr[quizType] || typeInstr.mcq}
- Difficulty: ${diffInstr[difficulty] || diffInstr.medium}
- Focus ONLY on the educational/academic subject matter.
- Questions must test the student's knowledge of the actual topics and concepts.
- Return ONLY a JSON array. No markdown, no explanation.
- Each object must have: "question" (string), "options" (string[]), "correctIndex" (number)${quizType === 'short_answer' || quizType === 'mixed' ? ', and optionally "expectedAnswer" (string)' : ''}.`,
    user: `Generate quiz questions from the following study material:\n\n${content}`,
  };
}

// ---------------------------------------------------------------------------
// OpenAI call
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ content: string; usage: Record<string, number> | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000); // 45s timeout

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      return { content: '', usage: null, error: `OpenAI error (${res.status}): ${errText.slice(0, 400)}` };
    }

    const data = await res.json();
    const content = (data?.choices?.[0]?.message?.content ?? '').trim();
    const usage = data?.usage ?? null;
    return { content, usage };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === 'AbortError') {
      return { content: '', usage: null, error: 'AI generation timed out after 45 seconds. Please try again.' };
    }
    return { content: '', usage: null, error: err?.message || 'OpenAI request failed' };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Config ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const openAiKey = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !supabaseAnon) {
      return errorJson('Missing Supabase config in Edge Function environment.', 'CONFIG');
    }
    if (!openAiKey || openAiKey.length < 20) {
      return errorJson(
        'OPENAI_API_KEY is not set in Edge Function secrets. Run: npx supabase secrets set OPENAI_API_KEY=sk-...',
        'CONFIG',
      );
    }

    // ── Auth ──
    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData.user) {
      return errorJson('Unauthorized. Please sign in again.', 'UNAUTHORIZED', 401);
    }

    const userId = authData.user.id;

    // ── Parse body ──
    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return errorJson('Invalid JSON body.', 'BAD_REQUEST');
    }

    const kind = body.kind;
    if (!kind || !['flashcards', 'flashcards_pdf', 'quiz'].includes(kind)) {
      return errorJson('Invalid "kind". Must be: flashcards, flashcards_pdf, or quiz.', 'BAD_REQUEST');
    }

    const content = (body.content ?? '').trim();
    if (!content || content.length < 20) {
      return errorJson('Content is too short for AI generation.', 'BAD_REQUEST');
    }

    // Truncate to prevent abuse (max ~12k chars ≈ 3k tokens)
    const MAX_CONTENT = 15_000;
    const truncatedContent = content.slice(0, MAX_CONTENT);

    // ── Rate limit ──
    const supabaseAdmin = serviceRole
      ? createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
      : supabaseUser;

    // Get user's subscription plan
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('subscription_plan')
      .eq('id', userId)
      .maybeSingle();

    const plan = profileData?.subscription_plan ?? 'free';
    const rateCheck = await checkRateLimit(supabaseAdmin, userId, plan);
    if (!rateCheck.allowed) {
      return errorJson(
        `Daily AI limit reached (${rateCheck.used}/${rateCheck.limit}). Upgrade your plan or try again tomorrow.`,
        'RATE_LIMIT',
      );
    }

    // ── Build prompt & call OpenAI ──
    let systemPrompt: string;
    let userPrompt: string;
    let maxTokens: number;

    const count = Math.min(Math.max(1, body.count ?? 10), 30); // 1-30 items

    if (kind === 'flashcards' || kind === 'flashcards_pdf') {
      const prompts = buildFlashcardPrompt(truncatedContent, count);
      systemPrompt = prompts.system;
      userPrompt = prompts.user;
      maxTokens = 2500;
    } else {
      const quizType = body.quiz_type || 'mcq';
      const difficulty = body.difficulty || 'medium';
      const prompts = buildQuizPrompt(truncatedContent, count, quizType, difficulty);
      systemPrompt = prompts.system;
      userPrompt = prompts.user;
      maxTokens = 4000;
    }

    const result = await callOpenAI(openAiKey, systemPrompt, userPrompt, maxTokens);

    if (result.error) {
      return errorJson(result.error, 'OPENAI_ERROR');
    }

    // ── Parse AI response ──
    const cleaned = result.content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return errorJson('AI returned invalid JSON. Please try again.', 'PARSE_ERROR');
    }

    if (!Array.isArray(parsed)) {
      return errorJson('AI returned unexpected format. Please try again.', 'PARSE_ERROR');
    }

    // ── Log token usage (fire-and-forget) ──
    supabaseAdmin
      .from('ai_token_usage')
      .insert({
        user_id: userId,
        kind,
        model: 'gpt-4o-mini',
        prompt_tokens: result.usage?.prompt_tokens ?? null,
        completion_tokens: result.usage?.completion_tokens ?? null,
        total_tokens: result.usage?.total_tokens ?? null,
      })
      .then(() => {}, () => {});

    // ── Return result ──
    if (kind === 'flashcards' || kind === 'flashcards_pdf') {
      const cards = parsed
        .filter((c: any) => c?.front?.trim() && c?.back?.trim())
        .slice(0, count)
        .map((c: any) => ({ front: String(c.front).trim(), back: String(c.back).trim() }));
      return json({ cards });
    } else {
      const questions = parsed.slice(0, count).map((q: any) => ({
        question: String(q.question || '').slice(0, 500),
        options: Array.isArray(q.options) ? q.options.map((o: any) => String(o).slice(0, 250)) : [],
        correctIndex: Number(q.correctIndex ?? 0),
        expectedAnswer: q.expectedAnswer ? String(q.expectedAnswer).slice(0, 250) : undefined,
      }));
      return json({ questions });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return errorJson(message, 'INTERNAL');
  }
});
