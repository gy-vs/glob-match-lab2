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

  describe('brace ranges', () => {
    it('should expand simple numeric ranges', () => {
      const re = makeRe('{1..10}');
      for (const n of [1, 2, 9, 10]) assert(re.test(String(n)));
      for (const n of [0, 11]) assert(!re.test(String(n)));
      assert(!re.test('01'));
      assert(!re.test('100'));

      assert(isMatch('5', '{1..10}'));
      assert(isMatch('10', '{1..10}'));
      assert(!isMatch('0', '{1..10}'));
      assert(!isMatch('11', '{1..10}'));
    });

    it('should expand numeric ranges with a step', () => {
      const re = makeRe('{1..10..3}');
      for (const n of [1, 4, 7, 10]) assert(re.test(String(n)));
      for (const n of [2, 3, 5, 6, 8, 9, 11]) assert(!re.test(String(n)));

      assert(isMatch('0', '{0..30..10}'));
      assert(isMatch('20', '{0..30..10}'));
      assert(isMatch('30', '{0..30..10}'));
      assert(!isMatch('15', '{0..30..10}'));
      assert(!isMatch('40', '{0..30..10}'));
    });

    it('should expand descending numeric ranges', () => {
      const re = makeRe('{10..1}');
      for (const n of [1, 5, 10]) assert(re.test(String(n)));
      assert(!re.test('0'));
      assert(!re.test('11'));

      const stepped = makeRe('{10..1..3}');
      for (const n of [10, 7, 4, 1]) assert(stepped.test(String(n)));
      for (const n of [9, 8, 6]) assert(!stepped.test(String(n)));
    });

    it('should expand zero-padded numeric ranges', () => {
      const re = makeRe('{01..10}');
      for (const n of ['01', '02', '09', '10']) assert(re.test(n));
      for (const n of ['1', '001', '11', '00']) assert(!re.test(n));

      assert(isMatch('app-07.log', 'app-{01..31}.log'));
      assert(isMatch('app-31.log', 'app-{01..31}.log'));
      assert(!isMatch('app-7.log', 'app-{01..31}.log'));
      assert(!isMatch('app-32.log', 'app-{01..31}.log'));
      assert(!isMatch('app-00.log', 'app-{01..31}.log'));
    });

    it('should support padding with a step (e.g. weekly log sampling)', () => {
      for (const day of ['01', '08', '15', '22', '29']) {
        assert(isMatch(`app-${day}.log`, 'app-{01..31..7}.log'));
      }
      for (const day of ['1', '07', '14', '21', '28', '30', '31']) {
        assert(!isMatch(`app-${day}.log`, 'app-{01..31..7}.log'));
      }

      const down = makeRe('{31..01..7}');
      for (const n of ['31', '24', '17', '10', '03']) assert(down.test(n));
      assert(!down.test('01'));
    });

    it('should expand single letter ranges', () => {
      assert(isMatch('a', '{a..e}'));
      assert(isMatch('c', '{a..e}'));
      assert(isMatch('e', '{a..e}'));
      assert(!isMatch('f', '{a..e}'));
      assert(!isMatch('A', '{a..e}'));

      assert(isMatch('z', '{z..a}'));
      assert(isMatch('m', '{z..a}'));
      assert(!isMatch('aa', '{z..a}'));
    });

    it('should expand stepped letter ranges', () => {
      const re = makeRe('{a..e..2}');
      for (const c of ['a', 'c', 'e']) assert(re.test(c));
      for (const c of ['b', 'd', 'f']) assert(!re.test(c));

      const down = makeRe('{z..a..2}');
      for (const c of 'zxvtrpnljhfdb') assert(down.test(c));
      for (const c of 'ywusqokigeca') assert(!down.test(c));
    });

    it('should support negative numbers', () => {
      const re = makeRe('{-3..3}');
      for (const n of ['-3', '-1', '0', '1', '3']) assert(re.test(n));
      for (const n of ['-4', '4', '-03']) assert(!re.test(n));

      const stepped = makeRe('{-10..-1..2}');
      for (const n of ['-10', '-8', '-2']) assert(stepped.test(n));
      for (const n of ['-9', '-1', '0']) assert(!stepped.test(n));
    });

    it('should treat a step of 0 as step 1', () => {
      assert(isMatch('5', '{1..10..0}'));
      assert(isMatch('c', '{a..e..0}'));
      assert(!isMatch('11', '{1..10..0}'));
    });

    it('should ignore the sign of the step (direction comes from endpoints)', () => {
      const up = makeRe('{1..10..-3}');
      for (const n of [1, 4, 7, 10]) assert(up.test(String(n)));
      const down = makeRe('{10..1..-3}');
      for (const n of [10, 7, 4, 1]) assert(down.test(String(n)));
    });

    it('should concatenate expanded ranges with surrounding pattern parts', () => {
      assert(isMatch('x1y', 'x{1..3}y'));
      assert(isMatch('x3y', 'x{1..3}y'));
      assert(!isMatch('x4y', 'x{1..3}y'));
      assert(!isMatch('xy', 'x{1..3}y'));

      assert(isMatch('dir/app-15.log', 'dir/app-{01..31}.log'));
    });

    it('should support multiple ranges in one pattern', () => {
      assert(isMatch('1a', '{1..3}{a..c}'));
      assert(isMatch('3c', '{1..3}{a..c}'));
      assert(!isMatch('4a', '{1..3}{a..c}'));
      assert(!isMatch('1d', '{1..3}{a..c}'));
      assert(isMatch('a1b2c', 'a{1..3}b{2..4}c'));
      assert(!isMatch('a4b2c', 'a{1..3}b{2..4}c'));
      assert(!isMatch('a1b5c', 'a{1..3}b{2..4}c'));
    });

    it('should support ranges alongside brace alternatives', () => {
      assert(isMatch('1,a', '{1..3},{a..b}'));
      assert(isMatch('3,b', '{1..3},{a..b}'));
      assert(!isMatch('4,a', '{1..3},{a..b}'));
    });

    it('should treat invalid ranges as literal text without throwing', () => {
      const invalid = [
        '{1..a}',
        '{a..1}',
        '{1..}',
        '{..10}',
        '{1...5}',
        '{1..3,a}',
        '{a..f..}',
        '{1..10..abc}',
        '{1..10..2.5}',
        '{..}',
        '{aa..ac}',
        '{1..2..3..4}',
        '{1....10}'
      ];

      for (const pattern of invalid) {
        const re = makeRe(pattern);
        assert(re.test(pattern), `${pattern} should match itself (${re.source})`);
        assert.doesNotThrow(() => isMatch('anything', pattern));
      }

      assert(isMatch('a/{1...5}/b', 'a/{1...5}/b'));
      assert(!isMatch('a/1...5/b', 'a/{1...5}/b'));
      assert(!isMatch('a/{1}/b', 'a/{1...5}/b'));

      // values beyond JavaScript's safe integer range are left literal
      assert(isMatch('{1..999999999999999999999999999999}', '{1..999999999999999999999999999999}'));

      // escaped characters inside braces prevent range expansion
      assert(isMatch(String.raw`{1\..10}`, String.raw`{1\..10}`));
    });

    it('should compile very large ranges to a compact regex', () => {
      const re = makeRe('{1..100000}');
      assert(re.source.length < 5000, `expected compact regex, got ${re.source.length} chars`);
      assert(re.test('1'));
      assert(re.test('50001'));
      assert(re.test('100000'));
      assert(!re.test('0'));
      assert(!re.test('100001'));
      assert(!re.test('001'));

      const padded = makeRe('{00001..10000}');
      assert(padded.source.length < 5000);
      assert(padded.test('00001'));
      assert(padded.test('10000'));
      assert(!padded.test('00000'));
      assert(!padded.test('5000'));
    });

    it('should compile large stepped ranges correctly and compactly', () => {
      const re = makeRe('{1..100000..7}');
      assert(re.source.length < 100000, `regex too large: ${re.source.length}`);
      assert(re.test('1'));
      assert(re.test('99996')); // 1 + 14285*7
      assert(!re.test('2'));
      assert(!re.test('100000'));
    });

    it('should not hang or blow up memory on pathological ranges', () => {
      const start = Date.now();
      assert.throws(() => makeRe('{1..1000000000000..999}'), /too large/);
      assert(Date.now() - start < 1000);
    });

    it('should keep braces literal when nobrace is enabled', () => {
      assert(isMatch('{1..10}', '{1..10}', { nobrace: true }));
      assert(!isMatch('5', '{1..10}', { nobrace: true }));
      assert(isMatch('{a..e}', '{a..e}', { nobrace: true }));
      assert(!isMatch('c', '{a..e}', { nobrace: true }));
    });

    it('should use a custom expandRange option when provided', () => {
      assert(isMatch('a/c', 'a/{a..c}', { expandRange: (a, b) => `([${a}-${b}])` }));
      assert(!isMatch('a/z', 'a/{a..c}', { expandRange: (a, b) => `([${a}-${b}])` }));
      assert(isMatch('a/99', 'a/{1..100}', {
        expandRange(a, b) {
          return `(${fill(a, b, { toRegex: true })})`;
        }
      }));

      let args;
      makeRe('{1..10..3}', {
        expandRange(...rest) {
          args = rest.slice(0, -1);
          return 'x';
        }
      });
      assert.deepStrictEqual(args, ['1', '10', '3']);
    });
  });
});
