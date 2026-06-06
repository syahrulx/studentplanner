// @ts-nocheck — Deno edge function; runs on Supabase Deno runtime.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const apiKey = Deno.env.get('OPENAI_ADMIN_KEY') || Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'Neither OPENAI_ADMIN_KEY nor OPENAI_API_KEY secret is set.' }, 400);

    const reqHeaders = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    // Fetch 60 days of cost buckets so we can compare this month vs last month
    const startUnix = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60;
    const costsUrl = `https://api.openai.com/v1/organization/costs?start_time=${startUnix}&limit=60&bucket_width=1d`;

    const costsRes = await fetch(costsUrl, { headers: reqHeaders });
    if (!costsRes.ok) {
      const errText = await costsRes.text();
      throw new Error(`OpenAI Costs API error (${costsRes.status}): ${errText}`);
    }
    const costsBody = await costsRes.json();

    // Parse all daily buckets
    const allDays: Array<{ date: string; timestamp: number; costUsd: number }> = [];
    for (const bucket of costsBody.data ?? []) {
      const ts: number = bucket.start_time ?? 0;
      const dateStr = new Date(ts * 1000).toISOString().split('T')[0];
      let costUsd = 0;
      for (const result of bucket.results ?? []) {
        const v = parseFloat(result?.amount?.value ?? result?.amount ?? 0);
        if (!isNaN(v)) costUsd += v;
      }
      allDays.push({ date: dateStr, timestamp: ts, costUsd });
    }
    allDays.sort((a, b) => a.date.localeCompare(b.date));

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    const last30Days   = allDays.filter(d => d.date >= new Date(Date.now() - 30*86400000).toISOString().split('T')[0]);
    const thisMonthDays = allDays.filter(d => d.date >= thisMonthStart);
    const lastMonthDays = allDays.filter(d => d.date >= lastMonthStart && d.date <= lastMonthEnd);

    const thisMonthTotal = thisMonthDays.reduce((s, d) => s + d.costUsd, 0);
    const lastMonthTotal = lastMonthDays.reduce((s, d) => s + d.costUsd, 0);
    const last30Total    = last30Days.reduce((s, d) => s + d.costUsd, 0);

    // Burn rate: avg of the last 7 days (more responsive than 30-day avg)
    const last7Days = allDays.filter(d => d.date >= new Date(Date.now() - 7*86400000).toISOString().split('T')[0]);
    const burnRate7d = last7Days.length > 0 ? last7Days.reduce((s, d) => s + d.costUsd, 0) / last7Days.length : 0;

    // Anomaly: is today more than 2.5x the 7-day average?
    const todayStr = now.toISOString().split('T')[0];
    const todayCost = allDays.find(d => d.date === todayStr)?.costUsd ?? 0;
    const yesterdayCost = allDays.find(d => d.date === new Date(Date.now() - 86400000).toISOString().split('T')[0])?.costUsd ?? 0;
    const anomalyMultiplier = burnRate7d > 0 ? (yesterdayCost / burnRate7d) : 0; // compare yesterday (complete day)
    const isAnomaly = anomalyMultiplier > 2.5;

    // Month-over-month comparison (normalize last month to same # of days as this month so far)
    const daysIntoThisMonth = now.getDate();
    const lastMonthSamePeriod = lastMonthDays.filter(d => {
      const dayOfMonth = new Date(d.date).getDate();
      return dayOfMonth <= daysIntoThisMonth;
    }).reduce((s, d) => s + d.costUsd, 0);

    const momChange = lastMonthSamePeriod > 0
      ? ((thisMonthTotal - lastMonthSamePeriod) / lastMonthSamePeriod) * 100
      : null;

    // Projected month total
    const projectedMonth = daysIntoThisMonth > 0
      ? (thisMonthTotal / daysIntoThisMonth) * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      : 0;

    return json({
      dailyCosts: last30Days,            // last 30 days for chart
      thisMonthTotal,
      lastMonthTotal,
      last30Total,
      burnRate7d,                        // more responsive burn rate
      todayCost,
      yesterdayCost,
      isAnomaly,
      anomalyMultiplier,
      momChange,                         // % change vs last month same period
      projectedMonth,
      daysIntoThisMonth,
    });

  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 400);
  }
});
