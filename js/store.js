// Trvalé úložiště v localStorage.
import { newList } from './list.js';

const K = {
  catalog: 'saji.catalog',
  stores: 'saji.stores',
  list: 'saji.currentList',
  history: 'saji.history',
};

const DEFAULT_STORES = ['Lidl', 'Albert', 'Billa', 'Kaufland', 'Penny', 'Tesco', 'Globus']
  .map((name) => ({ id: slug(name), name, lastUsed: null }));

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Uložení selhalo', e);
  }
}

export function slug(name) {
  return String(name).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const loadCatalog = () => read(K.catalog, {});
export const saveCatalog = (c) => write(K.catalog, c);

export const loadStores = () => read(K.stores, DEFAULT_STORES);
export const saveStores = (s) => write(K.stores, s);

export const loadList = () => read(K.list, null) ?? newList();
export const saveList = (l) => write(K.list, l);

export const loadHistory = () => read(K.history, []);
export const saveHistory = (h) => write(K.history, h);

/** Požádá prohlížeč, aby data nemazal (důležité hlavně pro iOS). */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}

