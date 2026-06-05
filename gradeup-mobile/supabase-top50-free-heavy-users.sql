-- =============================================================================
-- Top 50 Free Users: Name, Email, Token Usage %
-- Joins auth.users for email (only works in Supabase SQL Editor — service role)
-- =============================================================================

SELECT
  p.name                                                              AS display_name,
  au.email,
  p.university,
  -- Current month tokens (same as admin panel calculation)
  COALESCE(SUM(CASE
    WHEN u.created_at >= date_trunc('month', timezone('utc', now()))
    THEN u.total_tokens ELSE NULL
  END), 0)                                                            AS tokens_this_month,
  -- Calls this month (reliable even before token fix)
  COUNT(CASE
    WHEN u.created_at >= date_trunc('month', timezone('utc', now()))
    THEN 1 END)                                                       AS calls_this_month,
  -- % of free plan limit used (20,000 tokens)
  ROUND(
    COALESCE(SUM(CASE
      WHEN u.created_at >= date_trunc('month', timezone('utc', now()))
      THEN u.total_tokens ELSE 0
    END), 0) * 100.0 / 20000, 1
  )                                                                   AS pct_limit_used,
  MAX(u.created_at)                                                   AS last_used_at
FROM public.profiles p
JOIN auth.users au ON au.id = p.id
JOIN public.ai_token_usage u ON u.user_id = p.id
WHERE p.subscription_plan = 'free'
GROUP BY p.id, p.name, p.university, au.email
ORDER BY calls_this_month DESC, tokens_this_month DESC
LIMIT 50;
