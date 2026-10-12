// Copies the Study World pixel-art and chat-filter code from the Rencana website repo into
// src/vendor/study-world, so the admin draws avatars and maps exactly like the
// website. Run after the website's avatar or map code changes:
//
//   node scripts/sync-study-world-art.mjs "/path/to/Rencana.-main"
//
// Only plain code is copied (no React, no Supabase, no user data).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const web = process.argv[2];
if (!web || !existsSync(join(web, 'src/lib/study-world/avatar.ts'))) {
  console.error('Pass the Rencana website folder, e.g. node scripts/sync-study-world-art.mjs "/path/to/Rencana.-main"');
  process.exit(1);
}
const from = join(web, 'src/lib/study-world');
const to = resolve('src/vendor/study-world');
rmSync(to, { recursive: true, force: true });
mkdirSync(join(to, 'maps'), { recursive: true });
// Plain files with no React or Supabase imports. chat-filter.ts keeps the
// admin's word preview identical to what players get; fish-art.ts draws fish.
for (const file of ['avatar.ts', 'chat-filter.ts', 'fish-art.ts']) {
  if (existsSync(join(from, file))) cpSync(join(from, file), join(to, file));
}
for (const file of readdirSync(join(from, 'maps'))) {
  if (file.endsWith('.ts')) cpSync(join(from, 'maps', file), join(to, 'maps', file));
}
console.log(`Copied Study World art from ${from} to ${to}`);
