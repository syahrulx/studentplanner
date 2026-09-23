#!/usr/bin/env node
/**
 * Catch the RLS pattern that caused the 2026-09-23 incident.
 *
 * A bare `auth.uid()` or `is_admin()` inside a policy expression is evaluated
 * per row: Postgres treats it as volatile and cannot hoist it. On profiles,
 * `profiles_admin_update` carried a bare `is_admin()`, so a single-row UPDATE
 * ran it once per row — 24 million admin_users scans in 18 minutes, 4-5s per
 * UPDATE, lock chains, PostgREST out of workers. Wrapping it as
 * `(select auth.uid())` makes it an InitPlan, evaluated once.
 * See supabase/migrations/20260923000001_profiles_rls_hot_path.sql.
 *
 * Existing offenders are listed in rls-lint-baseline.json so this can run in CI
 * today; anything new fails. Shrinking the baseline is the follow-up work.
 *
 * Usage:
 *   node scripts/lint-rls-policies.js            # fail on new offenders
 *   node scripts/lint-rls-policies.js --list     # print every offender
 *   node scripts/lint-rls-policies.js --update-baseline
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const baselinePath = path.join(__dirname, 'rls-lint-baseline.json');

/**
 * profiles' SELECT policies must stay subquery-free: rencana_profiles_no_plan_elevation
 * reads FROM profiles inside a profiles policy, and a subquery anywhere in profiles'
 * SELECT policies re-arms Postgres' RLS recursion check — 42P17 on every UPDATE.
 * Documented at the end of 20260923000001_profiles_rls_hot_path.sql.
 */
function isRecursionExempt(policy) {
  return policy.table === 'profiles' && /\bfor\s+select\b/i.test(policy.header);
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Policy statements, split on the semicolon that closes them at paren depth 0. */
function findPolicyStatements(sql) {
  const statements = [];
  const re = /\b(create|alter)\s+policy\b/gi;
  let match;
  while ((match = re.exec(sql)) !== null) {
    let depth = 0;
    let i = match.index;
    for (; i < sql.length; i += 1) {
      const ch = sql[i];
      if (ch === "'") {
        i += 1;
        while (i < sql.length && sql[i] !== "'") i += 1;
        continue;
      }
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      else if (ch === ';' && depth <= 0) break;
    }
    statements.push(sql.slice(match.index, i));
    re.lastIndex = i;
  }
  return statements;
}

function parsePolicy(statement) {
  const nameMatch = statement.match(/\b(?:create|alter)\s+policy\s+(?:if\s+not\s+exists\s+)?("[^"]+"|[\w$]+)/i);
  const tableMatch = statement.match(/\bon\s+(?:public\.)?("[^"]+"|[\w$]+)/i);
  const unquote = (v) => (v ? v.replace(/^"|"$/g, '') : null);
  // Everything before USING/WITH CHECK: the command (FOR SELECT, FOR UPDATE...).
  const bodyStart = statement.search(/\b(using|with\s+check)\b/i);
  return {
    name: unquote(nameMatch && nameMatch[1]) || '(unnamed)',
    table: unquote(tableMatch && tableMatch[1]) || '(unknown)',
    header: bodyStart === -1 ? statement : statement.slice(0, bodyStart),
    body: bodyStart === -1 ? '' : statement.slice(bodyStart),
  };
}

/** Calls not already wrapped as `(select fn())`. */
function bareCalls(body) {
  const found = new Set();
  for (const fn of ['auth.uid', 'auth.jwt', 'auth.role', 'is_admin']) {
    const call = new RegExp(`(\\(\\s*select\\s+)?\\b${fn.replace('.', '\\.')}\\s*\\(\\s*\\)`, 'gi');
    let m;
    while ((m = call.exec(body)) !== null) {
      if (!m[1]) found.add(`${fn}()`);
    }
  }
  return [...found];
}

function scan() {
  const offenders = [];
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    : [];
  for (const file of files) {
    const sql = stripComments(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    for (const statement of findPolicyStatements(sql)) {
      const policy = parsePolicy(statement);
      if (isRecursionExempt(policy)) continue;
      const calls = bareCalls(policy.body);
      if (calls.length) {
        offenders.push({ key: `${file}::${policy.table}::${policy.name}`, calls: calls.sort() });
      }
    }
  }
  return offenders;
}

const offenders = scan();
const args = process.argv.slice(2);

if (args.includes('--update-baseline')) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(offenders.map((o) => o.key).sort(), null, 2)}\n`);
  console.log(`Baseline written: ${offenders.length} known offenders.`);
  process.exit(0);
}

if (args.includes('--list')) {
  for (const o of offenders) console.log(`${o.key}  ->  ${o.calls.join(', ')}`);
  console.log(`\n${offenders.length} policies evaluate one of these per row.`);
  process.exit(0);
}

const baseline = fs.existsSync(baselinePath)
  ? new Set(JSON.parse(fs.readFileSync(baselinePath, 'utf8')))
  : new Set();
const added = offenders.filter((o) => !baseline.has(o.key));

if (added.length) {
  console.error('RLS lint failed: a policy calls a per-row function that is not hoisted.\n');
  for (const o of added) console.error(`  ${o.key}\n    bare: ${o.calls.join(', ')}`);
  console.error(`
Wrap each call so Postgres evaluates it once:

  using (auth.uid() = user_id)          ->  using ((select auth.uid()) = user_id)
  using (is_admin())                    ->  using ((select is_admin()))

A bare call runs once per row. That is what read 24 million rows in 18 minutes
on 2026-09-23; see supabase/migrations/20260923000001_profiles_rls_hot_path.sql.

Exception: profiles' SELECT policies must stay subquery-free, or every profiles
UPDATE fails with 42P17. Those are skipped by this lint, and a new one there
needs the same care.
`);
  process.exit(1);
}

console.log(`RLS lint passed (${offenders.length} known offenders in the baseline, 0 new).`);
