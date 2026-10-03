'use strict';

const assert = require('assert');
const fill = require('fill-range');
const match = require('./support/match');
const { isMatch, makeRe } = require('..');

describe('braces', () => {
  it('should not match with brace patterns when disabled', () => {
    assert.deepStrictEqual(match(['a', 'b', 'c'], '{a,b,c,d}'), ['a', 'b', 'c']);
    assert.deepStrictEqual(match(['a', 'b', 'c'], '{a,b,c,d}', { nobrace: true }), []);
    assert.deepStrictEqual(match(['1', '2', '3'], '{1..2}', { nobrace: true }), []);
    assert(!isMatch('a/a', 'a/{a,b}', { nobrace: true }));
    assert(!isMatch('a/b', 'a/{a,b}', { nobrace: true }));
    assert(!isMatch('a/c', 'a/{a,b}', { nobrace: true }));
    assert(!isMatch('b/b', 'a/{a,b}', { nobrace: true }));
    assert(!isMatch('b/b', 'a/{a,b,c}', { nobrace: true }));
    assert(!isMatch('a/c', 'a/{a,b,c}', { nobrace: true }));
    assert(!isMatch('a/a', 'a/{a..c}', { nobrace: true }));
    assert(!isMatch('a/b', 'a/{a..c}', { nobrace: true }));
    assert(!isMatch('a/c', 'a/{a..c}', { nobrace: true }));
  });

  it('should treat single-set braces as literals', () => {
    assert(isMatch('a {abc} b', 'a {abc} b'));
    assert(isMatch('a {a-b-c} b', 'a {a-b-c} b'));
    assert(isMatch('a {a.c} b', 'a {a.c} b'));
  });

  it('should match literal braces when escaped', () => {
    assert(isMatch('a {1,2}', 'a \\{1,2\\}'));
    assert(isMatch('a {a..b}', 'a \\{a..b\\}'));
  });

  it('should match using brace patterns', () => {
    assert(!isMatch('a/c', 'a/{a,b}'));
    assert(!isMatch('b/b', 'a/{a,b,c}'));
    assert(!isMatch('b/b', 'a/{a,b}'));
    assert(isMatch('a/a', 'a/{a,b}'));
    assert(isMatch('a/b', 'a/{a,b}'));
    assert(isMatch('a/c', 'a/{a,b,c}'));
  });

  it('should support brace ranges', () => {
    assert(isMatch('a/a', 'a/{a..c}'));
    assert(isMatch('a/b', 'a/{a..c}'));
    assert(isMatch('a/c', 'a/{a..c}'));
  });

  it('should support Kleene stars', () => {
    assert(isMatch('ab', '{ab,c}*'));
    assert(isMatch('abab', '{ab,c}*'));
    assert(isMatch('abc', '{ab,c}*'));
    assert(isMatch('c', '{ab,c}*'));
    assert(isMatch('cab', '{ab,c}*'));
    assert(isMatch('cc', '{ab,c}*'));
    assert(isMatch('ababab', '{ab,c}*'));
    assert(isMatch('ababc', '{ab,c}*'));
    assert(isMatch('abcab', '{ab,c}*'));
    assert(isMatch('abcc', '{ab,c}*'));
    assert(isMatch('cabab', '{ab,c}*'));
    assert(isMatch('cabc', '{ab,c}*'));
    assert(isMatch('ccab', '{ab,c}*'));
    assert(isMatch('ccc', '{ab,c}*'));
  });

  it('should not convert braces inside brackets', () => {
    assert(isMatch('foo{}baz', 'foo[{a,b}]+baz'));
    assert(isMatch('{a}{b}{c}', '[abc{}]+'));
  });

  it('should support braces containing slashes', () => {
    assert(isMatch('a', '{/,}a/**'));
    assert(isMatch('aa.txt', 'a{a,b/}*.txt'));
    assert(isMatch('ab/.txt', 'a{a,b/}*.txt'));
    assert(isMatch('ab/a.txt', 'a{a,b/}*.txt'));
    assert(isMatch('a/', 'a/**{/,}'));
    assert(isMatch('a/a', 'a/**{/,}'));
    assert(isMatch('a/a/', 'a/**{/,}'));
  });

  it('should support braces with empty elements', () => {
    assert(!isMatch('abc.txt', 'a{,b}.txt'));
    assert(!isMatch('abc.txt', 'a{a,b,}.txt'));
    assert(!isMatch('abc.txt', 'a{b,}.txt'));
    assert(isMatch('a.txt', 'a{,b}.txt'));
    assert(isMatch('a.txt', 'a{b,}.txt'));
    assert(isMatch('aa.txt', 'a{a,b,}.txt'));
    assert(isMatch('aa.txt', 'a{a,b,}.txt'));
    assert(isMatch('ab.txt', 'a{,b}.txt'));
    assert(isMatch('ab.txt', 'a{b,}.txt'));
  });

  it('should support braces with slashes and empty elements', () => {
    assert(isMatch('a.txt', 'a{,/}*.txt'));
    assert(isMatch('ab.txt', 'a{,/}*.txt'));
    assert(isMatch('a/b.txt', 'a{,/}*.txt'));
    assert(isMatch('a/ab.txt', 'a{,/}*.txt'));
  });

  it('should support braces with stars', () => {
    assert(isMatch('a.txt', 'a{,.*{foo,db},\\(bar\\)}.txt'));
    assert(!isMatch('adb.txt', 'a{,.*{foo,db},\\(bar\\)}.txt'));
    assert(isMatch('a.db.txt', 'a{,.*{foo,db},\\(bar\\)}.txt'));

    assert(isMatch('a.txt', 'a{,*.{foo,db},\\(bar\\)}.txt'));
    assert(!isMatch('adb.txt', 'a{,*.{foo,db},\\(bar\\)}.txt'));
    assert(isMatch('a.db.txt', 'a{,*.{foo,db},\\(bar\\)}.txt'));

    assert(isMatch('a', 'a{,.*{foo,db},\\(bar\\)}'));
    assert(!isMatch('adb', 'a{,.*{foo,db},\\(bar\\)}'));
    assert(isMatch('a.db', 'a{,.*{foo,db},\\(bar\\)}'));

    assert(isMatch('a', 'a{,*.{foo,db},\\(bar\\)}'));
    assert(!isMatch('adb', 'a{,*.{foo,db},\\(bar\\)}'));
    assert(isMatch('a.db', 'a{,*.{foo,db},\\(bar\\)}'));

    assert(!isMatch('a', '{,.*{foo,db},\\(bar\\)}'));
    assert(!isMatch('adb', '{,.*{foo,db},\\(bar\\)}'));
    assert(!isMatch('a.db', '{,.*{foo,db},\\(bar\\)}'));
    assert(isMatch('.db', '{,.*{foo,db},\\(bar\\)}'));

    assert(!isMatch('a', '{,*.{foo,db},\\(bar\\)}'));
    assert(isMatch('a', '{*,*.{foo,db},\\(bar\\)}'));
    assert(!isMatch('adb', '{,*.{foo,db},\\(bar\\)}'));
    assert(isMatch('a.db', '{,*.{foo,db},\\(bar\\)}'));
  });

  it('should support braces in patterns with globstars', () => {
    assert(!isMatch('a/b/c/xyz.md', 'a/b/**/c{d,e}/**/xyz.md'));
    assert(!isMatch('a/b/d/xyz.md', 'a/b/**/c{d,e}/**/xyz.md'));
    assert(isMatch('a/b/cd/xyz.md', 'a/b/**/c{d,e}/**/xyz.md'));
    assert(isMatch('a/b/c/xyz.md', 'a/b/**/{c,d,e}/**/xyz.md'));
    assert(isMatch('a/b/d/xyz.md', 'a/b/**/{c,d,e}/**/xyz.md'));
  });

  it('should support braces with globstars, slashes and empty elements', () => {
    assert(isMatch('a.txt', 'a{,/**/}*.txt'));
    assert(isMatch('a/b.txt', 'a{,/**/,/}*.txt'));
    assert(isMatch('a/x/y.txt', 'a{,/**/}*.txt'));
    assert(!isMatch('a/x/y/z', 'a{,/**/}*.txt'));
  });

  it('should support braces with globstars and empty elements', () => {
    assert(isMatch('a/b/foo/bar/baz.qux', 'a/b{,/**}/bar{,/**}/*.*'));
    assert(isMatch('a/b/bar/baz.qux', 'a/b{,/**}/bar{,/**}/*.*'));
  });

  it('should support Kleene plus', () => {
    assert(isMatch('ab', '{ab,c}+'));
    assert(isMatch('abab', '{ab,c}+'));
    assert(isMatch('abc', '{ab,c}+'));
    assert(isMatch('c', '{ab,c}+'));
    assert(isMatch('cab', '{ab,c}+'));
    assert(isMatch('cc', '{ab,c}+'));
    assert(isMatch('ababab', '{ab,c}+'));
    assert(isMatch('ababc', '{ab,c}+'));
    assert(isMatch('abcab', '{ab,c}+'));
    assert(isMatch('abcc', '{ab,c}+'));
    assert(isMatch('cabab', '{ab,c}+'));
    assert(isMatch('cabc', '{ab,c}+'));
    assert(isMatch('ccab', '{ab,c}+'));
    assert(isMatch('ccc', '{ab,c}+'));
    assert(isMatch('ccc', '{a,b,c}+'));

    assert(isMatch('a', '{a,b,c}+'));
    assert(isMatch('b', '{a,b,c}+'));
    assert(isMatch('c', '{a,b,c}+'));
    assert(isMatch('aa', '{a,b,c}+'));
    assert(isMatch('ab', '{a,b,c}+'));
    assert(isMatch('ac', '{a,b,c}+'));
    assert(isMatch('ba', '{a,b,c}+'));
    assert(isMatch('bb', '{a,b,c}+'));
    assert(isMatch('bc', '{a,b,c}+'));
    assert(isMatch('ca', '{a,b,c}+'));
    assert(isMatch('cb', '{a,b,c}+'));
    assert(isMatch('cc', '{a,b,c}+'));
    assert(isMatch('aaa', '{a,b,c}+'));
    assert(isMatch('aab', '{a,b,c}+'));
    assert(isMatch('abc', '{a,b,c}+'));
  });

  it('should support braces', () => {
    assert(isMatch('a', '{a,b,c}'));
    assert(isMatch('b', '{a,b,c}'));
    assert(isMatch('c', '{a,b,c}'));
    assert(!isMatch('aa', '{a,b,c}'));
    assert(!isMatch('bb', '{a,b,c}'));
    assert(!isMatch('cc', '{a,b,c}'));
  });

  it('should match special chars and expand ranges in parentheses', () => {
    const expandRange = (a, b) => `(${fill(a, b, { toRegex: true })})`;

    assert(!isMatch('foo/bar - 1', '*/* {4..10}', { expandRange }));
    assert(!isMatch('foo/bar - copy (1)', '*/* - * \\({4..10}\\)', { expandRange }));
    assert(!isMatch('foo/bar (1)', '*/* \\({4..10}\\)', { expandRange }));
    assert(isMatch('foo/bar (4)', '*/* \\({4..10}\\)', { expandRange }));
    assert(isMatch('foo/bar (7)', '*/* \\({4..10}\\)', { expandRange }));
    assert(!isMatch('foo/bar (42)', '*/* \\({4..10}\\)', { expandRange }));
    assert(isMatch('foo/bar (42)', '*/* \\({4..43}\\)', { expandRange }));
    assert(isMatch('foo/bar - copy [1]', '*/* \\[{0..5}\\]', { expandRange }));
    assert(isMatch('foo/bar - foo + bar - copy [1]', '*/* \\[{0..5}\\]', { expandRange }));
    assert(!isMatch('foo/bar - 1', '*/* \\({4..10}\\)', { expandRange }));
    assert(!isMatch('foo/bar - copy (1)', '*/* \\({4..10}\\)', { expandRange }));
    assert(!isMatch('foo/bar (1)', '*/* \\({4..10}\\)', { expandRange }));
    assert(isMatch('foo/bar (4)', '*/* \\({4..10}\\)', { expandRange }));
    assert(isMatch('foo/bar (7)', '*/* \\({4..10}\\)', { expandRange }));
    assert(!isMatch('foo/bar (42)', '*/* \\({4..10}\\)', { expandRange }));
    assert(!isMatch('foo/bar - copy [1]', '*/* \\({4..10}\\)', { expandRange }));
    assert(!isMatch('foo/bar - foo + bar - copy [1]', '*/* \\({4..10}\\)', { expandRange }));
  });

  it('should expand multi-digit integer ranges without a custom expandRange', () => {
    assert(isMatch('1', '{1..10}'));
    assert(isMatch('5', '{1..10}'));
    assert(isMatch('10', '{1..10}'));
    assert(!isMatch('0', '{1..10}'));
    assert(!isMatch('11', '{1..10}'));

    assert(isMatch('99', '{1..100}'));
    assert(isMatch('100', '{1..100}'));
    assert(!isMatch('101', '{1..100}'));

    assert(isMatch('app-10.log', 'app-{1..10}.log'));
    assert(!isMatch('app-01.log', 'app-{1..10}.log'));
  });

  it('should respect zero-padding widths in integer ranges', () => {
    const range = '{01..10}';

    for (const value of ['01', '02', '05', '09', '10']) {
      assert(isMatch(value, range));
    }

    assert(!isMatch('1', range));
    assert(!isMatch('00', range));
    assert(!isMatch('11', range));
    assert(!isMatch('001', range));

    assert(isMatch('app-01.log', 'app-{01..10}.log'));
    assert(isMatch('app-10.log', 'app-{01..10}.log'));
    assert(!isMatch('app-1.log', 'app-{01..10}.log'));

    assert(isMatch('001', '{001..100}'));
    assert(isMatch('050', '{001..100}'));
    assert(isMatch('100', '{001..100}'));
    assert(!isMatch('000', '{001..100}'));
    assert(!isMatch('1', '{001..100}'));
  });

  it('should support stepped integer ranges', () => {
    assert.deepStrictEqual(match(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], '{1..10..3}'), ['1', '4', '7', '10']);
    assert.deepStrictEqual(match(['1', '2', '3', '4', '5'], '{10..1..3}'), ['1', '4']);

    assert(isMatch('10', '{10..1..3}'));
    assert(isMatch('7', '{10..1..3}'));
    assert(isMatch('4', '{10..1..3}'));
    assert(isMatch('1', '{10..1..3}'));
    assert(!isMatch('8', '{10..1..3}'));

    const weekly = 'app-{1..31..7}.log';
    for (const day of [1, 8, 15, 22, 29]) {
      assert(isMatch(`app-${day}.log`, weekly));
    }

    for (const day of [2, 7, 14, 30, 31]) {
      assert(!isMatch(`app-${day}.log`, weekly));
    }

    assert.deepStrictEqual(match(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'], '{01..10..2}'), ['01', '03', '05', '07', '09']);
  });

  it('should support reverse ranges', () => {
    for (const value of ['a', 'b', 'c', 'd', 'e']) {
      assert(isMatch(value, '{e..a}'));
    }

    assert(!isMatch('f', '{e..a}'));

    for (const value of ['10', '8', '6', '4', '2']) {
      assert(isMatch(value, '{10..1..2}'));
    }

    assert(!isMatch('9', '{10..1..2}'));
  });

  it('should support single letter ranges', () => {
    for (const value of ['a', 'b', 'c', 'd', 'e']) {
      assert(isMatch(value, '{a..e}'));
    }

    assert(!isMatch('f', '{a..e}'));
    assert(!isMatch('aa', '{a..e}'));

    assert.deepStrictEqual(match(['a', 'b', 'c', 'd', 'e'], '{a..e..2}'), ['a', 'c', 'e']);
    assert(isMatch('z', '{z..z}'));
  });

  it('should support negative and crossing-zero integer ranges', () => {
    for (const value of ['-3', '-2', '-1', '0', '1', '2', '3']) {
      assert(isMatch(value, '{-3..3}'));
    }

    assert(!isMatch('-4', '{-3..3}'));
    assert(!isMatch('4', '{-3..3}'));

    for (const value of ['-03', '-02', '-01', '000', '001', '002', '003']) {
      assert(isMatch(value, '{-03..3}'));
    }

    assert(!isMatch('-3', '{-03..3}'));
    assert(!isMatch('0', '{-03..3}'));

    assert.deepStrictEqual(match(['-30', '-15', '0', '15'], '{-30..3..15}'), ['-30', '-15', '0']);
  });

  it('should compose expanded ranges with surrounding pattern parts', () => {
    assert(isMatch('a1', '{a..c}{1..3}'));
    assert(isMatch('c3', '{a..c}{1..3}'));
    assert(!isMatch('d1', '{a..c}{1..3}'));
    assert(!isMatch('a4', '{a..c}{1..3}'));

    assert(isMatch('a1b2c3', 'a{1..2}b{1..3}c{2..4}'));
    assert(!isMatch('a3b2c3', 'a{1..2}b{1..3}c{2..4}'));

    assert(isMatch('app-07/app-22.log', 'app-{01..10}/app-{01..31}.log'));
    assert(!isMatch('app-11/app-22.log', 'app-{01..10}/app-{01..31}.log'));
  });

  it('should treat invalid bash ranges as literal characters', () => {
    assert(isMatch('{a..1}', '{a..1}'));
    assert(isMatch('{1..a}', '{1..a}'));
    assert(isMatch('{1...5}', '{1...5}'));
    assert(isMatch('{..5}', '{..5}'));
    assert(isMatch('{1..}', '{1..}'));
    assert(isMatch('{z..ab}', '{z..ab}'));
    assert(isMatch('{1..10..}', '{1..10..}'));
    assert(isMatch('{1..10..a}', '{1..10..a}'));

    // Invalid ranges never behave like ranges.
    assert(!isMatch('1', '{a..1}'));
    assert(!isMatch('a', '{a..1}'));
    assert(!isMatch('10', '{1..10..a}'));
    assert.doesNotThrow(() => isMatch('whatever', '{a..1}'));
  });

  it('should keep braces literal when nobrace is enabled', () => {
    assert(isMatch('{1..10}', '{1..10}', { nobrace: true }));
    assert(!isMatch('1', '{1..10}', { nobrace: true }));
    assert(isMatch('{a..e}', '{a..e}', { nobrace: true }));
    assert(!isMatch('c', '{a..e}', { nobrace: true }));
  });

  it('should compile very large ranges to compact regular expressions', () => {
    const re = makeRe('{1..100000}');

    assert(re.source.length < 1024);
    assert(isMatch('1', '{1..100000}'));
    assert(isMatch('5000', '{1..100000}'));
    assert(isMatch('99999', '{1..100000}'));
    assert(isMatch('100000', '{1..100000}'));
    assert(!isMatch('0', '{1..100000}'));
    assert(!isMatch('100001', '{1..100000}'));

    const padded = makeRe('{000001..100000}');
    assert(padded.source.length < 1024);
    assert(isMatch('000001', '{000001..100000}'));
    assert(isMatch('100000', '{000001..100000}'));
    assert(!isMatch('1', '{000001..100000}'));

    // Large stepped ranges must not be enumerated into huge regexes.
    const stepped = makeRe('{1..1000000000..2}');
    assert(stepped.source.length < 1024);
  });

  it('should fall back to literal text for ranges that are too large to enumerate', () => {
    assert(isMatch('{1..1000000..2}', '{1..1000000..2}'));
    assert(!isMatch('4', '{1..1000000..2}'));
  });

  it('should treat mixed-case letter ranges as literal characters', () => {
    assert(isMatch('{A..e}', '{A..e}'));
    assert(!isMatch('B', '{A..e}'));
    assert(isMatch('B', '{A..E}'));
    assert(isMatch('b', '{a..e}'));
  });

  it('should defer to the expandRange option when provided', () => {
    const expandRange = (a, b) => `(${fill(a, b, { toRegex: true })})`;

    assert(isMatch('a/99', 'a/{1..100}', { expandRange }));
    assert(isMatch('a/100', 'a/{1..100}', { expandRange }));
    assert(!isMatch('a/101', 'a/{1..100}', { expandRange }));
  });
});
