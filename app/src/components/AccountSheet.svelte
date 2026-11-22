<script>
  // @ts-check
  // Android phone: the account sheet, opened by the avatar of a section's top bar (task
  // 2026-11-14-120, docs/mockups/nav-option-barre-compte-android.dc.html). Everything the side
  // menu held that is not a section: the account (« Gérer le compte » opens Compte), the sync
  // line with « Synchroniser » (and its other options in manual mode), Réglages and À propos.
  // Compte, Réglages and À propos open over the current section, with a back arrow.
  import { Sheet, f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import SyncFailureRow from './SyncFailureRow.svelte';
  import SyncControl from './SyncControl.svelte';
  import SyncButton from './SyncButton.svelte';
  import { benthicPlusAccount, benthicPlusSubscriber } from '../lib/benthic-plus-state.svelte.js';
  import { logbook, setAutoSync } from '../lib/logbook.svelte.js';
  import { showUnsent } from '../lib/filter.svelte.js';
  import { navigation, openOver, openSettings, openMapSettings, openAbout, showSection } from '../lib/navigation.svelte.js';
  import { updatesCount } from '../lib/offline-maps.svelte.js';
  import { t } from '../lib/i18n.js';
  import { layout, ios, desktopApp } from '../lib/layout.svelte.js';
  import { isRelease } from '../lib/edition.js';
  import { devAccounts } from '../lib/dev-switch.js';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import { openManageAccount } from '../lib/navigation.svelte.js';
  import { openBenthicPlus } from '../lib/open-offer.svelte.js';
  import { openBackup } from '../lib/navigation.svelte.js';
  import { loadInventory, overdueBadge } from '../lib/inventory.svelte.js';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { accountEmail as emailOfAccount, profileRow, sheetVariant } from '../lib/account-sheet.js';

  const email = $derived(emailOfAccount(benthicPlusAccount, logbook));
  // A Benthic+ account shows the diver's full name first and the e-mail under it, in smaller grey text (task 2026-11-19-312).
  const fullName = $derived(benthicPlusSubscriber() ? diver.info.fullName : '');
  const initial = $derived((fullName || email) ? (fullName || email).trim().charAt(0).toLocaleUpperCase() : '');
  const accountName = $derived(fullName || email || t('menu.noAccount'));
  const accountEmail = $derived(fullName ? email : '');
  const accountLine = $derived(
    t(logbook.email ? (logbook.mode === 'git' ? (logbook.benthicPlus ? 'menu.serverDives' : 'menu.gitDives') : 'menu.cloudDives') : 'menu.localDives', { n: logbook.dives.length }),
  );
  const mapUpdates = $derived(updatesCount());

  // The three versions of the sheet (task 2026-11-18-281): without a Benthic+ account (the release edition's free
  // version), with one, and the alpha's or a cloud account's, which keeps what it had.
  const variant = $derived(sheetVariant({ release: isRelease, subscriber: benthicPlusSubscriber(), email: logbook.email }));
  const free = $derived(variant === 'free');
  const subscriber = $derived(variant === 'subscriber');
  /** The overdue pieces: the badge and the red line of « Mon profil de plongeur » (the count of the Entretien row). */
  const late = $derived(profileRow(subscriber ? overdueBadge() : 0));
  // The reminders are read when the sheet opens, so that the count is the one of the profile's Entretien row.
  $effect(() => {
    if (navigation.accountOpen && subscriber && !desktopApp) loadInventory().catch((e) => console.error('Reading the equipment', e));
    if (navigation.accountOpen && subscriber) loadProfile().catch((e) => console.error('Reading the profile', e));
  });

  // Back closes the sheet through the app's one Back dispatcher (lib/back-button.js), like every other sheet. The
  // sheet used to add « #compte » to the browser's history (task 2026-11-18-281, point 5); the routers own the history
  // and nothing is written to the browser's any more (docs/architecture.md, section 13).

  /** « Gérer le compte »: the new screen for a Benthic+ account, the account page for the others. */
  function manage() {
    navigation.accountOpen = false;
    if (subscriber) openManageAccount();
    else openOver('/account');
  }

  /** The free sheet's doors into the Benthic+ screens. @param {'offer'|'signIn'} screen */
  function plus(screen) {
    navigation.accountOpen = false;
    openBenthicPlus(screen, 'account');
  }

  /** Manual sync with an account: the changes waiting, a filled « Synchroniser », and its other options under ⋮. */
  const manual = $derived(!!logbook.email && !logbook.autoSync);

  /**
   * The ⋮ of manual sync (nav-compte-options-android.dc.html): switch to automatic sync, or see
   * the changes not sent (the Logbook, filtered on them). A popover of the app, outside the sheet.
   * @param {MouseEvent} e
   */
  function syncOptions(e) {
    const item = (/** @type {string} */ action, /** @type {string} */ label) =>
      `<li><a href="#" class="item-link item-content popover-close" data-action="${action}"><div class="item-inner"><div class="item-title">${label}</div></div></a></li>`;
    const popover = f7.popover.create({
      targetEl: /** @type {HTMLElement} */ (e.currentTarget),
      content: `<div class="popover bc-menu bc-account-sheet--menu"><div class="popover-inner"><div class="list no-chevron"><ul>${item('auto', t('account.syncGoAuto'))}${item('unsent', t('account.syncShowPending'))}</ul></div></div></div>`,
      on: {
        opened(/** @type {any} */ p) {
          p.$el.find('[data-action]').on('click', (/** @type {Event} */ ev) => {
            ev.preventDefault();
            const action = /** @type {HTMLElement} */ (ev.currentTarget).dataset.action;
            if (action === 'auto') setAutoSync(true);
            else {
              navigation.accountOpen = false;
              showSection('logbook');
              showUnsent(logbook.prefs);
            }
          });
        },
        closed: () => popover.destroy(),
      },
    });
    popover.open();
  }

  /** iPhone: the sync options as an action sheet (appbar-tiroir-ios-ouvert.dc.html). */
  function syncOptionsIos() {
    f7.actions
      .create({
        buttons: [
          [
            { text: t('account.syncOptions'), label: true },
            { text: t('account.syncGoAuto'), onClick: () => setAutoSync(true) },
            {
              text: t('account.syncShowPending'),
              onClick: () => {
                navigation.accountOpen = false;
                showSection('logbook');
                showUnsent(logbook.prefs);
              },
            },
          ],
          [{ text: t('dialog.cancel'), bold: true }],
        ],
      })
      .open();
  }

  /**
   * Closes the sheet, then opens a page over the current section.
   * @param {() => void} open
   */
  function go(open) {
    navigation.accountOpen = false;
    open();
  }
</script>

<!-- Tablet (task 2026-11-14-126): a 360 dp panel next to the rail, over the scrim. -->
<Sheet
  class="bc-account-sheet{layout.rail ? ' bc-account-sheet--floating' : ''}"
  opened={navigation.accountOpen}
  onSheetClosed={() => (navigation.accountOpen = false)}
  backdrop
  swipeToClose
  push={false}
  aria-label={t(free ? 'nav.accountLabelFree' : 'nav.accountSheet')}
>
  {#if ios}
  <!-- iPhone (task 2026-11-14-127, appbar-tiroir-ios-ouvert.dc.html): a page sheet « Compte » with
       OK, in grouped lists: the account, the sync, then Réglages and À propos. Its rows are buttons: `data-row` names
       them as the Android rows' addresses do (« #profile » there, data-row="profile" here), for the navigation tests. -->
  <div class="bc-account-sheet--ios">
    <div class="bc-account-sheet--ios-bar">
      <span class="bc-account-sheet--ios-title">{t('account.title')}</span>
      <button type="button" class="bc-account-sheet--ios-ok" onclick={() => (navigation.accountOpen = false)}>{t('dialog.ok')}</button>
    </div>
    {#if free}
      <!-- Free version (ios-compte-gratuit.dc.html, task 289): the logbook on this iPhone, « S'abonner », « Déjà abonné ? »,
           then the two Benthic+ rows that open the offer. -->
      <div class="bc-account-sheet--ios-group bc-account-sheet--ios-free">
        <div class="bc-account-sheet--ios-row bc-account-sheet--ios-identity">
          <span class="bc-account-sheet--initial bc-account-sheet--silhouette" aria-hidden="true"><Icon name="account" size={22} weight={2} /></span>
          <span class="bc-account-sheet--texts">
            <span class="bc-account-sheet--name">{t('account.free.deviceIos')}</span>
            <span class="bc-account-sheet--line">{t('logbook.count', { n: logbook.dives.length })}</span>
          </span>
        </div>
        <div class="bc-account-sheet--ios-offer">
          <button type="button" class="bc-account-sheet--subscribe" onclick={() => plus('offer')}>{t('benthicPlus.offer.subscribe')}</button>
          <span class="bc-account-sheet--already">{t('benthicPlus.offer.already')}&nbsp;<button type="button" class="bc-account-sheet--sign-in" onclick={() => plus('signIn')}>{t('benthicPlus.offer.signIn')}</button></span>
        </div>
      </div>
      {#if devAccounts}{#await import('./DevToolsRow.svelte') then dev}{@const DevToolsRow = dev.default}<DevToolsRow />{/await}{/if}
      <div class="bc-account-sheet--ios-group">
        <button type="button" class="bc-account-sheet--ios-row" data-row="offer-sync" onclick={() => plus('offer')}>
          <Icon name="cloudDownload" />
          <span class="bc-account-sheet--row-label">
            <BenthicPlusChip onSheet />
            {t('account.free.sync')}
            <span class="bc-account-sheet--row-line">{t('account.free.syncText')}</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
        <button type="button" class="bc-account-sheet--ios-row" data-row="offer-profile" onclick={() => plus('offer')}>
          <Icon name="briefcase" />
          <span class="bc-account-sheet--row-label">
            <BenthicPlusChip onSheet />
            {t('gear.profile.title')}
            <span class="bc-account-sheet--row-line">{t('gear.profile.cardLine')}</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
      </div>
    {:else}
      <!-- An account (ios-compte-abonne.dc.html): the e-mail, with the « + » chip for Benthic+, « Gérer le compte »,
           the sync line with « Synchroniser ». -->
      <div class="bc-account-sheet--ios-group">
        <div class="bc-account-sheet--ios-row bc-account-sheet--ios-identity">
          <span class="bc-account-sheet--initial" aria-hidden="true">
            {#if initial}{initial}{:else}<Icon name="account" size={22} weight={2} />{/if}
          </span>
          <span class="bc-account-sheet--texts">
            <span class="bc-account-sheet--name">
              {accountName}
              {#if subscriber}<span class="bc-account-sheet--plus-dot" aria-hidden="true">+</span><span class="bc-sr-only">{t('benthicPlus.chipName')}</span>{/if}
            </span>
            {#if accountEmail}<span class="bc-account-sheet--email">{accountEmail}</span>{/if}
            <span class="bc-account-sheet--line">{accountLine}</span>
          </span>
        </div>
        <button type="button" class="bc-account-sheet--ios-row bc-account-sheet--ios-link" onclick={manage}>
          <Icon name="account" />
          <span class="bc-account-sheet--row-label">{t('nav.manageAccount')}</span>
          <Icon name="chevron" size={20} />
        </button>
        {#if !logbook.loading && !logbook.error}
          {#if logbook.syncFailure}
            <div class="bc-account-sheet--ios-row"><SyncFailureRow /></div>
          {:else if logbook.conflict && logbook.conflictLater}
            <div class="bc-account-sheet--ios-row"><SyncFailureRow conflict /></div>
          {:else}
            <div class="bc-account-sheet--ios-row bc-account-sheet--ios-sync">
              {#if manual && logbook.pending > 0}
                <span class="bc-account-sheet--pending">{t('nav.pendingChanges', { n: logbook.pending })}</span>
              {:else}
                <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={0} progress={logbook.syncProgress} live={false} steady />
              {/if}
              {#if logbook.email}<SyncButton filled={manual && logbook.pending > 0} />{/if}
            </div>
          {/if}
          {#if manual}
            <button type="button" class="bc-account-sheet--ios-row bc-account-sheet--ios-link" onclick={syncOptionsIos}>{t('account.syncOptions')}</button>
          {/if}
        {/if}
      </div>
      {#if devAccounts}{#await import('./DevToolsRow.svelte') then dev}{@const DevToolsRow = dev.default}<DevToolsRow />{/await}{/if}
      {#if isRelease && !desktopApp}
        <!-- « Mon profil de plongeur », then « Sauvegarde et restauration » (tasks 267, 281, 290, 291): the red line and the badge when a piece is overdue. -->
        <div class="bc-account-sheet--ios-group">
          <button type="button" class="bc-account-sheet--ios-row" data-row="profile" onclick={() => go(() => openOver('/profile'))}>
            <Icon name="briefcase" />
            <span class="bc-account-sheet--row-label">
              {t('gear.profile.title')}
              {#if late.late}
                <span class="bc-account-sheet--row-line bc-account-sheet--late-line">{t('account.sheet.maintenanceLate', { n: late.badge })}</span>
              {:else}
                <span class="bc-account-sheet--row-line">{t('gear.profile.cardLine')}</span>
              {/if}
            </span>
            {#if late.late}<span class="bc-account-sheet--late-badge" role="status" aria-label={t('maintenance.badge', { n: late.badge })}>{late.badge}</span>{/if}
            <Icon name="chevron" size={20} />
          </button>
          {#if subscriber}
            <!-- « Sauvegarde et restauration » (task 290; ios-compte-abonne): its own page. -->
            <button type="button" class="bc-account-sheet--ios-row" data-row="backup" onclick={() => go(openBackup)}>
              <Icon name="history" />
              <span class="bc-account-sheet--row-label">
                {t('account.sheet.backup')}
                <span class="bc-account-sheet--row-line">{t('account.sheet.backupText')}</span>
              </span>
              <Icon name="chevron" size={20} />
            </button>
          {/if}
        </div>
      {/if}
    {/if}
    <div class="bc-account-sheet--ios-group">
      <button type="button" class="bc-account-sheet--ios-row" data-row="settings" onclick={() => go(openSettings)}>
        <Icon name="settings" />
        <span class="bc-account-sheet--row-label">{t('settings.title')}</span>
        <Icon name="chevron" size={20} />
      </button>
      {#if mapUpdates > 0}
        <!-- The message about the update opens the offline maps part of Réglages (todo 89). -->
        <button type="button" class="bc-account-sheet--ios-row" onclick={() => go(openMapSettings)}>
          <Icon name="map" />
          <span class="bc-account-sheet--row-label">
            {t('settings.groups.maps')}
            <span class="bc-account-sheet--row-line">{t('nav.mapUpdateWaiting')}</span>
          </span>
          <span class="bc-account-sheet--badge" aria-label={t('nav.mapUpdates', { n: mapUpdates })}>{mapUpdates}</span>
          <Icon name="chevron" size={20} />
        </button>
      {/if}
      <button type="button" class="bc-account-sheet--ios-row" onclick={() => go(openAbout)}>
        <Icon name="info" />
        <span class="bc-account-sheet--row-label">{t('about.title')}</span>
        <Icon name="chevron" size={20} />
      </button>
    </div>
  </div>
  {:else}
  <div class="bc-account-sheet--content">
    <div class="bc-account-sheet--head">
      <span aria-hidden="true"></span>
      <!-- Centred on the sheet's width: an empty 48 dp slot on the left balances the ✕ on the right (task 2026-11-18-281).
           The simple logo with relief (the same drawing in both files, no inline gradient to share) (task 2026-11-14-123). -->
      <span class="bc-account-sheet--brand">
        <img class="bc-account-sheet--logo bc-account-sheet--light" src="/logo-light.svg" alt="" width="24" height="24" />
        <img class="bc-account-sheet--logo bc-account-sheet--dark" src="/logo-dark.svg" alt="" width="24" height="24" />
        <!-- A subscriber's sheet: a small round « + » after the name, read « Benthic Plus » (task 2026-11-18-282). -->
        {#if subscriber}
          <span class="bc-account-sheet--title"><span aria-hidden="true">{t('menu.title')}<span class="bc-account-sheet--plus-dot">+</span></span><span class="bc-sr-only">{t('benthicPlus.chipName')}</span></span>
        {:else}
          <span class="bc-account-sheet--title">{t('menu.title')}</span>
        {/if}
      </span>
      <button type="button" class="bc-account-sheet--close" onclick={() => (navigation.accountOpen = false)}>
        <Icon name="close" /><span class="bc-sr-only">{t('nav.close')}</span>
      </button>
    </div>

    {#if free}
    <!-- Free version (docs/mockups-release/nav-compte-gratuit-android.dc.html): the logbook on this device, the offer, and
         the two Benthic+ rows that open it. No e-mail, no sync line. -->
    <div class="bc-account-sheet--card bc-account-sheet--identity bc-account-sheet--free">
      <div class="bc-account-sheet--account">
        <span class="bc-account-sheet--initial bc-account-sheet--silhouette" aria-hidden="true"><Icon name="account" size={22} weight={2} /></span>
        <span class="bc-account-sheet--texts">
          <span class="bc-account-sheet--name">{t('account.free.device')}</span>
          <span class="bc-account-sheet--line">{t('logbook.count', { n: logbook.dives.length })}</span>
        </span>
      </div>
      <div class="bc-account-sheet--offer">
        <button type="button" class="bc-account-sheet--subscribe" onclick={() => plus('offer')}>{t('benthicPlus.offer.subscribe')}</button>
        <span class="bc-account-sheet--already">{t('benthicPlus.offer.already')}&nbsp;<button type="button" class="bc-account-sheet--sign-in" onclick={() => plus('signIn')}>{t('benthicPlus.offer.signIn')}</button></span>
      </div>
    </div>
    {#if devAccounts}{#await import('./DevToolsRow.svelte') then dev}{@const DevToolsRow = dev.default}<DevToolsRow />{/await}{/if}
    {#if isRelease && !desktopApp}
      <div class="bc-account-sheet--card">
        <a href="#offer-sync" class="bc-account-sheet--row bc-account-sheet--plus-row" onclick={(e) => (e.preventDefault(), plus('offer'))}>
          <Icon name="cloudDownload" />
          <span class="bc-account-sheet--row-label">
            <BenthicPlusChip onSheet />
            {t('account.free.sync')}
            <span class="bc-account-sheet--row-line">{t('account.free.syncText')}</span>
          </span>
          <Icon name="chevron" size={20} />
        </a>
        <div class="bc-account-sheet--divider bc-account-sheet--margin"></div>
        <a href="#offer-profile" class="bc-account-sheet--row bc-account-sheet--plus-row" onclick={(e) => (e.preventDefault(), plus('offer'))}>
          <Icon name="briefcase" />
          <span class="bc-account-sheet--row-label">
            <BenthicPlusChip onSheet />
            {t('gear.profile.title')}
            <span class="bc-account-sheet--row-line">{t('gear.profile.cardLine')}</span>
          </span>
          <Icon name="chevron" size={20} />
        </a>
      </div>
    {/if}
    {:else}
    <div class="bc-account-sheet--card bc-account-sheet--identity">
      <div class="bc-account-sheet--account">
        <span class="bc-account-sheet--initial" aria-hidden="true">
          {#if initial}{initial}{:else}<Icon name="account" size={22} weight={2} />{/if}
        </span>
        <span class="bc-account-sheet--texts">
          <span class="bc-account-sheet--name">{accountName}</span>
          {#if accountEmail}<span class="bc-account-sheet--email">{accountEmail}</span>{/if}
          <span class="bc-account-sheet--line">{accountLine}</span>
        </span>
      </div>
      <div class="bc-account-sheet--manage">
        <button type="button" class="bc-outlined-button" onclick={manage}>{t('nav.manageAccount')}</button>
      </div>
      {#if !logbook.loading && !logbook.error}
        <div class="bc-account-sheet--divider"></div>
        <div class="bc-account-sheet--sync">
          {#if logbook.syncFailure}
            <SyncFailureRow />
          {:else if logbook.conflict && logbook.conflictLater}
            <SyncFailureRow conflict />
          {:else if manual}
            <div class="bc-account-sheet--manual">
              {#if logbook.pending > 0}
                <span class="bc-account-sheet--pending">{t('nav.pendingChanges', { n: logbook.pending })}</span>
              {:else}
                <!-- Nothing waiting: the last sync, as in automatic sync, not « 0 modification ». -->
                <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={0} progress={logbook.syncProgress} live={false} />
              {/if}
              <SyncButton filled={logbook.pending > 0} />
              <button type="button" class="bc-account-sheet--more" aria-label={t('account.syncOptions')} aria-haspopup="menu" onclick={syncOptions}>
                <Icon name="more" weight={4} />
              </button>
            </div>
          {:else}
            <!-- One row: the cloud and the status take the width, « Synchroniser » on the right; a long
                 status wraps beside the button, never above it (task 2026-11-14-156). -->
            <div class="bc-account-sheet--auto">
              <SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
              {#if logbook.email}<SyncControl />{/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if devAccounts}{#await import('./DevToolsRow.svelte') then dev}{@const DevToolsRow = dev.default}<DevToolsRow />{/await}{/if}

    <!-- Release edition (task 2026-11-17-267): « Mon profil de plongeur », between the account and Réglages, and for a Benthic+
         account « Sauvegarde et restauration » below it (tasks 290 and 291); no chip next to a subscriber's entries. When a piece
         is overdue, the red badge and line (task 2026-11-18-281). -->
    {#if isRelease && !desktopApp}
      <div class="bc-account-sheet--card">
        <a href="#profile" class="bc-account-sheet--row bc-account-sheet--profile" onclick={(e) => (e.preventDefault(), go(() => openOver('/profile')))}>
          <Icon name="briefcase" />
          <span class="bc-account-sheet--row-label">
            {t('gear.profile.title')}
            {#if late.late}
              <span class="bc-account-sheet--row-line bc-account-sheet--late-line">{t('account.sheet.maintenanceLate', { n: late.badge })}</span>
            {:else}
              <span class="bc-account-sheet--row-line">{t('gear.profile.cardLine')}</span>
            {/if}
          </span>
          {#if late.late}<span class="bc-account-sheet--late-badge" role="status" aria-label={t('maintenance.badge', { n: late.badge })}>{late.badge}</span>{/if}
          <Icon name="chevron" size={20} />
        </a>
        {#if subscriber}
          <div class="bc-account-sheet--divider bc-account-sheet--margin"></div>
          <a href="#backup" class="bc-account-sheet--row bc-account-sheet--profile" onclick={(e) => (e.preventDefault(), go(openBackup))}>
            <Icon name="history" />
            <span class="bc-account-sheet--row-label">
              {t('account.sheet.backup')}
              <span class="bc-account-sheet--row-line">{t('account.sheet.backupText')}</span>
            </span>
            <Icon name="chevron" size={20} />
          </a>
        {/if}
      </div>
    {/if}
    {/if}

    <!-- Desktop: Réglages and À propos leave the sheet (rail, or the Mac's menu bar; task 2026-11-15-169). -->
    {#if !desktopApp}
    <div class="bc-account-sheet--card">
      <a href="#settings" class="bc-account-sheet--row" onclick={(e) => (e.preventDefault(), go(openSettings))}>
        <Icon name="settings" />
        <span class="bc-account-sheet--row-label">{t('settings.title')}</span>
        <Icon name="chevron" size={20} />
      </a>
      <div class="bc-account-sheet--divider bc-account-sheet--inset"></div>
      {#if mapUpdates > 0}
        <!-- The message about the update opens the offline maps part of Réglages (todo 89). -->
        <a href="#settings-maps" class="bc-account-sheet--row" onclick={(e) => (e.preventDefault(), go(openMapSettings))}>
          <Icon name="map" />
          <span class="bc-account-sheet--row-label">
            {t('settings.groups.maps')}
            <span class="bc-account-sheet--row-line">{t('nav.mapUpdateWaiting')}</span>
          </span>
          <span class="bc-account-sheet--badge" aria-label={t('nav.mapUpdates', { n: mapUpdates })}>{mapUpdates}</span>
          <Icon name="chevron" size={20} />
        </a>
        <div class="bc-account-sheet--divider bc-account-sheet--inset"></div>
      {/if}
      <a href="#about" class="bc-account-sheet--row" onclick={(e) => (e.preventDefault(), go(openAbout))}>
        <Icon name="info" />
        <span class="bc-account-sheet--row-label">{t('about.title')}</span>
        <Icon name="chevron" size={20} />
      </a>
    </div>
    {/if}
  </div>
  {/if}
</Sheet>

<style>
  @layer bc.components {
    :global(.sheet-modal.bc-account-sheet) {
      --f7-sheet-bg-color: var(--bc-drawer);
      height: auto;
      /* 36 dp corners (task 2026-11-14-158). */
      border-radius: 36px 36px 0 0;
    }

    :global(.sheet-modal.bc-account-sheet.bc-account-sheet--floating) {
      left: calc(var(--bc-nav-width) + var(--bc-safe-left) + 8px);
      bottom: calc(16px + var(--bc-safe-bottom));
      width: 360px;
      border-radius: 36px;
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.15), 0 8px 24px rgb(0 0 0 / 0.12);

      .bc-account-sheet--content {
        padding-bottom: 12px;
      }
    }

    /* iPhone: grouped lists on the grouped background, 10 pt corners at the top. */
    :global(.ios .sheet-modal.bc-account-sheet) {
      --f7-sheet-bg-color: var(--bc-background);
      border-radius: 10px 10px 0 0;
    }

    .bc-account-sheet--ios {
      padding: 0 16px calc(16px + var(--bc-safe-bottom));
    }

    /* Title centred, « OK » at the end: three columns. */
    .bc-account-sheet--ios-bar {
      height: 56px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
    }

    .bc-account-sheet--ios-title {
      grid-column: 2;
      font-size: 17px;
      font-weight: 600;
      color: var(--bc-text);
    }

    .bc-account-sheet--ios-ok {
      grid-column: 3;
      justify-self: end;
      min-width: 44px;
      height: 44px;
      border: none;
      background: none;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
    }

    .bc-account-sheet--ios-group {
      margin-top: 16px;
      border-radius: 10px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-account-sheet--ios-row {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: 10px 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 17px;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;

      & + .bc-account-sheet--ios-row {
        box-shadow: inset 0 0.5px 0 var(--bc-separator);
      }

      :global(.bc-sync-status) {
        padding: 0;
        font-size: 15px;
      }
    }

    .bc-account-sheet--ios-sync {
      justify-content: space-between;
    }

    .bc-account-sheet--ios-identity {
      min-height: 64px;
    }

    /* The chip keeps its own width above the title; the row's icons are the accent colour (the mock-ups' blue). */
    .bc-account-sheet--ios-row :global(.bc-plus-chip) {
      align-self: flex-start;
    }

    .bc-account-sheet--ios-row > :global(.bc-icon) {
      color: var(--bc-secondary);
      flex: none;
    }

    .bc-account-sheet--ios-sync :global(.bc-sync-status) {
      flex: 1;
      min-width: 0;
    }

    .bc-account-sheet--ios-sync > :global(:last-child:not(.bc-sync-status)) {
      flex: none;
    }

    .bc-account-sheet--ios-offer .bc-account-sheet--already {
      justify-content: center;
    }

    /* The free card: the row, then the offer button and « Déjà abonné ? » under it. */
    .bc-account-sheet--ios-offer {
      padding: 0 16px 14px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      text-align: center;
    }

    .bc-account-sheet--ios-link {
      color: var(--bc-secondary);
    }

    .bc-account-sheet--content {
      padding: 8px 8px calc(16px + var(--bc-safe-bottom));
    }

    .bc-account-sheet--head {
      height: 48px;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) 48px;
      align-items: center;
    }

    .bc-account-sheet--brand {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .bc-account-sheet--plus-dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      margin-left: 3px;
      border-radius: 9px;
      background: var(--bc-account-chip);
      color: var(--bc-account-chip-ink);
      font-size: 14px;
      line-height: 1;
      font-weight: 700;
      vertical-align: 1px;
    }

    .bc-account-sheet--close {
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-account-sheet--dark,
    :global(html.dark) .bc-account-sheet--light {
      display: none;
    }

    :global(html.dark) .bc-account-sheet--dark {
      display: block;
    }

    .bc-account-sheet--title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 16px;
      font-weight: 500;
      color: var(--bc-text);
    }

    .bc-account-sheet--auto {
      align-self: stretch;
      display: flex;
      align-items: center;
      gap: 16px;

      :global(.bc-sync-status) {
        flex: 1;
        min-width: 0;
        justify-content: flex-start;
        text-align: start;
        color: var(--bc-text-2);
      }

      > :global(*:last-child) {
        flex: none;
      }
    }

    /* The white cards: 28 dp corners; the identity card (the first) 12 dp narrower on each side (task 2026-11-14-158). */
    .bc-account-sheet--card {
      margin-top: 8px;
      border-radius: 28px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-account-sheet--identity {
      margin-left: 12px;
      margin-right: 12px;
    }

    .bc-account-sheet--account {
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-account-sheet--initial {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      background: var(--bc-nav-avatar-ink);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 600;
    }

    .bc-account-sheet--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-account-sheet--name {
      font-size: 16px;
      font-weight: 500;
      color: var(--bc-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-account-sheet--email {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bc-account-sheet--line {
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-account-sheet--manage {
      padding: 0 16px 16px 68px;
    }

    .bc-account-sheet--divider {
      height: 1px;
      background: var(--bc-row-divider);

      &.bc-account-sheet--inset {
        margin-left: 56px;
      }
    }

    .bc-account-sheet--sync {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;

      :global(.bc-sync-status) {
        padding: 0;
        font-size: 14px;
      }
    }

    .bc-account-sheet--row {
      min-height: 56px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--bc-text);
      text-decoration: none;
      font-size: 16px;
    }

    .bc-account-sheet--row-label {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .bc-account-sheet--row-line {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* Manual sync: the changes waiting, « Synchroniser » and ⋮ on one row. */
    .bc-account-sheet--manual {
      align-self: stretch;
      display: flex;
      align-items: center;
      gap: 8px;

      :global(.bc-sync-status) {
        flex: 1;
        justify-content: flex-start;
      }
    }

    .bc-account-sheet--pending {
      flex: 1;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-pending);
    }

    .bc-account-sheet--more {
      flex: none;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 20px;
      background: var(--bc-surface-container-high);
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Free version (task 2026-11-18-281): the grey silhouette, « S'abonner », « Déjà abonné ? Se connecter », the Benthic+ rows. */
    .bc-account-sheet--silhouette {
      background: var(--bc-surface-container-high);
      color: var(--bc-text-2);
    }

    .bc-account-sheet--offer {
      padding: 0 16px 12px 68px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .bc-account-sheet--subscribe {
      width: auto;
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--bc-release-row-main);
      color: var(--bc-release-on-panel);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }

    .bc-account-sheet--already {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-account-sheet--sign-in {
      width: auto;
      padding: 10px 4px;
      margin: 0 -4px;
      border: none;
      background: none;
      color: var(--bc-release-link);
      font: inherit;
      font-weight: 500;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }

    .bc-account-sheet--plus-row {
      min-height: 64px;
      padding-top: 8px;
      padding-bottom: 8px;
      & .bc-account-sheet--row-label {
        gap: 2px;
        font-size: 16px;

        :global(.bc-plus-chip) {
          align-self: flex-start;
          height: 22px;
          margin-bottom: 2px;
          border-radius: 11px;
          padding: 0 8px 0 6px;
      }
      }
    }

    .bc-account-sheet--divider.bc-account-sheet--margin {
      margin: 0 16px;
    }

    /* « Mon profil de plongeur » of a Benthic+ account: the chip above the title, the overdue pieces in red. */
    .bc-account-sheet--profile .bc-account-sheet--row-label {
      font-size: 16px;
      gap: 2px;

      :global(.bc-plus-chip) {
        align-self: flex-start;
        height: 22px;
        margin-bottom: 2px;
        border-radius: 11px;
        padding: 0 8px 0 6px;
      }
    }

    .bc-account-sheet--row-line.bc-account-sheet--late-line {
      color: var(--bc-late-text);
    }

    .bc-account-sheet--late-badge {
      flex: none;
      min-width: 24px;
      height: 24px;
      padding: 0 6px;
      box-sizing: border-box;
      border-radius: 12px;
      background: var(--bc-late);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }

    .bc-account-sheet--badge {
      padding: 2px 10px;
      border-radius: 12px;
      background: var(--bc-tertiary);
      color: var(--bc-on-tertiary);
      font-size: 12px;
      line-height: 18px;
      font-weight: 600;
    }
  }
</style>
