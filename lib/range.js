'use strict';

const utils = require('./utils');

/**
 * Built-in expansion for brace ranges (`{a..z}`, `{1..10}`, `{1..10..2}`),
 * following the semantics of Bash brace expansion.
 *
 * Bash supports integer ranges (optionally zero-padded and/or stepped) and
 * single ASCII letter ranges. Anything Bash would not recognize as a range is
 * returned as literal text, matching the previous picomatch behavior.
 */

// Cap the number of values we are willing to enumerate when a step is given.
// Step-less ranges are compiled to compact digit intervals instead, so ranges
// such as `{1..100000}` stay tiny. Beyond this cap the expression is matched
// literally to keep `makeRe` fast and the resulting regex small.
const MAX_STEP_TERMS = 10000;

// Safety guard for the resulting regex source length.
const MAX_OUTPUT_LENGTH = 64 * 1024;

// Integer tokens, including leading zeros ("01") and negative signs ("-03").
const INTEGER_RE = /^-?\d+$/;
const PADDED_INTEGER_RE = /^-?0\d+$/;
const LETTER_RE = /^[A-Za-z]$/;

/**
 * Backwards-compatible fallback used for expressions that Bash would leave
 * untouched (invalid ranges, or ranges too large to expand safely). Bash
 * passes such expressions through verbatim, so the braces are escaped and
 * the contents are matched literally.
 */

const literalRange = raw => {
  return `\\{${utils.escapeRegex(raw)}\\}`;
};

const isPadded = value => PADDED_INTEGER_RE.test(value);

const parseRangeArgs = (args, raw) => {
  if (args.length !== 2 && args.length !== 3) {
    return;
  }

  const [start, end, stepArg] = args;

  // The tokens must spell out exactly `start..end` or `start..end..step`.
  // This rejects shapes Bash leaves literal, such as `{1...5}` (three dots)
  // and `{1..10..}` (empty step), which produce the same args as valid
  // ranges but different raw text.
  if (raw !== undefined && args.join('..') !== raw) {
    return;
  }

  if (typeof start !== 'string' || typeof end !== 'string') {
    return;
  }

  let step = 1;

  if (stepArg !== undefined) {
    if (!INTEGER_RE.test(stepArg)) {
      return;
    }
    step = Math.abs(Number(stepArg));
    if (!Number.isSafeInteger(step)) {
      return;
    }
    if (step === 0) step = 1;
  }

  if (INTEGER_RE.test(start) && INTEGER_RE.test(end)) {
    const a = Number(start);
    const b = Number(end);

    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
      return;
    }

    const padded = isPadded(start) || isPadded(end);

    if (padded) {
      // When either endpoint has a leading zero, Bash renders every expanded
      // value with the same total width (sign included), derived from the
      // longest endpoint token: negative values are "-" followed by W-1
      // digits, positive values use W digits. This also covers ranges that
      // cross zero, e.g. `{-03..3}` => -03..-01 000..003.
      const width = Math.max(start.length, end.length);
      return { kind: 'number', a, b, step, padded, width };
    }

    return { kind: 'number', a, b, step, padded, width: 0 };
  }

  if (LETTER_RE.test(start) && LETTER_RE.test(end)) {
    // Bash accepts `{A..z}` and traverses the characters between the cases,
    // but that sequence passes through punctuation (`[\]^_\``) that is not
    // useful in glob patterns. Only expand same-case letter ranges; mixed
    // cases are matched literally.
    const sameCase = (s, e) =>
      (s >= 'A' && s <= 'Z' && e >= 'A' && e <= 'Z') ||
      (s >= 'a' && s <= 'z' && e >= 'a' && e <= 'z');

    if (!sameCase(start, end)) {
      return;
    }

    return {
      kind: 'letter',
      a: start.charCodeAt(0),
      b: end.charCodeAt(0),
      step
    };
  }
};

/**
 * Join regex alternatives, wrapping in a non-capturing group when needed so
 * the result composes correctly with surrounding pattern content.
 */

const joinAlternatives = patterns => {
  const values = [...new Set(patterns.filter(Boolean))];

  if (values.length === 0) return '';
  if (values.length === 1) return values[0];

  return `(?:${values.join('|')})`;
};

/**
 * Digit interval compilation
 * --------------------------
 *
 * Splits a range of fixed-length digit strings into a small set of patterns
 * such as `1[2-9]`, `[2-8][0-9]`, `9[0-8]`. The split points are numbers
 * ending in all 9s (counting up) and numbers ending in all 0s - 1.
 */

const countNines = (minStr, len) => {
  const prefix = minStr.slice(0, -len);
  if (prefix === '') return null;
  return Number(prefix + '9'.repeat(len));
};

const countZeros = (value, len) => value - (value % (10 ** len));

const splitToStops = (min, max, width = String(max).length) => {
  const minStr = String(min).padStart(width, '0');
  const stops = new Set([max]);

  let nines = 1;
  let stop = countNines(minStr, nines);

  while (stop !== null && min <= stop && stop <= max) {
    stops.add(stop);
    nines += 1;
    stop = countNines(minStr, nines);
  }

  let zeros = 1;
  stop = countZeros(max + 1, zeros) - 1;

  while (min < stop && stop <= max) {
    stops.add(stop);
    zeros += 1;
    stop = countZeros(max + 1, zeros) - 1;
  }

  return [...stops].sort((x, y) => (x > y ? 1 : x < y ? -1 : 0));
};

const digitClass = (from, to) => {
  if (from === to) return from;
  return `[${from}${to - from === 1 ? '' : '-'}${to}]`;
};

const rangeToPattern = (minStr, maxStr, width) => {
  let pattern = '';
  let count = 0;

  for (let i = 0; i < width; i++) {
    const lo = minStr[i];
    const hi = maxStr[i];

    if (lo === hi) {
      pattern += lo;
    } else if (lo !== '0' || hi !== '9') {
      pattern += digitClass(Number(lo), Number(hi));
    } else {
      count += 1;
    }
  }

  return { pattern, count };
};

const wildcardString = count => {
  if (count === 0) return '';
  if (count === 1) return '[0-9]';
  return `[0-9]{${count}}`;
};

/**
 * Compile a range of non-negative integers that are all rendered with the
 * same number of digits (zero-padded to `width`).
 */

const fixedDigitInterval = (min, max, width) => {
  const tokens = [];
  let start = min;
  let prev;

  for (const stop of splitToStops(min, max, width)) {
    const obj = rangeToPattern(String(start).padStart(width, '0'), String(stop).padStart(width, '0'), width);

    // Merge adjacent patterns that differ only in the number of trailing
    // wildcard digits, e.g. `[2-9][0-9]` followed by `[2-9][0-9]{2}`.
    const fixed = obj.pattern;

    if (prev && prev.prefix === fixed) {
      const prevCount = prev.counts[prev.counts.length - 1];

      if (obj.count > 0 && (obj.count === prevCount || obj.count === prevCount + 1)) {
        prev.counts.push(obj.count);
        const first = prev.counts[0];
        const last = obj.count;

        prev.string = first === last
          ? fixed + wildcardString(first)
          : `${fixed}[0-9]{${first},${last}}`;
      } else {
        prev = { prefix: fixed, counts: [obj.count], string: fixed + wildcardString(obj.count) };
        tokens.push(prev);
      }
    } else {
      prev = { prefix: fixed, counts: [obj.count], string: fixed + wildcardString(obj.count) };
      tokens.push(prev);
    }

    start = stop + 1;
  }

  return tokens.map(tok => tok.string);
};

/**
 * Compile a non-negative integer range whose values may have varying widths
 * (no zero-padding). For example, `1..200` becomes `[1-9]|[1-9][0-9]|...`.
 */

const variableDigitInterval = (min, max) => {
  const patterns = [];
  let cursor = min;

  for (let width = String(min).length; width <= String(max).length; width++) {
    const lo = Math.max(cursor, width === 1 ? 0 : 10 ** (width - 1));
    const hi = Math.min(max, 10 ** width - 1);

    if (lo > hi) continue;

    // Fixed-width patterns must never merge across different widths.
    patterns.push(...fixedDigitInterval(lo, hi, width));
    cursor = hi + 1;
  }

  return patterns;
};

/**
 * Compile a step-less numeric range into a compact regex source string.
 * `width` > 0 forces fixed-width rendering for every value (sign included).
 */

const compileNumberInterval = (a, b, width) => {
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const negatives = [];
  const positives = [];

  if (min < 0) {
    // Negative values sort as magnitudes 1..|min| when written ascending.
    const magMin = max < 0 ? Math.abs(max) : 1;
    const magMax = Math.abs(min);

    if (width > 0) {
      const patterns = fixedDigitInterval(magMin, magMax, width - 1);
      negatives.push(patterns.length === 1 ? `-${patterns[0]}` : `-(?:${patterns.join('|')})`);
    } else {
      negatives.push(...variableDigitInterval(magMin, magMax).map(p => `-${p}`));
    }
  }

  if (max >= 0) {
    const posMin = min > 0 ? min : 0;

    if (width > 0) {
      positives.push(...fixedDigitInterval(posMin, max, width));
    } else {
      positives.push(...variableDigitInterval(posMin, max));
    }
  }

  return joinAlternatives([...negatives, ...positives]);
};

const REGEX_CHAR_RE = /[\\^$.*+?()[\]{}|]/;

const escapeTrieChar = ch => (REGEX_CHAR_RE.test(ch) ? `\\${ch}` : ch);

/**
 * Compile an enumerated set of strings by collapsing shared prefixes into a
 * trie. Terms of different lengths are handled separately so optional
 * branches cannot let a shorter term masquerade as a longer one.
 */

const trieAlternatives = terms => {
  const groups = new Map();

  for (const term of terms) {
    if (!groups.has(term.length)) {
      groups.set(term.length, []);
    }

    groups.get(term.length).push(term);
  }

  const build = values => {
    const root = Object.create(null);

    for (const term of values) {
      let node = root;

      for (const ch of term) {
        if (!node[ch]) node[ch] = Object.create(null);
        node = node[ch];
      }

      node.$ = true;
    }

    const emit = node => {
      const keys = Object.keys(node).filter(key => key !== '$');

      if (keys.length === 0) {
        return '';
      }

      if (keys.length === 1) {
        const key = keys[0];
        return escapeTrieChar(key) + emit(node[key]);
      }

      // When every branch ends at this position, merge into a character class.
      if (keys.every(key => node[key].$ && Object.keys(node[key]).length === 1)) {
        return `[${keys.map(escapeTrieChar).join('')}]`;
      }

      return `(?:${keys.map(key => escapeTrieChar(key) + emit(node[key])).join('|')})`;
    };

    return emit(root);
  };

  const parts = [...groups.values()].map(build);
  return joinAlternatives(parts);
};

/**
 * Enumerate a stepped numeric range, pad values when needed, and collapse the
 * result into a compact set of alternatives.
 */

const enumerateNumbers = (a, b, step, width) => {
  const ascending = a <= b;
  const count = Math.floor(Math.abs(b - a) / step) + 1;

  if (count > MAX_STEP_TERMS) {
    return;
  }

  const format = value => {
    if (value < 0) {
      const digits = width > 0 ? width - 1 : 0;
      return '-' + String(Math.abs(value)).padStart(digits, '0');
    }

    return String(value).padStart(width, '0');
  };

  const terms = [];
  let value = a;

  while (ascending ? value <= b : value >= b) {
    terms.push(format(value));
    value += ascending ? step : -step;
  }

  return trieAlternatives(terms);
};

const compileNumberRange = range => {
  const { a, b, step, width } = range;

  let source;

  if (step === 1) {
    source = compileNumberInterval(a, b, width);
  } else {
    source = enumerateNumbers(a, b, step, width);

    if (source === undefined) {
      return;
    }
  }

  if (source.length > MAX_OUTPUT_LENGTH) {
    return;
  }

  return source;
};

/**
 * Compile a single ASCII letter range.
 */

const compileLetterRange = ({ a, b, step }) => {
  const ascending = a <= b;
  const terms = [];
  let value = a;

  while (ascending ? value <= b : value >= b) {
    terms.push(String.fromCharCode(value));
    value += ascending ? step : -step;
  }

  if (terms.length === 1) {
    return terms[0];
  }

  if (step === 1) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return `[${String.fromCharCode(lo)}-${String.fromCharCode(hi)}]`;
  }

  return joinAlternatives(terms);
};

/**
 * Expand a brace range. Called by the parser with the raw token values found
 * between `{` and `}` (e.g. `['1', '10', '3']` for `{1..10..3}`) and the
 * verbatim inner text, used when the expression is not a valid Bash range.
 */

const expandRange = (args, options, raw) => {
  if (typeof options.expandRange === 'function') {
    return options.expandRange(...args, options);
  }

  const literal = () => literalRange(raw !== undefined ? raw : args.join('..'));

  let range;

  try {
    range = parseRangeArgs(args, raw);
  } catch (ex) {
    range = undefined;
  }

  if (!range) {
    return literal();
  }

  let output;

  try {
    output = range.kind === 'letter'
      ? compileLetterRange(range)
      : compileNumberRange(range);
  } catch (ex) {
    output = undefined;
  }

  if (output === undefined) {
    return literal();
  }

  return output;
};

module.exports = expandRange;
