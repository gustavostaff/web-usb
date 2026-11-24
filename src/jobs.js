// O que o totem manda para a térmica: cada job é um Uint8Array completo,
// enviado de uma vez (se algo falhar ao montar, nada sai pela metade).

import { renderCoupon } from './coupon_layout.js';
import { EscposEncoder } from './escpos.js';

/** Layout 1. ESC @ antes da codepage: o reset volta para a tabela padrão. */
export function couponBytes(coupon, vias = ['ballot', 'participant'], options = {}) {
  const p = new EscposEncoder().init().codepage();
  renderCoupon(p, coupon, vias, options);
  return p.bytes();
}

/** Layout 2: o mapa (ou qualquer imagem já em 1 bit) centralizado, com corte. */
export function imageBytes(bitmap) {
  const p = new EscposEncoder().init().codepage();
  p.setWithDefault({ align: 'center' });
  p.image(bitmap);
  p.setWithDefault();
  return p.cut('PART').bytes();
}

export function testPageBytes() {
  const p = new EscposEncoder().init().codepage();
  p.setWithDefault({ align: 'center', bold: true, doubleWidth: true, doubleHeight: true });
  p.textln('TESTE WebUSB');
  p.setWithDefault({ align: 'center' });
  p.textln(new Date().toLocaleString('pt-BR'));
  p.ln();
  p.setWithDefault();
  p.textln('Acentos: áàâã éê í óôõ ú ç ÁÂÃ É Í ÓÕ Ú Ç ºª');
  p.textln('-'.repeat(48));
  p.setWithDefault({ bold: true });
  p.textln('Negrito');
  p.setWithDefault({ align: 'center', invert: true });
  p.textln(' Faixa invertida ');
  p.setWithDefault({ align: 'right' });
  p.textln('Alinhado à direita');
  p.setWithDefault({ align: 'center' });
  p.qr('https://smartshub.com.br', { size: 6 });
  p.textln('QR como imagem');
  p.setWithDefault();
  return p.cut('PART').bytes();
}
