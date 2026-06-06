import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { apiKey } = await req.json();

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // OpenAI's dashboard billing API is not officially documented for public use,
    // but it's the standard way to check remaining balance/usage.
    // Calculate the start and end of the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const usageUrl = `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startOfMonth}&end_date=${endOfMonth}`;
    const limitsUrl = `https://api.openai.com/v1/dashboard/billing/subscription`;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // Fetch limits (hard limit)
    const limitsRes = await fetch(limitsUrl, { headers });
    let hardLimit = 0;
    if (limitsRes.ok) {
      const limitsData = await limitsRes.json();
      hardLimit = limitsData.hard_limit_usd || 0;
    }

    // Fetch usage
    const usageRes = await fetch(usageUrl, { headers });
    if (!usageRes.ok) {
      const err = await usageRes.text();
      throw new Error(`OpenAI API error: ${err}`);
    }

    const usageData = await usageRes.json();
    const totalUsage = usageData.total_usage / 100 || 0; // It's usually in cents

    return new Response(
      JSON.stringify({
        hardLimitUsd: hardLimit,
        totalUsageUsd: totalUsage,
        remainingUsd: Math.max(0, hardLimit - totalUsage),
        startOfMonth,
        endOfMonth,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
