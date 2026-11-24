import { renderCoupon } from './src/coupon_layout.js';
import { couponBytes, imageBytes, testPageBytes } from './src/jobs.js';
import { CanvasPreview, loadPreviewFonts } from './src/preview.js';
import { bitmapToCanvas, decodeLogo, loadImageFile, toBitmap } from './src/raster.js';
import { WebUsbPrinter } from './src/webusb.js';

const $ = (selector) => document.querySelector(selector);
const printer = new WebUsbPrinter();
let mapBitmap = null;
let mapSource = null;

function log(message, level = 'info') {
  const line = `${new Date().toLocaleTimeString('pt-BR')}  ${message}`;
  $('#log').textContent = `${line}\n${$('#log').textContent}`;
  (level === 'error' ? console.error : console.log)(message);
}

async function run(label, action) {
  try {
    await action();
  } catch (error) {
    log(`${label}: ${error.message}`, 'error');
  }
}

// ------------------------------------------------------------------
// Ambiente: mostra na hora se o navegador do totem serve
// ------------------------------------------------------------------

function showEnvironment() {
  const checks = [
    [window.isSecureContext, 'Contexto seguro (HTTPS ou localhost)'],
    ['usb' in navigator, 'navigator.usb disponível (Chrome; WebView não tem)'],
  ];
  $('#env').innerHTML = '';
  for (const [ok, text] of checks) {
    const item = document.createElement('li');
    item.textContent = text;
    item.classList.toggle('bad', !ok);
    $('#env').append(item);
  }
  const ua = document.createElement('li');
  ua.textContent = navigator.userAgent;
  $('#env').append(ua);
}

// ------------------------------------------------------------------
// Impressora
// ------------------------------------------------------------------

function refreshPrinter() {
  const info = printer.info();
  const connected = printer.connected;
  $('#printer-state').textContent = connected
    ? `Conectada: ${info.name} (${info.id}) · interface ${info.interfaceNumber}, OUT ${info.endpointOut}, IN ${info.endpointIn ?? '—'}`
    : 'Desconectada';
  $('#printer-state').classList.toggle('ok', connected);
  for (const id of ['#test-page', '#paper', '#disconnect', '#coupon-print', '#raw-print']) $(id).disabled = !connected;
  $('#map-print').disabled = !connected || !mapBitmap;
  $('#paper').disabled = !connected || printer.endpointIn == null;
}

printer.addEventListener('connect', () => {
  log(`Impressora conectada: ${printer.info().name}`);
  refreshPrinter();
});
printer.addEventListener('disconnect', () => {
  log('Impressora desconectada (cabo ou energia)', 'error');
  refreshPrinter();
});

async function print(label, bytes) {
  const started = performance.now();
  await printer.print(bytes);
  log(`${label}: ${bytes.length} bytes enviados em ${Math.round(performance.now() - started)} ms`);
}

$('#connect').addEventListener('click', () => run('Conectar', () => printer.request()));
$('#disconnect').addEventListener('click', () => run('Desconectar', async () => {
  await printer.close();
  refreshPrinter();
}));
$('#test-page').addEventListener('click', () => run('Teste rápido', () => print('Teste rápido', testPageBytes())));
$('#paper').addEventListener('click', () => run('Status do papel', async () => {
  const status = await printer.paperStatus();
  if (!status) log('Status do papel: a impressora não respondeu (nem toda térmica responde pelo USB)');
  else log(`Status do papel: ${status.paper ? (status.nearEnd ? 'perto do fim' : 'ok') : 'SEM PAPEL'} (0x${status.raw.toString(16)})`);
}));

// ------------------------------------------------------------------
// Layout 1
// ------------------------------------------------------------------

function couponInput() {
  const coupon = JSON.parse($('#coupon').value);
  const vias = [...document.querySelectorAll('input[name=via]:checked')].map((el) => el.value);
  if (!vias.length) throw new Error('Escolha ao menos uma via');
  return { coupon, vias };
}

async function previewCoupon() {
  const { coupon, vias } = couponInput();
  await loadPreviewFonts();
  const preview = new CanvasPreview();
  renderCoupon(preview, coupon, vias, { logo: await decodeLogo(coupon.logo) });
  $('#coupon-previews').replaceChildren(...preview.canvases());
}

$('#coupon-preview').addEventListener('click', () => run('Prévia', previewCoupon));
$('#coupon-print').addEventListener('click', () => run('Cupom', async () => {
  const { coupon, vias } = couponInput();
  const bytes = couponBytes(coupon, vias, { logo: await decodeLogo(coupon.logo) });
  await print(`Cupom ${coupon.coupon_number}`, bytes);
}));

// ------------------------------------------------------------------
// Layout 2
// ------------------------------------------------------------------

function renderMap() {
  if (!mapSource) return;
  mapBitmap = toBitmap(mapSource, {
    width: 576,
    dither: $('#map-dither').checked,
    contrast: Number($('#map-contrast').value),
  });
  const canvas = bitmapToCanvas(mapBitmap, $('#map-preview'));
  canvas.hidden = false;
  refreshPrinter();
}

$('#map-file').addEventListener('change', (event) => run('Imagem', async () => {
  const file = event.target.files[0];
  if (!file) return;
  mapSource = await loadImageFile(file);
  renderMap();
  log(`Imagem ${file.name}: ${mapBitmap.width} × ${mapBitmap.height} pontos (${(mapBitmap.height / 8).toFixed(0)} mm de papel)`);
}));
$('#map-dither').addEventListener('change', renderMap);
$('#map-contrast').addEventListener('input', () => {
  $('#map-contrast-value').textContent = $('#map-contrast').value;
  renderMap();
});
$('#map-print').addEventListener('click', () => run('Imagem', () => print('Mapa', imageBytes(mapBitmap))));

// ------------------------------------------------------------------
// Bytes prontos
// ------------------------------------------------------------------

$('#raw-print').addEventListener('click', () => run('Arquivo', async () => {
  const file = $('#raw-file').files[0];
  if (!file) throw new Error('Escolha um arquivo .bin');
  await print(file.name, new Uint8Array(await file.arrayBuffer()));
}));

// ------------------------------------------------------------------

async function start() {
  showEnvironment();
  const cases = await (await fetch('tests/cases.json')).json();
  $('#coupon').value = JSON.stringify(cases[0].coupon, null, 2);
  refreshPrinter();
  await run('Prévia', previewCoupon);
  if (!WebUsbPrinter.supported()) {
    log('WebUSB indisponível neste navegador/endereço: veja "Ambiente"', 'error');
    $('#connect').disabled = true;
    return;
  }
  // Já autorizada antes: conecta sem perguntar (é o que o totem faria ao abrir)
  await run('Reconectar', async () => {
    if (!(await printer.reconnect())) log('Nenhuma impressora autorizada ainda: toque em "Conectar impressora"');
  });
}

start();
