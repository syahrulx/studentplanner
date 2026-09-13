/**
 * LaTeX to readable Unicode, for maths that sits inside a sentence.
 *
 * Display maths (`$$...$$`) is rendered properly by KaTeX in `MathBlock`. Inline
 * maths cannot be: a paragraph with five `$x^2$` in it would need five WebViews,
 * and a list of those does not scroll. Inline maths is also almost always
 * simple, so a Unicode transform reads correctly and costs nothing:
 *
 *   $x^2$        -> x²
 *   $H_2O$       -> H₂O
 *   $\alpha$     -> α
 *   $\sqrt{x+1}$ -> √(x+1)
 *   $\frac{a}{b}$-> a/b
 *
 * What it cannot do is stack a fraction or size a large operator. Anything that
 * needs those belongs in a display block, and the tutor prompt asks for exactly
 * that split.
 */

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

const SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', ast: '∗',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈',
  equiv: '≡', propto: '∝', sim: '∼',
  infty: '∞', partial: '∂', nabla: '∇', degree: '°', circ: '∘',
  rightarrow: '→', to: '→', leftarrow: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⇒',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩',
  forall: '∀', exists: '∃', emptyset: '∅', therefore: '∴',
  sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', sqrt: '√',
  ldots: '…', dots: '…', cdots: '⋯', quad: ' ', qquad: '  ',
};

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽',
  ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ',
};

const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍',
  ')': '₎', a: 'ₐ', e: 'ₑ', i: 'ᵢ', n: 'ₙ', o: 'ₒ', x: 'ₓ', t: 'ₜ',
};

/** Combining marks, which attach to the preceding character. */
const ACCENTS: Record<string, string> = {
  bar: '̄', overline: '̄',
  hat: '̂', widehat: '̂',
  tilde: '̃', widetilde: '̃',
  vec: '⃗', dot: '̇', ddot: '̈',
};

/** Whole run maps to script characters, or we leave it as `^`/`_` notation. */
function toScript(body: string, table: Record<string, string>): string | null {
  let out = '';
  for (const ch of body) {
    const mapped = table[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

/**
 * Convert one LaTeX expression (already stripped of its `$` delimiters).
 * Unknown commands lose their backslash rather than being dropped, so an
 * unrecognised macro degrades to a readable word instead of vanishing.
 */
export function latexToUnicode(input: string): string {
  let s = String(input ?? '');

  // \text{...} and \mathrm{...} are just prose.
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1');

  // Fractions become a/b, with brackets when either side is compound.
  const wrap = (t: string) => (/^[\w.]+$/.test(t.trim()) ? t.trim() : `(${t.trim()})`);
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a, b) => `${wrap(a)}/${wrap(b)}`);
  }

  // Roots. \sqrt[3]{x} keeps its index as a prefix so it is not lost.
  s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, (_m, n, x) => `${n}√${wrap(x)}`);
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, x) => `√${wrap(x)}`);

  // Accents ride on the character they decorate. Without this, "\bar{x}" comes
  // out as the word "barx", which is what a student would have read for the
  // sample mean.
  s = s.replace(/\\(bar|overline|hat|widehat|tilde|widetilde|vec|dot|ddot)\s*\{([^{}]*)\}/g,
    (_m, name: string, body: string) => {
      const mark = ACCENTS[name];
      const text = body.trim();
      if (!mark || !text) return text;
      // An overline covers the whole run; the others sit on the first letter.
      return name === 'overline'
        ? [...text].map((ch) => ch + mark).join('')
        : text[0] + mark + text.slice(1);
    });

  // Named symbols and Greek letters.
  s = s.replace(/\\([A-Za-z]+)/g, (m, name: string) => GREEK[name] ?? SYMBOLS[name] ?? m);

  // Scripts: braced runs first, then single characters.
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (m, body: string) => toScript(body, SUPERSCRIPT) ?? `^(${body})`);
  s = s.replace(/_\s*\{([^{}]*)\}/g, (m, body: string) => toScript(body, SUBSCRIPT) ?? `_(${body})`);
  s = s.replace(/\^(\w)/g, (m, ch: string) => SUPERSCRIPT[ch] ?? m);
  s = s.replace(/_(\w)/g, (m, ch: string) => SUBSCRIPT[ch] ?? m);

  // Leftover LaTeX punctuation that carries no meaning in plain text.
  s = s.replace(/\\[,;:!]/g, ' ').replace(/\\\\/g, ' ').replace(/[{}]/g, '');
  s = s.replace(/\\left|\\right/g, '');
  // An unknown command keeps its name, minus the backslash.
  s = s.replace(/\\([A-Za-z]+)/g, '$1');

  return s.replace(/\s{2,}/g, ' ').trim();
}

export type MathSegment =
  | { type: 'text'; value: string }
  | { type: 'block'; value: string };

const LATEX_SIGNAL = /[\\^_]/;

/**
 * Decide whether a single-dollar span is maths rather than two prices.
 *
 * Requiring a LaTeX command would be safe but too strict: the tutor is asked to
 * write simple things like `$v$` or `$k[A]$` inline, and those would keep their
 * dollar signs on screen. The delimiter rules do the work instead, and they cut
 * out currency on their own: a price is written "$5 and $10", where the span
 * between the two markers ends in a space and the second marker is followed by
 * a digit. Both are rejected below.
 */
function isInlineMath(body: string, nextChar: string): boolean {
  if (!body || body.length > 120 || body.includes('\n')) return false;
  // "$5 and $10": the span ends in a space, and "10" follows the closer.
  if (/^\s|\s$/.test(body)) return false;
  if (/\d/.test(nextChar)) return false;
  if (LATEX_SIGNAL.test(body)) return true;
  // Otherwise it has to read as an expression rather than as prose: a symbol
  // is involved, and it is not a bare amount like "$5$".
  return /[A-Za-z]/.test(body) && !/[.,;:!?]\s/.test(body);
}

/**
 * Split a message into prose and display-maths blocks.
 *
 * Inline maths is converted in place, so the prose segments are ready for the
 * existing Markdown renderer and only real display blocks need KaTeX.
 */
export function parseMathSegments(markdown: string): MathSegment[] {
  const src = String(markdown ?? '');
  const segments: MathSegment[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer) {
      segments.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  while (i < src.length) {
    // Escaped dollar stays literal.
    if (src[i] === '\\' && src[i + 1] === '$') {
      buffer += '$';
      i += 2;
      continue;
    }

    if (src[i] === '$' && src[i + 1] === '$') {
      const end = src.indexOf('$$', i + 2);
      if (end > i + 1) {
        const body = src.slice(i + 2, end).trim();
        if (body) {
          flush();
          segments.push({ type: 'block', value: body });
        }
        i = end + 2;
        continue;
      }
    }

    if (src[i] === '$') {
      const end = src.indexOf('$', i + 1);
      if (end > i) {
        const body = src.slice(i + 1, end);
        if (isInlineMath(body, src[end + 1] ?? '')) {
          buffer += latexToUnicode(body);
          i = end + 1;
          continue;
        }
      }
    }

    buffer += src[i];
    i += 1;
  }

  flush();
  return segments;
}

/** True when a message has display maths worth handing to KaTeX. */
export function hasDisplayMath(markdown: string): boolean {
  return parseMathSegments(markdown).some((s) => s.type === 'block');
}
