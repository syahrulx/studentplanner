/**
 * Run: npx --yes tsx tests/rentamanAvatar.test.ts
 *
 * The app draws RenTaman avatars with the website's own code.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { avatarBounds, avatarRuns, safeLook, AVATAR_GRID } from '../src/lib/rentamanAvatar';
import { DEFAULT_LOOK, randomLook } from '../src/vendor/rentaman/avatar';

// Runs cover only real pixels and the outline, inside the grid.
const runs = avatarRuns(DEFAULT_LOOK, false);
assert.ok(runs.length > 50 && runs.length < 1064, `runs: ${runs.length}`);
for (const r of runs) {
  assert.ok(r.x >= 0 && r.w >= 1 && r.x + r.w <= AVATAR_GRID.w && r.y >= 0 && r.y < AVATAR_GRID.h);
}

// Blinking changes the picture.
assert.notDeepEqual(avatarRuns(DEFAULT_LOOK, true), runs);

// An item this build doesn't know falls back to the default; known ones stay.
const odd = safeLook({ hair: 'item-from-the-future' as any });
assert.equal(odd.hair, DEFAULT_LOOK.hair);
let seed = 3;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const real = randomLook(true, rnd);
const kept = safeLook(real) as Record<string, unknown>;
for (const [k, v] of Object.entries(real)) assert.equal(kept[k], v, `kept ${k}`);
assert.ok(avatarRuns(safeLook(real), false).length > 50);

// A missing field comes from the defaults instead of breaking the drawing.
const partial = safeLook({ skin: DEFAULT_LOOK.skin });
assert.ok(avatarRuns(partial, false).length > 50);

// Bounds hold every drawn pixel and stay inside the grid, so cropping to them
// never cuts the avatar and every outfit can be drawn at the same height.
for (let i = 0; i < 40; i++) {
  const look = safeLook(randomLook(true, rnd));
  const b = avatarBounds(look);
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= AVATAR_GRID.w && b.y + b.h <= AVATAR_GRID.h);
  for (const r of [...avatarRuns(look, false), ...avatarRuns(look, true)]) {
    assert.ok(r.x >= b.x && r.x + r.w <= b.x + b.w && r.y >= b.y && r.y < b.y + b.h);
  }
}
const plain = avatarBounds(DEFAULT_LOOK);
assert.ok(plain.h < AVATAR_GRID.h, 'a plain outfit is cropped, so it is drawn bigger');

// The app's copy matches the website's.
execFileSync('node', ['scripts/sync-rentaman-avatar.js', '--check'], { stdio: 'inherit' });

console.log('rentamanAvatar: all tests passed');
