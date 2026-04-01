/**
 * Deletes the currently authenticated user (auth.users + cascaded rows).
 * Requires Authorization: Bearer <access_token>.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: 'Method not allowed', code: 'METHOD' } }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: { message: 'Server misconfigured', code: 'CONFIG' } }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!jwt) {
    return new Response(JSON.stringify({ error: { message: 'Unauthorized', code: 'NO_JWT' } }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabaseAdmin.auth.getUser(jwt);

  if (userErr || !user) {
    return new Response(
      JSON.stringify({ error: { message: userErr?.message ?? 'Invalid session', code: 'INVALID_SESSION' } }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (delErr) {
    return new Response(JSON.stringify({ error: { message: delErr.message, code: 'DELETE_FAILED' } }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
