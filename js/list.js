import { lineTotal } from './money.js';

export const cartItems = (list) =>
  list.items.filter((i) => i.status === 'cart').sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

export const plannedItems = (list) => list.items.filter((i) => i.status === 'planned');

export const cartTotal = (list) =>
  cartItems(list).reduce((sum, i) => sum + lineTotal(i.price, i.qty), 0);

/** Klíč do katalogu: EAN, nebo normalizovaný název pro zboží bez kódu. */
export const catalogKey = (item) =>
  item.ean || 'n:' + String(item.name || '').trim().toLowerCase();

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

export const newList = (store = null) => ({
  id: newId(),
  createdAt: new Date().toISOString(),
  store,
  budget: null,
  receiptTotal: null,
  items: [],
});

