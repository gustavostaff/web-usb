// Imagem (logo, mapa do layout 2) para bitmap de 1 bit: {width, height,
// pixels}, um byte por ponto, 1 = preto. Só no navegador (usa canvas).

export const PAPER_WIDTH_PX = 576; // 80 mm a 203 dpi (área útil 72 mm)

/** Cinza como o convert("L") do Pillow. */
const luma = (r, g, b) => (r * 19595 + g * 38470 + b * 7471 + 0x8000) >> 16;

/**
 * @param {CanvasImageSource} source img, canvas, ImageBitmap…
 * @param {object} options
 *   width: largura final em pontos (padrão: a da imagem, até 576)
 *   dither: true = Floyd–Steinberg (fotos, mapa); false = limiar (logo P&B)
 *   contrast: 1 = original; >1 realça (mapas em tons claros somem na térmica)
 */
export function toBitmap(source, { width, dither = false, contrast = 1, threshold = 128 } = {}) {
  const srcWidth = source.naturalWidth || source.videoWidth || source.width;
  const srcHeight = source.naturalHeight || source.videoHeight || source.height;
  const targetWidth = Math.round(width || Math.min(srcWidth, PAPER_WIDTH_PX));
  const targetHeight = Math.max(1, Math.round((srcHeight * targetWidth) / srcWidth));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; // transparência vira papel
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);

  const size = targetWidth * targetHeight;
  const gray = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const value = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    gray[i] = Math.min(255, Math.max(0, (value - 128) * contrast + 128));
  }

  const pixels = new Uint8Array(size);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const i = y * targetWidth + x;
      const black = gray[i] < threshold;
      pixels[i] = black ? 1 : 0;
      if (!dither) continue;
      const error = gray[i] - (black ? 0 : 255);
      if (x + 1 < targetWidth) gray[i + 1] += (error * 7) / 16;
      if (y + 1 < targetHeight) {
        if (x > 0) gray[i + targetWidth - 1] += (error * 3) / 16;
        gray[i + targetWidth] += (error * 5) / 16;
        if (x + 1 < targetWidth) gray[i + targetWidth + 1] += error / 16;
      }
    }
  }
  return { width: targetWidth, height: targetHeight, pixels };
}

/** PNG em base64 (coupon.logo, já P&B no Odoo) para bitmap; null se inválido. */
export async function decodeLogo(base64) {
  if (!base64) return null;
  try {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const image = await createImageBitmap(blob);
    // Mesmo tamanho da imagem, como o python-escpos (não redimensiona)
    return toBitmap(image, { width: image.width });
  } catch (error) {
    console.warn('Logo do cupom inválido, usando o nome do anunciante', error);
    return null;
  }
}

export async function loadImageFile(file) {
  return createImageBitmap(file);
}

/** Bitmap para canvas (prévia exatamente como vai para a térmica). */
export function bitmapToCanvas(bitmap, canvas = document.createElement('canvas')) {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(bitmap.width, bitmap.height);
  for (let i = 0; i < bitmap.pixels.length; i++) {
    const value = bitmap.pixels[i] ? 0 : 255;
    image.data.set([value, value, value, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
