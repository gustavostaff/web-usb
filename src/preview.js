// Prévia do layout na tela, simulando a bobina de 80 mm. Port de
// print_server/preview.py: mesmos comandos do EscposEncoder, desenhados num
// canvas, então a prévia sai do mesmo código de layout que vai para a térmica.

import qrcode from '../vendor/qrcode.js';
import { bitmapToCanvas } from './raster.js';

const MONO_ADVANCE = 0.602; // largura do caractere da DejaVu Sans Mono, em "em"
const MARGIN_Y = 24;
const FONT_URL = new URL('../fonts/', import.meta.url);

let fontsReady = null;

/** Carrega a DejaVu Sans Mono (a mesma da prévia do print server). */
export function loadPreviewFonts() {
  fontsReady ||= Promise.all([
    new FontFace('PreviewMono', `url(${new URL('DejaVuSansMono.ttf', FONT_URL)})`, { weight: '400' }).load(),
    new FontFace('PreviewMono', `url(${new URL('DejaVuSansMono-Bold.ttf', FONT_URL)})`, { weight: '700' }).load(),
  ]).then((faces) => faces.forEach((face) => document.fonts.add(face)));
  return fontsReady;
}

export class CanvasPreview {
  constructor({ width = 576, columns = 48 } = {}) {
    this.width = width;
    this.size = width / columns / MONO_ADVANCE;
    this.lineHeight = Math.round(this.size * 1.25);
    this.segments = [];
    this.newSegment();
    this.setWithDefault();
  }

  setWithDefault({ align = 'left', bold = false, doubleWidth = false, doubleHeight = false, invert = false } = {}) {
    this.align = align;
    this.bold = bold;
    this.double = doubleWidth || doubleHeight;
    this.invert = invert;
  }

  textln(txt = '') {
    const ctx = this.ctx;
    ctx.font = `${this.bold ? 700 : 400} ${this.size * (this.double ? 2 : 1)}px PreviewMono`;
    ctx.textBaseline = 'top';
    const height = this.lineHeight * (this.double ? 2 : 1);
    const x = this.xFor(ctx.measureText(txt).width);
    if (this.invert) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, this.y, this.width, height);
    }
    ctx.fillStyle = this.invert ? '#fff' : '#000';
    ctx.fillText(txt, x, this.y);
    this.y += height;
  }

  ln(count = 1) {
    this.y += this.lineHeight * count;
  }

  qr(content, { size = 3 } = {}) {
    const code = qrcode(0, 'L');
    code.addData(String(content), 'Byte');
    code.make();
    const count = code.getModuleCount();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = count * size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (code.isDark(r, c)) ctx.fillRect(c * size, r * size, size, size);
    }
    this.paste(canvas);
  }

  image(bitmap) {
    this.paste(bitmapToCanvas(bitmap));
  }

  cut() {
    this.finishSegment();
    this.newSegment();
  }

  /** Um canvas por via (o corte separa as vias). */
  canvases() {
    this.finishSegment(true);
    return this.segments;
  }

  newSegment() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = 4000;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, this.width, this.canvas.height);
    this.y = MARGIN_Y;
  }

  finishSegment(onlyIfContent = false) {
    if (onlyIfContent && this.y <= MARGIN_Y) return;
    const out = document.createElement('canvas');
    out.width = this.width;
    out.height = this.y + MARGIN_Y;
    out.getContext('2d').drawImage(this.canvas, 0, 0);
    this.segments.push(out);
  }

  xFor(contentWidth) {
    if (this.align === 'center') return Math.max(Math.floor((this.width - contentWidth) / 2), 0);
    if (this.align === 'right') return Math.max(this.width - contentWidth, 0);
    return 0;
  }

  paste(source) {
    const x = Math.floor((this.width - source.width) / 2);
    this.ctx.drawImage(source, Math.max(x, 0), this.y);
    this.y += source.height + Math.floor(this.lineHeight / 2);
  }
}
