import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseQty, lineTotal, formatMoney, moneyToInput } from '../js/money.js';
import { normalizeEan, isValidEan, isRestrictedEan, upcEToA } from '../js/ean.js';
import { cartTotal, catalogKey } from '../js/list.js';
import { buildShareText } from '../js/share.js';

const nb = (s) => s.replace(/\u00a0/g, ' ');

test('parseMoney', () => {
  assert.equal(parseMoney('12,90'), 1290);
  assert.equal(parseMoney('12.9'), 1290);
  assert.equal(parseMoney(' 1 234,50 Kč'), 123450);
  assert.equal(parseMoney('0,1'), 10);
  assert.equal(parseMoney(''), null);
  assert.ok(Number.isNaN(parseMoney('abc')));
  assert.ok(Number.isNaN(parseMoney('1,234')));
});

test('parseQty', () => {
  assert.equal(parseQty('2'), 2);
  assert.equal(parseQty('0,455'), 0.455);
  assert.equal(parseQty('0'), null);
  assert.equal(parseQty('x'), null);
});

test('lineTotal a formátování', () => {
  assert.equal(lineTotal(2490, 2), 4980);
  assert.equal(lineTotal(19990, 0.455), 9095); // 90,95 Kč
  assert.equal(nb(formatMoney(4980)), '49,80 Kč');
  assert.equal(moneyToInput(1290), '12,90');
});

test('EAN validace', () => {
  assert.ok(isValidEan('3017620422003'));   // Nutella
  assert.ok(isValidEan('96385074'));        // EAN-8
  assert.ok(!isValidEan('3017620422004'));
  assert.ok(!isValidEan('123'));
  assert.equal(normalizeEan('036000291452'), '0036000291452'); // UPC-A → EAN-13
  assert.ok(isValidEan(normalizeEan('036000291452')));
});

test('UPC-E → UPC-A', () => {
  assert.equal(upcEToA('04252614'), '042100005264');
  assert.ok(isValidEan(normalizeEan('04252614', 'upc_e')));
});

test('kódy obchodu (vážené zboží)', () => {
  assert.ok(isRestrictedEan('2912345678904'));
  assert.ok(!isRestrictedEan('8594001021499'));
});

test('seznam a sdílení', () => {
  const list = {
    createdAt: '2026-10-28T10:00:00Z',
    items: [
      { id: 'a', name: 'Mléko', ean: '1', price: 2490, qty: 2, status: 'cart', addedAt: 1 },
      { id: 'b', name: 'Chléb', ean: null, price: 3990, qty: 1, status: 'cart', addedAt: 2 },
      { id: 'c', name: 'Rohlíky', ean: null, price: null, qty: 10, status: 'planned' },
    ],
  };
  assert.equal(cartTotal(list), 8970);
  assert.equal(catalogKey({ name: ' Chléb ' }), 'n:chléb');
  const text = buildShareText(list, { storeName: 'Lidl' });
  assert.match(text, /Nákup – Lidl/);
  assert.match(text, /☐ Rohlíky 10×/);
  assert.match(text, /☑ Mléko {2}2 × 24,90 Kč = 49,80 Kč/);
  assert.match(text, /Celkem v košíku: 89,70 Kč/);
});

