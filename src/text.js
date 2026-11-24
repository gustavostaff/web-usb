// Port de print_server/text_utils.py. Conta caracteres por code point, como o
// len() do Python, para quebrar as linhas no mesmo lugar.

const REPLACEMENTS = [
  ['·', '-'],
  ['–', '-'],
  ['—', '-'],
  ['‘', "'"],
  ['’', "'"],
  ['“', '"'],
  ['”', '"'],
  ['…', '...'],
  [' ', ' '],
];

// Espaços que o str.split() do Python reconhece
// (o \s do JS inclui o U+FEFF, o do Python não)
const PY_WHITESPACE = /(?:[^\S﻿]|[\u001c-\u001f\u0085])+/u;

const chars = (text) => Array.from(text);
const len = (text) => chars(text).length;

export function clean(text) {
  let result = text == null ? '' : String(text);
  for (const [src, dst] of REPLACEMENTS) result = result.split(src).join(dst);
  return result.split(PY_WHITESPACE).filter(Boolean).join(' ');
}

/**
 * textwrap.wrap(text, width, break_long_words=True, break_on_hyphens=False),
 * depois do clean() (só espaços simples entre as palavras).
 */
export function wrap(text, width) {
  text = clean(text);
  if (!text) return [];
  const chunks = text.split(/( +)/).filter((chunk) => chunk !== '');
  chunks.reverse();
  const lines = [];
  while (chunks.length) {
    const line = [];
    let lineLen = 0;
    if (chunks[chunks.length - 1].trim() === '' && lines.length) chunks.pop();
    while (chunks.length) {
      const size = len(chunks[chunks.length - 1]);
      if (lineLen + size > width) break;
      line.push(chunks.pop());
      lineLen += size;
    }
    if (chunks.length && len(chunks[chunks.length - 1]) > width) {
      const spaceLeft = width < 1 ? 1 : width - lineLen;
      const word = chars(chunks[chunks.length - 1]);
      line.push(word.slice(0, spaceLeft).join(''));
      chunks[chunks.length - 1] = word.slice(spaceLeft).join('');
    }
    if (line.length && line[line.length - 1].trim() === '') line.pop();
    if (line.length) lines.push(line.join(''));
  }
  return lines;
}

export function labelValueLines(label, value, width, labelWidth = 9) {
  const valueWidth = Math.max(width - labelWidth, 10);
  const parts = wrap(value, valueWidth);
  if (!parts.length) parts.push('');
  const head = chars(clean(label).padEnd(labelWidth)).slice(0, labelWidth).join('');
  return [head + parts[0], ...parts.slice(1).map((part) => ' '.repeat(labelWidth) + part)];
}

export function rule(width, char = '-') {
  return char.repeat(width);
}

/** str.center(width) do Python (a sobra ímpar vai para o mesmo lado). */
export function center(text, width) {
  const size = len(text);
  if (size >= width) return text;
  const margin = width - size;
  const left = Math.floor(margin / 2) + (margin & width & 1);
  return ' '.repeat(left) + text + ' '.repeat(margin - left);
}
