// Térmica ligada no USB do totem, pelo WebUSB do Chrome. Só funciona em
// contexto seguro (HTTPS ou localhost), na página: o service worker não tem
// navigator.usb.
//
// Na instalação, alguém toca em "Conectar" uma vez e escolhe a impressora
// (requestDevice exige gesto). Depois o Chrome lembra a permissão: reconnect()
// acha a impressora sozinho ao abrir a página e quando ela é religada.

const PRINTER_CLASS = 0x07; // USB Printer Class; muitas térmicas usam 0xff (do fabricante)
const CHUNK_BYTES = 4096;
const STATUS_TIMEOUT_MS = 1500;

export class PrinterError extends Error {}

export class WebUsbPrinter extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.interfaceNumber = null;
    this.endpointOut = null;
    this.endpointIn = null;
    this.reading = false; // transferIn sem resposta não se cancela: não empilha outro
    this.queue = Promise.resolve();
    if (WebUsbPrinter.supported()) {
      navigator.usb.addEventListener('disconnect', (event) => {
        if (event.device !== this.device) return;
        this.reset();
        this.emit('disconnect');
      });
      navigator.usb.addEventListener('connect', () => this.reconnect().catch(() => {}));
    }
  }

  static supported() {
    return typeof navigator !== 'undefined' && 'usb' in navigator && window.isSecureContext;
  }

  get connected() {
    return Boolean(this.device?.opened && this.endpointOut);
  }

  /** Abre o seletor do Chrome. Chame a partir de um toque/clique. */
  async request() {
    if (!WebUsbPrinter.supported()) throw new PrinterError('WebUSB indisponível (precisa de Chrome e HTTPS/localhost)');
    let device;
    try {
      device = await navigator.usb.requestDevice({ filters: [] });
    } catch (error) {
      if (error.name === 'NotFoundError') throw new PrinterError('Nenhuma impressora escolhida');
      throw error;
    }
    await this.open(device);
    return this.info();
  }

  /** Impressora já autorizada antes: conecta sem perguntar. null se não há. */
  async reconnect() {
    if (!WebUsbPrinter.supported() || this.connected) return this.connected ? this.info() : null;
    const devices = await navigator.usb.getDevices();
    const device = devices.find((d) => findEndpoints(d)) || devices[0];
    if (!device) return null;
    await this.open(device);
    return this.info();
  }

  async open(device) {
    this.reset();
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    const found = findEndpoints(device);
    if (!found) {
      await device.close().catch(() => {});
      throw new PrinterError('O aparelho escolhido não tem saída USB de impressora (endpoint bulk OUT)');
    }
    try {
      await device.claimInterface(found.interfaceNumber);
      if (found.alternateSetting) await device.selectAlternateInterface(found.interfaceNumber, found.alternateSetting);
    } catch (error) {
      await device.close().catch(() => {});
      throw new PrinterError(
        `Não foi possível usar a impressora (${error.message}). No Linux, o driver usblp pode estar com ela: veja o README.`
      );
    }
    Object.assign(this, { device, ...found });
    this.emit('connect');
  }

  info() {
    const d = this.device;
    if (!d) return null;
    const hex = (n) => n.toString(16).padStart(4, '0');
    return {
      name: [d.manufacturerName, d.productName].filter(Boolean).join(' ') || 'Impressora USB',
      id: `${hex(d.vendorId)}:${hex(d.productId)}`,
      serial: d.serialNumber || '',
      interfaceNumber: this.interfaceNumber,
      endpointOut: this.endpointOut,
      endpointIn: this.endpointIn,
    };
  }

  /** Envia um job inteiro. Jobs seguidos saem em fila, sem misturar no papel. */
  print(bytes) {
    const job = this.queue.then(() => this.send(bytes));
    this.queue = job.catch(() => {});
    return job;
  }

  async send(bytes) {
    if (!this.connected) await this.reconnect();
    if (!this.connected) throw new PrinterError('Impressora não conectada');
    try {
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
        let result = await this.device.transferOut(this.endpointOut, chunk);
        if (result.status === 'stall') {
          await this.device.clearHalt('out', this.endpointOut);
          result = await this.device.transferOut(this.endpointOut, chunk);
        }
        if (result.status !== 'ok' || result.bytesWritten !== chunk.length) {
          throw new PrinterError(`Envio incompleto (${result.status}, ${result.bytesWritten}/${chunk.length} bytes)`);
        }
      }
    } catch (error) {
      // Desligada ou cabo solto no meio do envio: parte do cupom pode ter
      // saído. Não reenvia sozinho (sairia duplicado), como o print server.
      if (!(error instanceof PrinterError)) this.reset();
      throw error instanceof PrinterError ? error : new PrinterError(error.message);
    }
  }

  /**
   * Sensor de papel (DLE EOT 4). Nem toda térmica responde pelo USB.
   * @returns {Promise<{paper: boolean, nearEnd: boolean, raw: number}|null>} null = sem resposta
   */
  async paperStatus() {
    if (!this.connected || this.endpointIn == null || this.reading) return null;
    await this.print(new Uint8Array([0x10, 0x04, 0x04]));
    this.reading = true;
    const read = this.device
      .transferIn(this.endpointIn, 64)
      .then((result) => result.data?.byteLength ? result.data.getUint8(0) : null)
      .catch(() => null)
      .finally(() => (this.reading = false));
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), STATUS_TIMEOUT_MS));
    const raw = await Promise.race([read, timeout]);
    if (raw == null) return null;
    return { paper: (raw & 0x60) === 0, nearEnd: (raw & 0x0c) !== 0, raw };
  }

  async close() {
    const device = this.device;
    this.reset();
    if (device?.opened) await device.close().catch(() => {});
  }

  reset() {
    this.device = null;
    this.endpointOut = null;
    this.endpointIn = null;
    this.interfaceNumber = null;
  }

  emit(type) {
    this.dispatchEvent(new Event(type));
  }
}

/** Interface com bulk OUT, de preferência a da classe de impressora. */
function findEndpoints(device) {
  const configs = device.configuration ? [device.configuration] : device.configurations;
  const candidates = [];
  for (const config of configs) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const out = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk');
        if (!out) continue;
        const input = alt.endpoints.find((e) => e.direction === 'in' && e.type === 'bulk');
        candidates.push({
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          endpointOut: out.endpointNumber,
          endpointIn: input ? input.endpointNumber : null,
          printerClass: alt.interfaceClass === PRINTER_CLASS,
        });
      }
    }
  }
  candidates.sort((a, b) => Number(b.printerClass) - Number(a.printerClass));
  if (!candidates.length) return null;
  const { printerClass, ...found } = candidates[0];
  return found;
}
