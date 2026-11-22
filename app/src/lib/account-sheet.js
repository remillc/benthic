// @ts-check
// The account sheet's rules (task 2026-11-18-281), pure so that node:test can check them: which version of the sheet a
// diver sees, the maintenance line of « Mon profil de plongeur », the store's subscription page and the size of the
// photo space. The screens read these and decide nothing themselves.

/**
 * The version of the account sheet. `free`: the release edition without an Benthic+ account (the logbook is on the
 * device; every Benthic+ row opens the offer). `subscriber`: a signed-in, subscribed Benthic+ account (wherever the logbook lives: the account's, not the logbook's). `account`:
 * `git`: the desktop's one-off licence, a logbook in the diver's own git repository (task 2026-11-19-298). Everything
 * else (the alpha, a Subsurface cloud account) is `account` and keeps the sheet it always had.
 * @param {{ release: boolean, subscriber: boolean, email: string, git?: boolean, repository?: string }} state
 * @returns {'free'|'subscriber'|'git'|'account'}
 */
export function sheetVariant({ release, subscriber, email, git = false, repository = '' }) {
  if (!release) return 'account';
  if (subscriber) return 'subscriber';
  if (git && repository) return 'git';
  return email ? 'account' : 'free';
}

/**
 * The server session identifies the subscriber; a server logbook's git username is not their email.
 * @param {{ signedIn: boolean, email: string }} account
 * @param {{ email: string, benthicPlus: boolean }} logbook
 * @returns {string}
 */
export function accountEmail(account, logbook) {
  if (account.signedIn) return account.email;
  return logbook.benthicPlus ? '' : logbook.email;
}

/**
 * The line under « Mon profil de plongeur » and the badge before its chevron: only the overdue pieces count (not the ones
 * due soon), the same count as the badge of the « Entretien » row of the profile (lib/maintenance.js, overdueCount).
 * @param {number} overdue
 * @returns {{ badge: number, late: boolean }}
 */
export function profileRow(overdue) {
  const n = Number.isFinite(overdue) && overdue > 0 ? Math.floor(overdue) : 0;
  return { badge: n, late: n > 0 };
}

/** The store's own page for subscriptions: the only place where the payment method, receipts and renewal are managed. */
export const GOOGLE_PLAY_SUBSCRIPTIONS = 'https://play.google.com/store/account/subscriptions';
export const APP_STORE_SUBSCRIPTIONS = 'https://apps.apple.com/account/subscriptions';

/**
 * The address of the subscription page of a store. Google Play's takes the package, so that it opens this app's
 * subscription; the App Store's page lists all of the person's subscriptions.
 * @param {'google'|'apple'} store
 * @param {string} appId
 * @returns {string}
 */
export function storeSubscriptionsUrl(store, appId) {
  return store === 'apple' ? APP_STORE_SUBSCRIPTIONS : `${GOOGLE_PLAY_SUBSCRIPTIONS}?package=${encodeURIComponent(appId)}`;
}

/**
 * The store the subscription was bought in: the one the server says, else the one of this device (the App Store on an
 * iPhone or iPad, Google Play elsewhere: an Android phone or tablet, or a computer whose phone is Android).
 * @param {{ store?: string }|null|undefined} subscription
 * @param {boolean} ios
 * @returns {'google'|'apple'}
 */
export function subscriptionStore(subscription, ios) {
  if (subscription?.store === 'apple' || subscription?.store === 'google') return subscription.store;
  return ios ? 'apple' : 'google';
}

/** The photo and video space of an Benthic+ account: 10 GB (decimal, as the store and the server count). */
export const SPACE_LIMIT_BYTES = 10 * 1000 * 1000 * 1000;

/**
 * The use of the photo space.
 * @param {number|null|undefined} usedBytes null: not known
 * @param {number} [limitBytes]
 * @returns {{ known: boolean, used: number, limit: number, percent: number }}
 */
export function spaceUse(usedBytes, limitBytes = SPACE_LIMIT_BYTES) {
  if (typeof usedBytes !== 'number' || !Number.isFinite(usedBytes) || usedBytes < 0) return { known: false, used: 0, limit: limitBytes, percent: 0 };
  return { known: true, used: usedBytes, limit: limitBytes, percent: Math.min(100, Math.round((usedBytes / limitBytes) * 100)) };
}
