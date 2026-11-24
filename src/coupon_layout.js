// Layout 1 (cupom: Via Urna + Via Participante). Port de print_server/layout.py
// e de resolve_layout em print_server/schemas.py. Mudou um, mude o outro e
// rode os testes (README.md, "Layout 1 em dois lugares"): eles comparam os bytes dos dois.
//
// Escreve num "printer" com setWithDefault, textln, ln, qr, image e cut:
// o EscposEncoder (bytes para a térmica) ou o CanvasPreview (prévia na tela).

import { center, clean, labelValueLines, rule, wrap } from './text.js';

export const VIA_ORDER = ['ballot', 'participant'];
const FOOTER = 'Tecnologia Smarts Hub - smartshub.com.br';

export const DEFAULT_SETTINGS = { paperColumns: 48, qrSize: 6 };

// Igual a BLOCK_DEFAULTS (schemas.py) e event_campaign_print_template.BLOCKS no Odoo
export const BLOCK_DEFAULTS = {
  logo: { ballot: true, participant: true },
  via_title: { ballot: true, participant: true },
  coupon_number: { ballot: true, participant: true },
  product: { ballot: true, participant: true },
  participant_data: { ballot: true, participant: true },
  draw_date: { ballot: false, participant: true },
  prize: { ballot: false, participant: true },
  how_it_works: { ballot: false, participant: true },
  regulation_summary: { ballot: true, participant: true },
  certificate: { ballot: false, participant: true },
  qr: { ballot: true, participant: true },
  contact: { ballot: false, participant: true },
  signature: { ballot: true, participant: false },
  seal: { ballot: true, participant: true },
};
const DEFAULT_QR = { ballot: 'uuid', participant: 'consult_url' };

export function resolveLayout(layout, via) {
  const given = layout?.blocks || {};
  const blocks = {};
  for (const [key, defaults] of Object.entries(BLOCK_DEFAULTS)) blocks[key] = given[key] ?? defaults[via];
  return { blocks, qrMode: layout?.qr_content || DEFAULT_QR[via] };
}

const str = (value) => (value == null ? '' : String(value));

/** Mesmos padrões do Coupon do pydantic (campo ausente = vazio). */
export function normalizeCoupon(raw = {}) {
  const prize = raw.prize || {};
  const contact = prize.contact || {};
  return {
    coupon_number: str(raw.coupon_number),
    uuid: str(raw.uuid),
    short_id: str(raw.short_id),
    qr_content: str(raw.qr_content),
    consult_url: str(raw.consult_url),
    name: str(raw.name),
    email: str(raw.email),
    phone: str(raw.phone),
    created_at: str(raw.created_at),
    device_code: str(raw.device_code),
    advertiser: str(raw.advertiser),
    product: str(raw.product),
    regulation_summary: str(raw.regulation_summary),
    prize: {
      name: str(prize.name),
      detail: str(prize.detail),
      draw_date_text: str(prize.draw_date_text),
      authorization_certificate: str(prize.authorization_certificate),
      how_it_works: (prize.how_it_works || []).map(str),
      contact: { sac: str(contact.sac), email: str(contact.email) },
    },
    layout: raw.layout || {},
    logo: str(raw.logo),
    show_powered_by: raw.show_powered_by ?? true,
  };
}

/**
 * Escreve as vias na ordem fixa (Urna, Participante), cada uma com corte parcial.
 * @param {object} options.logo bitmap já decodificado de coupon.logo
 *   ({width, height, pixels}, ver raster.js); sem ele sai o nome do anunciante
 */
export function renderCoupon(p, rawCoupon, vias, { settings = DEFAULT_SETTINGS, logo = null } = {}) {
  const coupon = normalizeCoupon(rawCoupon);
  const wanted = new Set(vias);
  for (const via of VIA_ORDER) if (wanted.has(via)) renderVia(p, coupon, via, settings, logo);
}

const normal = (p, align = 'left', bold = false) => p.setWithDefault({ align, bold });

function renderVia(p, c, via, settings, logo) {
  const width = settings.paperColumns;
  const participant = via === 'participant';
  const { blocks, qrMode } = resolveLayout(c.layout[via], via);

  if (blocks.logo) {
    normal(p, 'center');
    if (logo) {
      p.image(logo);
    } else if (c.advertiser) {
      p.setWithDefault({ align: 'center', bold: true, doubleWidth: true, doubleHeight: true });
      p.textln(clean(c.advertiser));
    }
    p.ln();
  }

  if (blocks.via_title) {
    const title = participant ? 'VIA PARTICIPANTE' : 'VIA URNA';
    if (participant) {
      normal(p, 'center', true);
      p.textln(rule(width, '='));
      p.textln(title);
      p.textln(rule(width, '='));
    } else {
      p.setWithDefault({ align: 'center', bold: true, invert: true });
      p.textln(center(title, width));
    }
    p.ln();
  }

  if (blocks.coupon_number) {
    normal(p, 'center', true);
    p.textln(participant ? 'SEU NÚMERO DA SORTE' : 'CUPOM Nº');
    p.setWithDefault({ align: 'center', bold: true, doubleWidth: true, doubleHeight: true });
    p.textln(clean(c.coupon_number));
  }
  if (blocks.product && c.product) {
    normal(p, 'center', true);
    p.textln(clean(c.product));
  }

  if (blocks.participant_data) {
    normal(p);
    p.textln(rule(width));
    for (const [label, value] of [
      ['Nome', c.name],
      ['E-mail', c.email],
      ['Celular', c.phone],
      ['Data', c.created_at],
      ['Tablet', c.device_code],
    ]) {
      if (value) for (const line of labelValueLines(label, value, width)) p.textln(line);
    }
    p.textln(rule(width));
  }

  if (blocks.draw_date) section(p, 'SORTEIO', c.prize.draw_date_text, width);
  if (blocks.prize) section(p, 'PRÊMIO', c.prize.name, width, c.prize.detail);
  if (blocks.how_it_works && c.prize.how_it_works.length) {
    normal(p, 'left', true);
    p.textln('COMO FUNCIONA');
    normal(p);
    c.prize.how_it_works.forEach((item, index) => {
      for (const line of wrap(`${index + 1}. ${item}`, width)) p.textln(line);
    });
    p.ln();
  }
  if (blocks.regulation_summary) paragraph(p, c.regulation_summary, width);
  if (blocks.certificate && c.prize.authorization_certificate) {
    paragraph(p, `Certificado de autorização SPA/MF nº ${c.prize.authorization_certificate}`, width);
  }

  // QR: ID do cadastro (apuração) ou página pública do cupom
  if (blocks.qr) {
    const consult = qrMode === 'consult_url' && Boolean(c.consult_url);
    const content = consult ? c.consult_url : c.qr_content || c.uuid;
    if (content) {
      normal(p, 'center');
      p.qr(content, { size: settings.qrSize });
    }
    normal(p, 'center');
    p.textln(consult ? 'Consulte seu cupom e o regulamento completo' : 'ID do cadastro');
    normal(p, 'center', true);
    p.textln(clean(c.short_id || Array.from(c.uuid).slice(0, 13).join('')));
    p.ln();
  }

  if (blocks.contact && (c.prize.contact.sac || c.prize.contact.email)) {
    normal(p, 'left', true);
    p.textln('CONTATO');
    normal(p);
    if (c.prize.contact.sac) p.textln(`SAC ${clean(c.prize.contact.sac)}`);
    if (c.prize.contact.email) p.textln(clean(c.prize.contact.email));
    p.ln();
  }
  if (participant) {
    normal(p, 'center', true);
    p.textln('Guarde esta via até o sorteio.');
  }
  if (blocks.signature) {
    normal(p, 'center');
    p.ln(2);
    p.textln(rule(width, '_'));
    p.textln('Assinatura do participante');
  }

  if (blocks.seal && c.show_powered_by) {
    normal(p, 'center');
    p.textln(rule(width));
    normal(p, 'center', true);
    p.textln(FOOTER);
  }
  normal(p);
  p.cut('PART');
}

function section(p, title, text, width, extra = '') {
  if (!(text || extra)) return;
  normal(p, 'left', true);
  p.textln(title);
  normal(p);
  for (const line of [...wrap(text, width), ...wrap(extra, width)]) p.textln(line);
  p.ln();
}

function paragraph(p, text, width) {
  const lines = wrap(text, width);
  if (!lines.length) return;
  normal(p);
  for (const line of lines) p.textln(line);
  p.ln();
}
