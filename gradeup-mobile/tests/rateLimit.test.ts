import assert from 'node:assert/strict';
import { RateLimiter } from '../src/utils/rateLimit';

const reactions = new RateLimiter(5, 60_000);
for (let i = 0; i < 5; i += 1) {
  assert.equal(reactions.attempt(), true, `reaction ${i + 1} should be allowed`);
}
assert.equal(reactions.attempt(), false, 'the sixth reaction in one minute must be blocked');
reactions.reset();
assert.equal(reactions.attempt(), true, 'the limiter should allow sends after reset/new window');

console.log('reaction rate-limit tests passed');
