#!/usr/bin/env node
/**
 * Makes the "Secret Key (for OAuth)" that Supabase needs for Sign in with Apple.
 *
 * Apple lets this secret live at most 6 months. When it expires, every
 * Apple sign-in through Supabase fails with "Authentication failed" — that is
 * what got 1.8.8 rejected on 12 Oct 2026. Run this again before the date it
 * prints, and paste the result into Supabase.
 *
 * Usage:
 *   node scripts/make-apple-client-secret.mjs \
 *     --key ~/path/AuthKey_ABC123DEFG.p8 \
 *     --key-id ABC123DEFG \
 *     --team-id Z9JR65SA89 \
 *     --client-id <your Services ID, e.g. com.aizztech.rencana.signin>
 *
 * Then: Supabase → Authentication → Sign In / Providers → Apple →
 * "Secret Key (for OAuth)" → paste → Save.
 *
 * The secret is printed to the terminal only. Do not commit it or paste it
 * into chat; anyone holding it can sign in as this app until it expires.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);

const required = ['key', 'key-id', 'team-id', 'client-id'];
const missing = required.filter((name) => !args[name]);
if (missing.length) {
  console.error(`Missing: ${missing.map((m) => `--${m}`).join(', ')}`);
  process.exit(1);
}

// Apple's limit is 15,777,000 seconds (about 182 days). Stay a day under it.
const LIFETIME_SECONDS = 15_777_000 - 86_400;

const base64url = (input) => Buffer.from(input).toString('base64url');

const keyPath = args.key.replace(/^~(?=\/)/, homedir());
const privateKey = createPrivateKey(readFileSync(keyPath, 'utf8'));

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'ES256', kid: args['key-id'] };
const payload = {
  iss: args['team-id'],
  iat: now,
  exp: now + LIFETIME_SECONDS,
  aud: 'https://appleid.apple.com',
  sub: args['client-id'],
};

const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
// JWT wants the raw r||s signature, not the DER form Node gives by default.
const signature = sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' });

const expires = new Date((now + LIFETIME_SECONDS) * 1000);
console.log(`${unsigned}.${base64url(signature)}`);
console.error(`\nExpires: ${expires.toISOString().slice(0, 10)}. Make a new one before then.`);
