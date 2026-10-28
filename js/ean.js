// Práce s kódy EAN-13 / EAN-8 / UPC-A / UPC-E.

/** Převede UPC-E (8 číslic vč. číselné soustavy a kontrolní číslice) na UPC-A (12 číslic). */
export function upcEToA(e) {
  if (!/^[01]\d{7}$/.test(e)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, c] = e;
  let m;
  switch (d6) {
    case '0': case '1': case '2': m = d1 + d2 + d6 + '0000' + d3 + d4 + d5; break;
    case '3': m = d1 + d2 + d3 + '00000' + d4 + d5; break;
    case '4': m = d1 + d2 + d3 + d4 + '00000' + d5; break;
    default: m = d1 + d2 + d3 + d4 + d5 + '0000' + d6;
  }
  return ns + m + c;
}

/**
 * Sjednotí kód na EAN-13 / EAN-8. UPC-A (12) → EAN-13 s úvodní nulou.
 * @param {string} raw
 * @param {string} [format] formát z BarcodeDetectoru (např. "upc_e")
 */
export function normalizeEan(raw, format) {
  let d = String(raw ?? '').replace(/\s/g, '');
  if (!/^\d+$/.test(d)) return null;
  if (format === 'upc_e' && d.length === 8) d = upcEToA(d) ?? d;
  if (d.length === 12) d = '0' + d;
  return d;
}

/** Kontrolní číslice GS1 (váhy 3,1,3,… zprava). */
export function checkDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = +body[body.length - 1 - i];
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan(code) {
  if (!/^(\d{8}|\d{13})$/.test(code ?? '')) return false;
  return checkDigit(code.slice(0, -1)) === +code.at(-1);
}

/** Kódy 20–29: interní kódy obchodu (typicky vážené zboží s cenou/hmotností v kódu). */
export const isRestrictedEan = (code) => /^2\d{12}$/.test(code ?? '');

