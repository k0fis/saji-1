import * as S from './store.js';
import {
  parseMoney, parseQty, formatMoney, formatQty, lineTotal, moneyToInput, qtyToInput,
} from './money.js';
import { normalizeEan, isValidEan, isRestrictedEan } from './ean.js';
import { cartItems, plannedItems, cartTotal, catalogKey, newId, newList } from './list.js';
import { lookupRemote } from './lookup.js';
import { Scanner } from './scanner.js';
import { buildShareText } from './share.js';

// ---------- stav ----------
const state = {
  catalog: S.loadCatalog(),
  stores: S.loadStores(),
  list: S.loadList(),
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });

function persist() {
  S.saveList(state.list);
  S.saveCatalog(state.catalog);
  S.saveStores(state.stores);
}

const storeById = (id) => state.stores.find((s) => s.id === id);
const storeName = (id) => storeById(id)?.name ?? '';

// ---------- toast / zpětná vazba ----------
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

let audioCtx;
function beep() {
  navigator.vibrate?.(60);
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 1200;
    g.gain.value = 0.08;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.08);
  } catch { /* bez zvuku */ }
}

// ---------- katalog a ceny ----------

/** Návrh ceny: nejdřív z aktuálního obchodu, jinak poslední odkudkoli (s nápovědou). */
function suggestPrice(item) {
  const entry = state.catalog[catalogKey(item)];
  if (!entry?.prices) return null;
  const sid = state.list.store || '';
  if (entry.prices[sid]) return { price: entry.prices[sid].price, hint: '' };
  const latest = Object.entries(entry.prices).sort((a, b) => b[1].at.localeCompare(a[1].at))[0];
  if (!latest) return null;
  const [id, p] = latest;
  return {
    price: p.price,
    hint: `naposledy ${formatMoney(p.price)}${id ? ' – ' + storeName(id) : ''}, ${fmtDate(p.at)}`,
  };
}

function remember(item, remote) {
  const key = catalogKey(item);
  const entry = (state.catalog[key] ??= { prices: {} });
  entry.name = item.name;
  if (remote) Object.assign(entry, { image: remote.image, source: remote.source });
  entry.source ??= 'manual';
  if (item.status === 'cart' && item.price != null) {
    entry.prices[state.list.store || ''] = { price: item.price, at: today() };
  }
}

/** Najde EAN v katalogu podle přesného názvu (pro položky ze seznamu „Koupit“). */
function eanForName(name) {
  const n = name.trim().toLowerCase();
  const hit = Object.entries(state.catalog).find(([k, e]) => !k.startsWith('n:') && e.name?.toLowerCase() === n);
  return hit?.[0] ?? null;
}

function refreshDatalist() {
  const names = [...new Set(Object.values(state.catalog).map((e) => e.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
  $('catalogNames').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
}

// ---------- vykreslení ----------
function render() {
  const list = state.list;
  const cart = cartItems(list);
  const planned = plannedItems(list);
  const total = cartTotal(list);

  $('storeName').textContent = storeName(list.store) || 'Vybrat obchod';
  $('storeBtn').classList.toggle('unset', !list.store);
  $('cartTotal').textContent = formatMoney(total);

  // odhad celkem = košík + plánované položky se známou cenou
  const est = planned.reduce((s, i) => s + lineTotal(i.price ?? suggestPrice(i)?.price ?? 0, i.qty), 0);
  $('estimate').textContent = planned.length ? `odhad celkem ~${formatMoney(total + est)}` : '';

  const budgetEl = $('budgetInfo');
  budgetEl.className = 'muted';
  if (list.budget) {
    const left = list.budget - total;
    budgetEl.textContent = left >= 0 ? `zbývá ${formatMoney(left)} z ${formatMoney(list.budget)}` : `přes rozpočet o ${formatMoney(-left)}`;
    budgetEl.className = left < 0 ? 'bad' : total > list.budget * 0.9 ? 'warn' : 'ok';
  } else budgetEl.textContent = '';
  $('cartTotal').className = 'total ' + (list.budget ? budgetEl.className : '');

  const rEl = $('receiptInfo');
  if (list.receiptTotal != null) {
    const diff = list.receiptTotal - total;
    rEl.textContent = diff === 0 ? '✓ souhlasí s účtenkou' : `účtenka ${formatMoney(list.receiptTotal)} (${diff > 0 ? '+' : ''}${formatMoney(diff)})`;
    rEl.className = diff === 0 ? 'ok' : 'bad';
  } else rEl.textContent = '';

  $('plannedSec').hidden = !planned.length;
  $('plannedCount').textContent = planned.length || '';
  $('plannedList').innerHTML = planned.map((i) => {
    const p = i.price ?? suggestPrice(i)?.price;
    return `<li class="item planned" data-id="${i.id}">
      <button class="check" data-act="buy" aria-label="Do košíku">○</button>
      <button class="item-main" data-act="edit">
        <span class="name">${esc(i.name)}</span>
        <span class="sub">${formatQty(i.qty)}×${p != null ? ' · ~' + formatMoney(lineTotal(p, i.qty)) : ''}${i.ean ? ' · ▦' : ''}</span>
      </button>
    </li>`;
  }).join('');

  $('cartSec').hidden = !cart.length;
  $('cartCount').textContent = cart.length || '';
  $('cartList').innerHTML = cart.map((i) => `<li class="item" data-id="${i.id}">
      <button class="item-main" data-act="edit">
        <span class="name">${esc(i.name)}</span>
        <span class="sub">${formatQty(i.qty)} × ${formatMoney(i.price)}</span>
      </button>
      <div class="qty">
        <button data-act="dec" aria-label="Méně">−</button>
        <button data-act="inc" aria-label="Více">+</button>
      </div>
      <span class="line">${formatMoney(lineTotal(i.price, i.qty))}</span>
    </li>`).join('');

  $('empty').hidden = cart.length + planned.length > 0;
}

function onListClick(e) {
  const btn = e.target.closest('button[data-act]');
  const li = e.target.closest('li[data-id]');
  if (!btn || !li) return;
  const item = state.list.items.find((i) => i.id === li.dataset.id);
  if (!item) return;
  switch (btn.dataset.act) {
    case 'edit':
    case 'buy':
      openSheet(item, { mode: btn.dataset.act === 'buy' ? 'cart' : item.status });
      break;
    case 'inc':
    case 'dec': {
      const step = item.qty % 1 === 0 ? 1 : 0.1;
      const q = Math.round((item.qty + (btn.dataset.act === 'inc' ? step : -step)) * 1000) / 1000;
      if (q <= 0) return openSheet(item, { mode: 'cart' });
      item.qty = q;
      persist();
      render();
    }
  }
}

// ---------- detail položky ----------
let sheet = null; // { item, isNew, mode, remote, nameTouched }

function openSheet(item, { mode = 'cart', isNew = false, qty, hint = '' } = {}) {
  sheet = { item, isNew, mode, ean: item.ean ?? null, remote: null, nameTouched: false };
  const planned = mode === 'planned';
  const becomingCart = mode === 'cart' && item.status === 'planned';

  $('itemTitle').textContent = planned ? (isNew ? 'Přidat do seznamu' : 'Položka seznamu')
    : becomingCart ? 'Do košíku' : isNew ? 'Nová položka' : 'Položka v košíku';
  $('itemEan').textContent = item.ean ? `EAN ${item.ean}` : '';
  $('itemLookup').textContent = hint;
  const entry = state.catalog[catalogKey(item)];
  setImage(entry?.image);

  $('itemName').value = item.name ?? '';
  const sugg = suggestPrice(item);
  $('itemPrice').value = item.price != null ? moneyToInput(item.price) : sugg ? moneyToInput(sugg.price) : '';
  $('priceHint').textContent = item.price == null && sugg?.hint ? sugg.hint : '';
  $('itemQty').value = qtyToInput(qty ?? item.qty ?? 1);
  $('priceRow').hidden = planned;
  $('itemDelete').hidden = isNew;
  $('itemScan').hidden = !(item.status === 'planned' && !item.ean && !isNew);
  $('itemSave').textContent = planned ? 'Uložit' : becomingCart || isNew ? 'Do košíku' : 'Uložit';
  $('itemError').hidden = true;
  updateLineTotal();

  $('itemDlg').showModal();
  // focus: chybí název → název, jinak cena
  setTimeout(() => {
    const target = !$('itemName').value ? $('itemName') : !planned ? $('itemPrice') : null;
    target?.focus();
    target?.select?.();
  }, 50);
}

function setImage(src) {
  const img = $('itemImg');
  img.hidden = !src;
  if (src) img.src = src; else img.removeAttribute('src');
}

function updateLineTotal() {
  const p = parseMoney($('itemPrice').value);
  const q = parseQty($('itemQty').value);
  $('lineTotal').textContent = sheet?.mode !== 'planned' && p > 0 && q ? `= ${formatMoney(lineTotal(p, q))}` : '';
}

async function startLookup(ean) {
  if (state.catalog[ean]?.name) return;
  $('itemLookup').textContent = 'Hledám v Open Food Facts…';
  const current = sheet;
  const res = await lookupRemote(ean);
  if (sheet !== current || !$('itemDlg').open) return;
  if (res) {
    current.remote = res;
    if (!current.nameTouched) $('itemName').value = res.name;
    setImage(res.image);
    $('itemLookup').textContent = `Nalezeno (${res.source.replace('world.', '')})`;
  } else {
    $('itemLookup').textContent = navigator.onLine ? 'V databázi nenalezeno – doplň název' : 'Offline – doplň název';
    if (!$('itemName').value) $('itemName').focus();
  }
}

function saveSheet() {
  const err = (msg) => { $('itemError').textContent = msg; $('itemError').hidden = false; };
  const { item, isNew, mode } = sheet;
  let name = $('itemName').value.trim();
  const qty = parseQty($('itemQty').value);
  let price = null;

  if (!qty) return err('Zadej množství (např. 1 nebo 0,5).');
  if (mode === 'cart') {
    price = parseMoney($('itemPrice').value);
    if (price == null) return err('Zadej cenu.');
    if (Number.isNaN(price)) return err('Neplatná cena (např. 24,90).');
  }
  if (!name) {
    if (sheet.ean) name = `Zboží ${sheet.ean}`;
    else return err('Zadej název.');
  }

  const ean = sheet.ean ?? eanForName(name);
  const wasCart = item.status === 'cart';
  Object.assign(item, { name, qty, ean, status: mode, price: mode === 'cart' ? price : item.price ?? null });
  if (mode === 'cart' && !wasCart) item.addedAt = Date.now();
  if (isNew) state.list.items.push(item);

  remember(item, sheet.remote);
  persist();
  refreshDatalist();
  render();
  $('itemDlg').close();
  if (mode === 'cart') toast(`${name} – ${formatMoney(lineTotal(price, qty))}`);
}

function deleteSheetItem() {
  const { item } = sheet;
  state.list.items = state.list.items.filter((i) => i !== item);
  persist();
  render();
  $('itemDlg').close();
  toast(`Smazáno: ${item.name}`);
}

function stepQty(dir) {
  const q = parseQty($('itemQty').value) ?? 1;
  const step = q % 1 === 0 ? 1 : 0.1;
  const next = Math.max(step, Math.round((q + dir * step) * 1000) / 1000);
  $('itemQty').value = qtyToInput(next);
  updateLineTotal();
}

// ---------- skenování ----------
let pendingPlanId = null; // naskenovat kód pro konkrétní plánovanou položku
let lastInvalid = 0;
const scanner = new Scanner($('video'), onScanned, (m) => { $('scanStatus').textContent = m; });

async function openScanner(planId = null) {
  pendingPlanId = planId;
  $('manualEan').value = '';
  $('torchBtn').hidden = true;
  $('scanDlg').showModal();
  try {
    await scanner.start();
    $('torchBtn').hidden = !scanner.torchSupported;
  } catch (e) {
    console.warn(e);
    $('scanStatus').textContent = e.name === 'NotAllowedError'
      ? 'Přístup ke kameře zamítnut – zadej kód ručně'
      : e.message?.includes('HTTPS') ? e.message : 'Kameru nelze spustit – zadej kód ručně';
    $('manualEan').focus();
  }
}

function onScanned({ rawValue, format }) {
  const ean = normalizeEan(rawValue, format);
  if (!ean || !isValidEan(ean)) {
    if (Date.now() - lastInvalid > 2000) { lastInvalid = Date.now(); $('scanStatus').textContent = 'Kód nečitelný, zkus znovu'; }
    return false;
  }
  beep();
  $('scanDlg').close();
  handleEan(ean);
  return true;
}

function handleEan(ean) {
  const items = state.list.items;
  const restrictedHint = isRestrictedEan(ean) ? 'Kód obchodu (vážené zboží) – zadej cenu ručně' : '';
  const planId = pendingPlanId;
  pendingPlanId = null;

  // 1) kód pro konkrétní plánovanou položku
  const forPlan = planId && items.find((i) => i.id === planId);
  if (forPlan) {
    forPlan.ean = ean;
    const known = state.catalog[ean]?.name;
    if (known) forPlan.name = known;
    openSheet(forPlan, { mode: 'cart', hint: restrictedHint });
    if (!known && !restrictedHint) startLookup(ean);
    return;
  }
  // 2) už je v košíku → +1
  const inCart = items.find((i) => i.status === 'cart' && i.ean === ean);
  if (inCart) return openSheet(inCart, { mode: 'cart', qty: inCart.qty + 1, hint: 'Už je v košíku – množství +1' });
  // 3) odpovídá plánované položce
  const planned = items.find((i) => i.status === 'planned' && i.ean === ean);
  if (planned) return openSheet(planned, { mode: 'cart', hint: 'Ze seznamu „Koupit“' });
  // 4) nová položka
  const item = { id: newId(), ean, name: state.catalog[ean]?.name ?? '', price: null, qty: 1, status: 'cart' };
  openSheet(item, { mode: 'cart', isNew: true, hint: restrictedHint });
  if (!restrictedHint) startLookup(ean);
}

function onManualEan(e) {
  e.preventDefault();
  const ean = normalizeEan($('manualEan').value);
  if (!ean || !isValidEan(ean)) {
    toast('Neplatný kód EAN (8 nebo 13 číslic)');
    return;
  }
  $('scanDlg').close();
  handleEan(ean);
}

// ---------- obchody ----------
function renderStores() {
  const sorted = [...state.stores].sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? ''));
  $('storeChips').innerHTML = sorted.map((s) =>
    `<button type="button" class="chip${s.id === state.list.store ? ' active' : ''}" data-id="${s.id}">${esc(s.name)}</button>`).join('');
}

function selectStore(id) {
  state.list.store = id;
  const s = storeById(id);
  if (s) s.lastUsed = new Date().toISOString();
  persist();
  render();
  $('storeDlg').close();
}

function addStore() {
  const name = $('newStore').value.trim();
  if (!name) return;
  const id = S.slug(name) || newId();
  if (!storeById(id)) state.stores.push({ id, name, lastUsed: null });
  $('newStore').value = '';
  selectStore(id);
}

// ---------- menu: rozpočet, účtenka, sdílení, nový nákup ----------
function shareText() {
  const appUrl = location.href.split('#')[0];
  return buildShareText(state.list, { storeName: storeName(state.list.store), appUrl });
}

function openMenu() {
  const l = state.list;
  $('budgetInput').value = l.budget != null ? moneyToInput(l.budget) : '';
  $('receiptInput').value = l.receiptTotal != null ? moneyToInput(l.receiptTotal) : '';
  const text = shareText();
  $('shareWa').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  $('shareMail').href = `mailto:?subject=${encodeURIComponent('Nákupní seznam')}&body=${encodeURIComponent(text)}`;
  $('shareNative').hidden = !navigator.share;
  $('menuDlg').showModal();
}

function onMoneySetting(field, input) {
  const v = parseMoney(input.value);
  state.list[field] = Number.isNaN(v) ? state.list[field] : v;
  persist();
  render();
}

async function shareNative() {
  try {
    await navigator.share({ title: 'Nákupní seznam', text: shareText() });
  } catch { /* zrušeno */ }
}

async function shareCopy() {
  try {
    await navigator.clipboard.writeText(shareText());
    toast('Zkopírováno do schránky');
  } catch {
    toast('Kopírování se nepodařilo');
  }
}

function newPurchase() {
  const l = state.list;
  const cart = cartItems(l);
  const planned = plannedItems(l);
  if (!confirm('Ukončit tento nákup a začít nový?')) return;
  if (cart.length) {
    const history = S.loadHistory();
    history.unshift({ ...l, total: cartTotal(l), closedAt: new Date().toISOString() });
    S.saveHistory(history.slice(0, 100));
  }
  const keep = planned.length && confirm(`Přenést ${planned.length} nekoupených položek do nového seznamu?`);
  state.list = newList();
  if (keep) state.list.items = planned;
  persist();
  render();
  $('menuDlg').close();
  toast('Nový nákup');
}

// ---------- napojení událostí ----------
function closeOnBackdrop(dlg) {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

function init() {
  $('cartList').addEventListener('click', onListClick);
  $('plannedList').addEventListener('click', onListClick);

  $('scanBtn').addEventListener('click', () => openScanner());
  $('addBtn').addEventListener('click', () =>
    openSheet({ id: newId(), name: '', price: null, qty: 1, status: 'cart', ean: null }, { mode: 'cart', isNew: true }));
  $('planBtn').addEventListener('click', () =>
    openSheet({ id: newId(), name: '', price: null, qty: 1, status: 'planned', ean: null }, { mode: 'planned', isNew: true }));

  // detail
  $('itemForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveSheet();
  });
  $('itemClose').addEventListener('click', () => $('itemDlg').close());
  $('itemName').addEventListener('input', () => { if (sheet) sheet.nameTouched = true; });
  $('itemName').addEventListener('change', () => {
    // výběr z našeptávače → doplnit cenu, pokud ještě není
    if (!sheet || sheet.ean || $('itemPrice').value) return;
    const ean = eanForName($('itemName').value);
    const sugg = suggestPrice({ ean, name: $('itemName').value });
    if (sugg) { $('itemPrice').value = moneyToInput(sugg.price); $('priceHint').textContent = sugg.hint; updateLineTotal(); }
  });
  $('itemPrice').addEventListener('input', updateLineTotal);
  $('itemQty').addEventListener('input', updateLineTotal);
  $('qtyDec').addEventListener('click', () => stepQty(-1));
  $('qtyInc').addEventListener('click', () => stepQty(1));
  $('itemDelete').addEventListener('click', deleteSheetItem);
  $('itemScan').addEventListener('click', () => {
    const id = sheet.item.id;
    $('itemDlg').close();
    openScanner(id);
  });

  // skener
  $('scanDlg').addEventListener('close', () => scanner.stop());
  $('scanClose').addEventListener('click', () => $('scanDlg').close());
  $('torchBtn').addEventListener('click', async () => {
    $('torchBtn').classList.toggle('active', await scanner.toggleTorch());
  });
  $('manualForm').addEventListener('submit', onManualEan);

  // obchody
  $('storeBtn').addEventListener('click', () => { renderStores(); $('storeDlg').showModal(); });
  $('storeChips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) selectStore(b.dataset.id);
  });
  $('addStoreBtn').addEventListener('click', addStore);
  $('newStore').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addStore(); } });
  $('noStoreBtn').addEventListener('click', () => selectStore(null));

  // menu
  $('menuBtn').addEventListener('click', openMenu);
  $('budgetInput').addEventListener('change', (e) => onMoneySetting('budget', e.target));
  $('receiptInput').addEventListener('change', (e) => onMoneySetting('receiptTotal', e.target));
  $('shareNative').addEventListener('click', shareNative);
  $('shareCopy').addEventListener('click', shareCopy);
  $('newPurchase').addEventListener('click', newPurchase);

  ['itemDlg', 'storeDlg', 'menuDlg'].forEach((id) => closeOnBackdrop($(id)));

  S.requestPersistence();
  refreshDatalist();
  render();
}

init();


