// Skener čárových kódů: kamera + BarcodeDetector (nativní, jinak WASM polyfill).

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const POLYFILL_URL = 'https://cdn.jsdelivr.net/npm/barcode-detector@2/dist/es/pure.min.js';

let detectorPromise = null;

async function createDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.length) return new window.BarcodeDetector({ formats });
    } catch { /* spadneme na polyfill */ }
  }
  const mod = await import(POLYFILL_URL);
  return new mod.BarcodeDetector({ formats: FORMATS });
}

export function getDetector() {
  detectorPromise ??= createDetector().catch((e) => {
    detectorPromise = null;
    throw e;
  });
  return detectorPromise;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Scanner {
  /**
   * @param {HTMLVideoElement} video
   * @param {(code:{rawValue:string,format:string}) => boolean} onCode vrací true, pokud byl kód přijat
   * @param {(msg:string) => void} onStatus
   */
  constructor(video, onCode, onStatus) {
    this.video = video;
    this.onCode = onCode;
    this.onStatus = onStatus;
    this.session = 0;
    this.stream = null;
    this.torchOn = false;
  }

  async start() {
    const session = ++this.session;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Kamera není dostupná (stránka musí běžet přes HTTPS).');
    }
    this.onStatus('Spouštím kameru…');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (session !== this.session) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});

    this.onStatus('Načítám čtečku…');
    const detector = await getDetector();
    if (session !== this.session) return;
    this.onStatus('Namiř na čárový kód');
    this.#loop(detector, session);
  }

  async #loop(detector, session) {
    while (session === this.session) {
      try {
        if (this.video.readyState >= 2) {
          const codes = await detector.detect(this.video);
          if (session !== this.session) return;
          for (const c of codes) {
            if (this.onCode({ rawValue: c.rawValue, format: c.format })) return;
          }
        }
      } catch { /* jednotlivý snímek může selhat */ }
      await sleep(120);
    }
  }

  get track() {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  get torchSupported() {
    return !!this.track?.getCapabilities?.().torch;
  }

  async toggleTorch() {
    if (!this.torchSupported) return false;
    this.torchOn = !this.torchOn;
    await this.track.applyConstraints({ advanced: [{ torch: this.torchOn }] }).catch(() => {});
    return this.torchOn;
  }

  stop() {
    this.session++;
    this.torchOn = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}

