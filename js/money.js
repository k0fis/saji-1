// Peníze se počítají v haléřích (celá čísla), aby nevznikaly chyby s plovoucí čárkou.

const czk = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' });
const qtyFmt = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 3 });

/** "12,90" | "12.90" | "12" → 1290; prázdné → null; neplatné → NaN */
export function parseMoney(input) {
  if (input == null) return null;
  const s = String(input).replace(/\s|kč/gi, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

/** "2" | "0,455" → číslo > 0; jinak null */
export function parseQty(input) {
  if (input == null) return null;
  const s = String(input).replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,3})?$/.test(s)) return null;
  const n = parseFloat(s);
  return n > 0 ? n : null;
}

export const lineTotal = (price, qty) => Math.round((price || 0) * (qty || 0));

export const formatMoney = (h) => czk.format((h || 0) / 100);

export const formatQty = (q) => qtyFmt.format(q);

/** Hodnota pro <input>: 1290 → "12,90" */
export const moneyToInput = (h) => (h == null ? '' : (h / 100).toFixed(2).replace('.', ','));

export const qtyToInput = (q) => String(q ?? 1).replace('.', ',');

