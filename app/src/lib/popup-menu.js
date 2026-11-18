// @ts-check
// A small menu under a button (task 2026-11-17-267): the ⋮ of the equipment screens and the kit menu of the dive
// editor. A Framework7 popover with the app's `od-menu` look (theme.css), as the account sheet's sync options.
import { f7 } from 'framework7-svelte';

/** @param {string} s */
export const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @typedef {Object} MenuItem
 * @property {string} label
 * @property {string} [supporting] a second line, smaller
 * @property {() => void} onclick
 * @property {boolean} [danger]
 * @property {boolean} [disabled]
 * @property {boolean} [divider] a divider before the item
 */

/**
 * Opens the menu under an element.
 * @param {HTMLElement} target
 * @param {MenuItem[]} items
 * @param {string} [name] the accessible name of the menu
 */
export function openPopupMenu(target, items, name = '') {
  const rows = items
    .map((item, i) => {
      const divider = item.divider ? '<li class="od-menu-divider" role="separator"></li>' : '';
      const sub = item.supporting ? `<div class="item-text">${escapeHtml(item.supporting)}</div>` : '';
      const style = item.danger ? ' style="color:var(--od-menu-danger)"' : '';
      const off = item.disabled ? ' disabled' : '';
      return `${divider}<li class="${item.disabled ? 'disabled' : ''}"><a href="#" class="item-link item-content popover-close" data-index="${i}"${off}><div class="item-inner"><div class="item-title"${style}>${escapeHtml(item.label)}${sub}</div></div></a></li>`;
    })
    .join('');
  const popover = f7.popover.create({
    targetEl: target,
    content: `<div class="popover od-menu" role="menu" aria-label="${escapeHtml(name)}"><div class="popover-inner"><div class="list no-chevron"><ul>${rows}</ul></div></div></div>`,
    on: {
      opened(/** @type {any} */ p) {
        p.$el.find('[data-index]').on('click', (/** @type {Event} */ ev) => {
          ev.preventDefault();
          const item = items[Number(/** @type {HTMLElement} */ (ev.currentTarget).dataset.index)];
          if (item && !item.disabled) item.onclick();
        });
      },
      closed: () => popover.destroy(),
    },
  });
  popover.open();
}
