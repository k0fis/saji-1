// Dohledání zboží podle EAN ve veřejných databázích Open *Facts (bez klíče, CORS povolen).

const SOURCES = [
  'https://world.openfoodfacts.org',
  'https://world.openproductsfacts.org',
  'https://world.openbeautyfacts.org',
];
const FIELDS = 'product_name,product_name_cs,brands,quantity,image_small_url';

function composeName(name, brands, quantity) {
  let out = name;
  const brand = (brands || '').split(',')[0].trim();
  if (brand && !out.toLowerCase().includes(brand.toLowerCase())) out = `${brand} ${out}`;
  const q = (quantity || '').trim();
  if (q && !out.toLowerCase().includes(q.toLowerCase())) out = `${out} ${q}`;
  return out;
}

async function fetchFrom(base, ean, signal) {
  const res = await fetch(`${base}/api/v2/product/${ean}.json?fields=${FIELDS}`, { signal });
  if (!res.ok) throw new Error('not found');
  const json = await res.json();
  const p = json.product;
  const name = (p?.product_name_cs || p?.product_name || '').trim();
  if (json.status !== 1 || !name) throw new Error('no name');
  return {
    name: composeName(name, p.brands, p.quantity),
    image: p.image_small_url || null,
    source: new URL(base).hostname,
  };
}

/** @returns {Promise<{name:string,image:string|null,source:string}|null>} */
export async function lookupRemote(ean, { timeout = 5000 } = {}) {
  if (!navigator.onLine) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await Promise.any(SOURCES.map((s) => fetchFrom(s, ean, ctrl.signal)));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    ctrl.abort(); // zruší zbývající dotazy
  }
}

