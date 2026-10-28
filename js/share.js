import { formatMoney, formatQty, lineTotal } from './money.js';
import { cartItems, plannedItems, cartTotal } from './list.js';

/** Čitelný text seznamu pro WhatsApp / e-mail. */
export function buildShareText(list, { storeName = '', appUrl = '' } = {}) {
  const date = new Date(list.createdAt).toLocaleDateString('cs-CZ');
  const lines = [`Nákup${storeName ? ' – ' + storeName : ''}, ${date}`, ''];

  const planned = plannedItems(list);
  if (planned.length) {
    lines.push('Koupit:');
    for (const i of planned) lines.push(`☐ ${i.name}${i.qty !== 1 ? ' ' + formatQty(i.qty) + '×' : ''}`);
    lines.push('');
  }

  const cart = cartItems(list).slice().reverse(); // v pořadí nákupu
  if (cart.length) {
    lines.push('V košíku:');
    for (const i of cart) {
      lines.push(`☑ ${i.name}  ${formatQty(i.qty)} × ${formatMoney(i.price)} = ${formatMoney(lineTotal(i.price, i.qty))}`);
    }
    lines.push('', `Celkem v košíku: ${formatMoney(cartTotal(list))}`);
  }

  if (appUrl) lines.push('', `Aplikace: ${appUrl}`);
  return lines.join('\n').replace(/\u00a0/g, ' ');
}

