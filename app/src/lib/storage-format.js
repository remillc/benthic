// @ts-check
// Sizes of the storage the account holds, in Mo and Go.
import { t } from './i18n.js';
import { formatNumber } from './format.js';

const MB = 1_000_000;
const GB = 1_000_000_000;

/**
 * "96 Mo", "1 Go", "18,4 Go": megabytes below 1 Go, gigabytes with one decimal when needed.
 * @param {number} bytes
 */
export function formatStorageSize(bytes) {
  if (bytes >= GB) {
    const rounded = Math.round((bytes / GB) * 10) / 10;
    return t('account.manage.sizeGb', { value: formatNumber(rounded, Number.isInteger(rounded) ? 0 : 1) });
  }
  return t('account.manage.sizeMb', { value: formatNumber(Math.max(0, Math.round(bytes / MB)), 0) });
}
