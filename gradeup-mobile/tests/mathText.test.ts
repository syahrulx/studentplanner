/**
 * Run: npm run test:math-text
 *
 * The risky half of maths rendering is not KaTeX, it is deciding what counts as
 * maths in the first place. A tutor answer about tuition fees is full of dollar
 * signs, and swallowing those as delimiters would mangle the sentence. These
 * pin both directions: real formulas convert, prices do not.
 */
import assert from 'node:assert/strict';
import { parseMathSegments, latexToUnicode, hasDisplayMath } from '../src/lib/mathText';

/** The message as the student would read it, with maths already converted. */
function rendered(md: string): string {
  return parseMathSegments(md).map((s) => s.value).join('');
}

// --- inline maths converts ------------------------------------------------

assert.equal(rendered('Velocity $v$ increases.'), 'Velocity v increases.');
assert.equal(rendered('The rate is $k[A]$ here.'), 'The rate is k[A] here.');
assert.equal(rendered('Energy $E = mc^2$ always.'), 'Energy E = mc² always.');
assert.equal(rendered('Greek $\\alpha$ and water $H_2O$.'), 'Greek α and water H₂O.');
assert.equal(rendered('Bounded by $x_{max}$ only.'), 'Bounded by x_(max) only.');

// --- currency is left alone -----------------------------------------------

for (const money of [
  'It costs $5 and $10 in total.',
  'The fee is $100 and the tax is $20 more.',
  'Tuition $1,500 per term, books $200 extra.',
  'Price rose from $5 to $7 last year.',
  'Budget $50 for food and $30 for transport today.',
]) {
  assert.equal(rendered(money), money, `currency was eaten: ${money}`);
}

// An escaped dollar is literal, and loses its backslash.
assert.equal(rendered('Escaped \\$100 stays.'), 'Escaped $100 stays.');

// --- display blocks -------------------------------------------------------

const halfLife = 'Half life:\n\n$$t_{1/2} = \\frac{0.693}{k}$$\n\nIt is constant.';
const segs = parseMathSegments(halfLife);
assert.equal(segs.length, 3);
assert.equal(segs[1].type, 'block');
assert.equal(segs[1].value, 't_{1/2} = \\frac{0.693}{k}');
assert.ok(hasDisplayMath(halfLife));

assert.equal(parseMathSegments('Two $$x^2$$ and $$\\sqrt{y+1}$$ done.').filter((s) => s.type === 'block').length, 2);

// A block still arriving over the stream must not be split early: the closing
// delimiter has not been sent yet, so it stays as text until it does.
assert.equal(hasDisplayMath('Streaming partial: $$\\frac{a}{b'), false);

// --- the plain fallback stays readable ------------------------------------

assert.equal(latexToUnicode('\\frac{0.693}{k}'), '0.693/k');
assert.equal(latexToUnicode('\\int_0^1 x^2 dx'), '∫₀¹ x² dx');
assert.equal(latexToUnicode('\\sqrt{a+b}'), '√(a+b)');
assert.equal(latexToUnicode('\\text{rate} = k[A]^2'), 'rate = k[A]²');
// An unknown command degrades to its name rather than vanishing.
assert.equal(latexToUnicode('\\binom{n}{k}'), 'binomnk');


// --- accents --------------------------------------------------------------
// `\bar{x}` used to read as the word "barx" for the sample mean.
assert.equal(latexToUnicode('\\bar{x}'), 'x̄');
assert.equal(latexToUnicode('\\hat{y} + \\vec{v}'), 'ŷ + v⃗');
assert.equal(latexToUnicode('\\overline{AB}'), 'ĀB̄');
assert.equal(rendered('The sample mean is $\\bar{x}$ here.'), 'The sample mean is x̄ here.');

console.log('mathText tests passed');
