'use strict';

/**
 * Expand a brace range (e.g. `{1..10}`, `{a..e}`, `{01..31..7}`) into a
 * regular expression source string, using the same semantics as Bash brace
 * expansion. This module has no dependencies.
 *
 * Numeric ranges are compiled with a small digit-DFA and state elimination
 * so that even ranges like `{1..100000}` produce a compact regex instead of
 * a multi-megabyte alternation. Sparse ranges (a step larger than the number
 * of members worth compiling) are simply enumerated.
 */

const MAX_EXPANDED_MEMBERS = 1000;

// Upper bound on the digit-DFA size before compilation is abandoned.
// The automaton has O(digits * step) states, and state elimination is
// cubic, so this keeps `makeRe()` fast and its output small even for
// pathological ranges such as `{1..100000..99999}`.
const MAX_RANGE_STATES = 5000;

const RANGE_PATTERN = /^([+-]?\d+|[A-Za-z])\.\.([+-]?\d+|[A-Za-z])(?:\.\.([+-]?\d+))?$/;

const hasLeadingZero = value => /^[+-]?0\d/.test(value);

const normalizeNumber = value => {
  // Preserve the sign (Bash accepts `+1`), trim leading zeros for comparison.
  const negative = value[0] === '-';
  const positive = value[0] === '+';
  const digits = (negative || positive) ? value.slice(1) : value;
  return {
    sign: negative ? -1 : 1,
    digits,
    value: parseInt(digits, 10) * (negative ? -1 : 1)
  };
};

/**
 * Returns the regex source for a brace range, or `null` when the given inner
 * string is not a valid Bash range (callers treat the braces as literals).
 *
 * @param {String} inner The brace contents, e.g. `1..10` or `a..e..2`
 */

const expand = inner => {
  const match = RANGE_PATTERN.exec(inner);
  if (match === null) {
    return null;
  }

  const [, startToken, endToken, stepToken] = match;
  const startIsLetter = startToken.length === 1 && /[A-Za-z]/.test(startToken);
  const endIsLetter = endToken.length === 1 && /[A-Za-z]/.test(endToken);

  if (startIsLetter !== endIsLetter) {
    // Bash treats mixed letter/number ranges (e.g. `{a..1}`) as literals.
    return null;
  }

  if (startIsLetter) {
    if (stepToken !== undefined && !/^[+-]?\d+$/.test(stepToken)) {
      return null;
    }

    const step = stepToken === undefined ? 1 : Math.max(parseInt(stepToken, 10), 1);
    return letterRange(startToken, endToken, step);
  }

  const start = normalizeNumber(startToken);
  const end = normalizeNumber(endToken);

  // Numbers beyond the safe integer range cannot be expanded accurately, so
  // fall back to literal handling (matching Bash's "no error, no expansion").
  if (!Number.isSafeInteger(Math.abs(start.value)) || !Number.isSafeInteger(Math.abs(end.value))) {
    return null;
  }

  let step = 1;
  if (stepToken !== undefined) {
    if (!/^[+-]?\d+$/.test(stepToken)) {
      return null;
    }

    // A step of 0 behaves as 1 in Bash; otherwise the sign is ignored and
    // the direction comes from the endpoints.
    const parsedStep = parseInt(stepToken, 10);
    if (!Number.isSafeInteger(Math.abs(parsedStep))) {
      return null;
    }

    step = Math.max(parsedStep, 0);
    if (step === 0) step = 1;
  }

  // Zero-padding follows Bash's alignment rules. When any endpoint has a
  // leading zero, members are padded to a common total width:
  //   totalWidth = max(endpoint digit widths) + 1 when both sides are
  //   present and the widest endpoint is negative, otherwise
  //   totalWidth = max(endpoint digit widths)
  // Negative members render as `-${digits}` where the digits occupy
  // totalWidth - 1 characters; non-negative members use all totalWidth
  // characters. This reproduces, for example:
  //   `{01..10}`   -> 01..10
  //   `{-01..03}`  -> -01, 000..003
  //   `{-1..01}`   -> -1, 00..01
  //   `{-001..3}`  -> -001, 0000..0003
  const startDigits = start.digits.length;
  const endDigits = end.digits.length;
  const hasZero = hasLeadingZero(startToken) || hasLeadingZero(endToken);

  let positiveWidth = 0;
  let negativeWidth = 0;

  if (hasZero) {
    const maxDigits = Math.max(startDigits, endDigits);
    const spansSign = start.sign === -1 || end.sign === -1;
    const negativeWidest = (start.sign === -1 && startDigits >= endDigits)
      || (end.sign === -1 && endDigits >= startDigits);
    const totalWidth = spansSign && negativeWidest ? maxDigits + 1 : maxDigits;

    positiveWidth = totalWidth;
    negativeWidth = Math.max(1, totalWidth - 1);
  }

  return numberRange(start.value, end.value, step, positiveWidth, negativeWidth);
};

/**
 * Letter ranges (`{a..e}`, `{z..a..2}`). Contiguous ranges compile to a
 * character class; stepped ranges compile to a class of the selected
 * letters (every letter in the class is exactly one character).
 */

const letterRange = (start, end, step) => {
  const a = start.charCodeAt(0);
  const b = end.charCodeAt(0);
  const descending = a > b;

  if (step === 1) {
    const lo = descending ? end : start;
    const hi = descending ? start : end;
    return `[${lo}-${hi}]`;
  }

  const chars = [];
  for (let code = a; descending ? code >= b : code <= b; code += descending ? -step : step) {
    chars.push(String.fromCharCode(code));
  }

  return `[${chars.join('')}]`;
};

const padMember = (value, positiveWidth, negativeWidth) => {
  const negative = value < 0;
  const width = negative ? negativeWidth : positiveWidth;
  if (width === 0) return String(value);
  const digits = String(Math.abs(value));
  return (negative ? '-' : '') + digits.padStart(Math.max(width, digits.length), '0');
};

/**
 * Numeric ranges. Enumerates the members while the expansion is small, and
 * compiles larger ranges with the digit-DFA builder.
 */

const numberRange = (start, end, step, positiveWidth, negativeWidth) => {
  const descending = start > end;
  const count = Math.floor((descending ? start - end : end - start) / step) + 1;

  if (count <= MAX_EXPANDED_MEMBERS) {
    const members = [];
    let value = start;
    for (let i = 0; i < count; i++) {
      members.push(escapeRegex(padMember(value, positiveWidth, negativeWidth)));
      value = descending ? value - step : value + step;
    }

    return members.length === 1
      ? members[0]
      : `(?:${members.join('|')})`;
  }

  const source = integerRangeRegex(start, end, step, positiveWidth, negativeWidth);
  if (source === null) {
    throw new RangeError('Unable to expand brace range');
  }

  return source;
};

const escapeRegex = value => value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

/*
 * Numeric range compiler
 * ----------------------
 *
 * Builds a DFA over the decimal digits of numbers in [min, max] whose value
 * modulo `step` matches the required remainder, then converts it to a regex
 * with state elimination. Each DFA state records:
 *   - the digit position
 *   - comparison of the prefix against the lower/upper bounds
 *     (0 = equal, 1 = greater / -1 = less; impossible pairs never occur)
 *   - the prefix value modulo `step`
 *
 * States strictly inside both bounds are interned per (position, remainder),
 * which keeps the automaton compact; boundary-pinned states remain unique.
 */

const digitLabel = set => {
  if (set.size === 10) return '\\d';
  if (set.size === 1) return [...set][0];

  const digits = [...set].map(Number).sort((a, b) => a - b);
  const runs = [];
  let runStart = digits[0];
  let runEnd = digits[0];

  for (let i = 1; i < digits.length; i++) {
    if (digits[i] === runEnd + 1) {
      runEnd = digits[i];
    } else {
      runs.push([runStart, runEnd]);
      runStart = runEnd = digits[i];
    }
  }
  runs.push([runStart, runEnd]);

  let source = '';
  for (const [a, b] of runs) {
    if (a === b) {
      source += a;
    } else if (b - a === 1) {
      source += `${a}${b}`;
    } else {
      source += `${a}-${b}`;
    }
  }

  return `[${source}]`;
};

// Numbers in [min, max] (min, max >= 0) rendered with exactly W digits.
const fixedWidthRegex = (min, max, step, remainder, W) => {
  const lo = String(min).padStart(W, '0');
  const hi = String(max).padStart(W, '0');

  let id = 0;
  const states = [];
  const interned = new Map();
  const edges = [];

  const makeState = (pos, cmpLo, cmpHi, rem, shared) => {
    if (shared) {
      // Only states strictly inside both bounds may be merged; states still
      // pinned to a boundary (including terminal ones) must stay distinct,
      // otherwise state elimination can bypass the boundary constraint.
      const key = `${pos}:${cmpLo}:${cmpHi}:${rem}`;
      const existing = interned.get(key);
      if (existing !== undefined) return existing;

      const state = { id: id++, pos, cmpLo, cmpHi, rem };
      interned.set(key, state);
      states.push(state);
      return state;
    }

    const state = { id: id++, pos, cmpLo, cmpHi, rem };
    states.push(state);
    return state;
  };

  const start = makeState(0, 0, 0, 0, false);

  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    if (state.pos === W) continue;

    const pos = state.pos;
    const loDigit = Number(lo[pos]);
    const hiDigit = Number(hi[pos]);
    const isLast = pos + 1 === W;
    const from = state.cmpLo === 0 ? loDigit : 0;
    const to = state.cmpHi === 0 ? hiDigit : 9;

    for (let digit = from; digit <= to; digit++) {
      const nextCmpLo = state.cmpLo === 0 ? (digit === loDigit ? 0 : 1) : 1;
      const nextCmpHi = state.cmpHi === 0 ? (digit === hiDigit ? 0 : -1) : -1;
      const nextRem = (state.rem * 10 + digit) % step;
      const shared = isLast || (nextCmpLo === 1 && nextCmpHi === -1);
      const target = makeState(pos + 1, nextCmpLo, nextCmpHi, nextRem, shared);
      edges.push([state.id, target.id, digit]);
    }
  }

  const accepting = new Set(
    states.filter(state => state.pos === W && state.rem === remainder).map(state => state.id)
  );

  if (accepting.size === 0) return null;

  const N = id;
  const matrix = Array.from({ length: N }, () => Array(N).fill(null));

  const addLabel = (a, b, label) => {
    matrix[a][b] = matrix[a][b] === null
      ? label
      : `(?:${matrix[a][b]}|${label})`;
  };

  // merge parallel transitions into character classes first
  const merged = new Map();
  for (const [a, b, digit] of edges) {
    const key = `${a}>${b}`;
    let set = merged.get(key);
    if (set === undefined) {
      set = new Set();
      merged.set(key, set);
    }
    set.add(String(digit));
  }

  for (const [key, set] of merged) {
    const [a, b] = key.split('>').map(Number);
    addLabel(a, b, digitLabel(set));
  }

  // state elimination, skipping the start state and accepting states
  const eliminated = new Set();
  const order = states
    .map(state => state.id)
    .filter(stateId => stateId !== start.id && !accepting.has(stateId));

  for (const v of order) {
    const self = matrix[v][v];
    for (let i = 0; i < N; i++) {
      if (i === v || eliminated.has(i) || matrix[i][v] === null) continue;
      for (let o = 0; o < N; o++) {
        if (o === v || eliminated.has(o) || matrix[v][o] === null) continue;
        const label = matrix[i][v] + (self ? `(?:${self})*` : '') + matrix[v][o];
        addLabel(i, o, label);
      }
    }
    eliminated.add(v);
  }

  const alternatives = [];
  for (const acceptId of accepting) {
    if (matrix[start.id][acceptId] !== null) {
      alternatives.push(matrix[start.id][acceptId]);
    }
  }

  if (alternatives.length === 0) return null;
  return alternatives.length === 1
    ? alternatives[0]
    : `(?:${alternatives.join('|')})`;
};

// Nonnegative members; width=0 means 1..N digit numbers without leading
// zeros (plus the literal `0` when it belongs to the range).
const nonNegativeRegex = (min, max, step, remainder, width) => {
  if (max < 0) return null;
  min = Math.max(min, 0);

  const alternatives = [];

  if (width > 0) {
    const source = fixedWidthRegex(min, max, step, remainder, width);
    if (source !== null) alternatives.push(source);
  } else {
    if (min === 0 && remainder === 0) {
      alternatives.push('0');
    }

    const from = min === 0 ? 1 : min;
    if (from <= max) {
      const minLength = String(from).length;
      const maxLength = String(max).length;

      for (let length = minLength; length <= maxLength; length++) {
        const lo = Math.max(from, 10 ** (length - 1));
        const hi = Math.min(max, 10 ** length - 1);
        const source = fixedWidthRegex(lo, hi, step, remainder, length);
        if (source !== null) alternatives.push(source);
      }
    }
  }

  if (alternatives.length === 0) return null;
  return alternatives.length === 1
    ? alternatives[0]
    : `(?:${alternatives.join('|')})`;
};

const mod = (value, step) => ((value % step) + step) % step;

const integerRangeRegex = (start, end, step, positiveWidth = 0, negativeWidth = 0) => {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);

  // Rough upper bound on states created below: one interned remainder state
  // per digit position, plus a bounded number of boundary-pinned states.
  const digits = Math.max(
    String(Math.abs(lo)).length,
    String(Math.abs(hi)).length,
    positiveWidth,
    negativeWidth,
    1
  );
  if (step * digits > MAX_RANGE_STATES) {
    throw new RangeError('Brace range is too large to expand; reduce the range or its step');
  }

  const alternatives = [];

  // Clip the infinite progression `start + k*step` (k ∈ Z) to [a, b].
  const clip = (a, b, wantedRemainder) => {
    const first = a + mod(wantedRemainder - mod(a, step), step);
    if (first > b) return null;
    return [first, first + Math.floor((b - first) / step) * step];
  };

  if (hi >= 0) {
    const clipped = clip(Math.max(lo, 0), hi, mod(start, step));
    if (clipped !== null) {
      const source = nonNegativeRegex(
        clipped[0],
        clipped[1],
        step,
        mod(clipped[0], step),
        positiveWidth
      );
      if (source !== null) alternatives.push(source);
    }
  }

  if (lo < 0) {
    // negative members n ∈ [lo, min(hi, -1)] written as -k, with k = -n
    const clipped = clip(lo, Math.min(hi, -1), mod(start, step));
    if (clipped !== null) {
      const source = nonNegativeRegex(
        -clipped[1],
        -clipped[0],
        step,
        mod(-clipped[0], step),
        negativeWidth
      );
      if (source !== null) alternatives.push(`-${source}`);
    }
  }

  if (alternatives.length === 0) return null;
  return alternatives.length === 1
    ? alternatives[0]
    : `(?:${alternatives.join('|')})`;
};

module.exports = expand;
module.exports.expand = expand;
module.exports.integerRangeRegex = integerRangeRegex;
module.exports.fixedWidthRegex = fixedWidthRegex;
module.exports.MAX_EXPANDED_MEMBERS = MAX_EXPANDED_MEMBERS;
