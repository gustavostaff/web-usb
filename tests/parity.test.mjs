// O layout 1 em JS tem que gerar os mesmos bytes que o print server (Python).
//   node --test tests/
// Fixtures: tests/make_fixtures.py (ver README.md).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { couponBytes } from '../src/jobs.js';
import { wrap } from '../src/text.js';

const here = new URL('.', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', here), 'utf-8'));

function firstDifference(a, b) {
  const size = Math.min(a.length, b.length);
  for (let i = 0; i < size; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : size;
}

const context = (bytes, at) => Buffer.from(bytes.slice(Math.max(0, at - 24), at + 24)).toString('latin1');

for (const { name, coupon, vias } of cases) {
  test(`layout 1 igual ao Python: ${name}`, () => {
    const expected = new Uint8Array(readFileSync(new URL(`fixtures/${name}.bin`, here)));
    const actual = couponBytes(coupon, vias);
    const at = firstDifference(actual, expected);
    assert.equal(
      at,
      -1,
      `difere no byte ${at} (JS ${actual.length} bytes, Python ${expected.length})\n` +
        `  JS:     ${JSON.stringify(context(actual, at))}\n  Python: ${JSON.stringify(context(expected, at))}`
    );
  });
}

test('wrap quebra palavra longa no espaço que sobra da linha (textwrap)', () => {
  assert.deepEqual(wrap('ab cdefghij', 5), ['ab cd', 'efghi', 'j']);
  assert.deepEqual(wrap('  um   dois  ', 20), ['um dois']);
  assert.deepEqual(wrap('', 10), []);
});
