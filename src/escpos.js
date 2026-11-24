// Gera os mesmos bytes que o python-escpos 3.1 (Dummy) gera para os comandos
// que o layout usa. Os testes em tests/ comparam byte a byte com o print server.

import qrcode from '../vendor/qrcode.js';

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; // como o qrcode do Python

const ESC = 0x1b;
const GS = 0x1d;

// PC850 (ESC t 2): bytes 0x80-0xFF
const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';
const CP850 = new Map(Array.from(CP850_HIGH, (char, index) => [char, 0x80 + index]));

const ALIGN = { left: 0, center: 1, right: 2 };

// Imagens mais altas que isto saem em mais de um GS v 0 (padrão do python-escpos)
const FRAGMENT_HEIGHT = 960;

export class EscposEncoder {
  constructor() {
    this.chunks = [];
  }

  raw(bytes) {
    this.chunks.push(Uint8Array.from(bytes));
    return this;
  }

  /** ESC @: zera formatação e codepage do cupom anterior. */
  init() {
    return this.raw([ESC, 0x40]);
  }

  /** Só PC850 (o mesmo do print server): ESC t 2. */
  codepage() {
    return this.raw([ESC, 0x74, 0x02]);
  }

  setWithDefault({ align = 'left', bold = false, doubleWidth = false, doubleHeight = false, invert = false } = {}) {
    const size = (doubleWidth ? 0x20 : 0) | (doubleHeight ? 0x10 : 0);
    return this.raw([
      ESC, 0x21, 0x00, ESC, 0x21, 0x00, ESC, 0x21, size,
      ESC, 0x7b, 0x00, // sem inverter de cabeça para baixo
      GS, 0x62, 0x00, // sem suavização
      ESC, 0x45, bold ? 1 : 0,
      ESC, 0x2d, 0x00, // sem sublinhado
      ESC, 0x4d, 0x00, // fonte A
      ESC, 0x61, ALIGN[align] ?? 0,
      GS, 0x42, invert ? 1 : 0, // branco no preto
    ]);
  }

  text(txt) {
    const bytes = [];
    for (const char of String(txt)) {
      const code = char.codePointAt(0);
      bytes.push(code < 0x80 ? code : CP850.get(char) ?? 0x3f);
    }
    return this.raw(bytes);
  }

  textln(txt = '') {
    return this.text(`${txt}\n`);
  }

  ln(count = 1) {
    return count > 0 ? this.text('\n'.repeat(count)) : this;
  }

  /** QR como imagem, como o python-escpos com native=False (nível L, borda de 1 módulo). */
  qr(content, { size = 3 } = {}) {
    const code = qrcode(0, 'L');
    code.addData(String(content), 'Byte');
    code.make();
    const modules = code.getModuleCount() + 2;
    const width = modules * size;
    const pixels = new Uint8Array(width * width);
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const row = Math.floor(y / size) - 1;
        const col = Math.floor(x / size) - 1;
        const inside = row >= 0 && col >= 0 && row < modules - 2 && col < modules - 2;
        pixels[y * width + x] = inside && code.isDark(row, col) ? 1 : 0;
      }
    }
    this.text('\n');
    this.image({ width, height: width, pixels });
    return this.text('\n').text('\n');
  }

  /**
   * GS v 0 (raster). bitmap = {width, height, pixels}: um byte por ponto,
   * 1 = preto. Centralizar é com o ESC a de antes (como no print server).
   */
  image(bitmap) {
    for (let top = 0; top < bitmap.height; top += FRAGMENT_HEIGHT) {
      const height = Math.min(FRAGMENT_HEIGHT, bitmap.height - top);
      const widthBytes = (bitmap.width + 7) >> 3;
      const data = new Uint8Array(8 + widthBytes * height);
      data.set([GS, 0x76, 0x30, 0x00, widthBytes & 0xff, widthBytes >> 8, height & 0xff, height >> 8]);
      for (let y = 0; y < height; y++) {
        const source = (top + y) * bitmap.width;
        const target = 8 + y * widthBytes;
        for (let x = 0; x < bitmap.width; x++) {
          if (bitmap.pixels[source + x]) data[target + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
      this.chunks.push(data);
    }
    return this;
  }

  /** Avança 6 linhas e corta (parcial: ESC d 6, GS V 1). */
  cut(mode = 'PART') {
    return this.raw([ESC, 0x64, 0x06, GS, 0x56, mode === 'PART' ? 1 : 0]);
  }

  bytes() {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
}
