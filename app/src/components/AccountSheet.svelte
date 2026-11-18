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
  import { logbook, setAutoSync } from '../lib/logbook.svelte.js';
  import { showUnsent } from '../lib/filter.svelte.js';
  import { navigation, openOver, openSettings, openMapSettings, openAbout, showSection } from '../lib/navigation.svelte.js';
  import { updatesCount } from '../lib/offline-maps.svelte.js';
  import { t } from '../lib/i18n.js';
  import { layout, ios, desktopApp } from '../lib/layout.svelte.js';
  import { isRelease } from '../lib/edition.js';

  const initial = $derived(logbook.email ? logbook.email.trim().charAt(0).toLocaleUpperCase() : '');
  const accountName = $derived(logbook.email || t('menu.noAccount'));
  const accountLine = $derived(
    t(logbook.email ? (logbook.mode === 'git' ? 'menu.gitDives' : 'menu.cloudDives') : 'menu.localDives', { n: logbook.dives.length }),
  );
  const mapUpdates = $derived(updatesCount());

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
      content: `<div class="popover od-menu od-account-sheet--menu"><div class="popover-inner"><div class="list no-chevron"><ul>${item('auto', t('account.syncGoAuto'))}${item('unsent', t('account.syncShowPending'))}</ul></div></div></div>`,
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
  class="od-account-sheet{layout.rail ? ' od-account-sheet--floating' : ''}"
  opened={navigation.accountOpen}
  onSheetClosed={() => (navigation.accountOpen = false)}
  backdrop
  swipeToClose
  push={false}
  aria-label={t('nav.accountSheet')}
>
  {#if ios}
  <!-- iPhone (task 2026-11-14-127, appbar-tiroir-ios-ouvert.dc.html): a page sheet « Compte » with
       OK, in grouped lists: the account, the sync, then Réglages and À propos. -->
  <div class="od-account-sheet--ios">
    <div class="od-account-sheet--ios-bar">
      <span class="od-account-sheet--ios-title">{t('account.title')}</span>
      <button type="button" class="od-account-sheet--ios-ok" onclick={() => (navigation.accountOpen = false)}>{t('dialog.ok')}</button>
    </div>
    <div class="od-account-sheet--ios-group">
      <button type="button" class="od-account-sheet--ios-row" onclick={() => go(() => openOver('/account'))}>
        <span class="od-account-sheet--initial" aria-hidden="true">
          {#if initial}{initial}{:else}<Icon name="account" size={22} weight={2} />{/if}
        </span>
        <span class="od-account-sheet--texts">
          <span class="od-account-sheet--name">{accountName}</span>
          <span class="od-account-sheet--line">{accountLine} · {t('nav.manageAccount')}</span>
        </span>
        <Icon name="chevron" size={20} />
      </button>
    </div>
    {#if !logbook.loading && !logbook.error}
      <div class="od-account-sheet--ios-group">
        {#if logbook.syncFailure}
          <div class="od-account-sheet--ios-row"><SyncFailureRow /></div>
        {:else if logbook.conflict && logbook.conflictLater}
          <div class="od-account-sheet--ios-row"><SyncFailureRow conflict /></div>
        {:else if manual && logbook.pending > 0}
          <div class="od-account-sheet--ios-row"><span class="od-account-sheet--pending">{t('nav.pendingChanges', { n: logbook.pending })}</span></div>
        {:else}
          <div class="od-account-sheet--ios-row">
            <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={0} progress={logbook.syncProgress} live={false} />
          </div>
        {/if}
        {#if logbook.email}
          <div class="od-account-sheet--ios-row od-account-sheet--ios-sync"><SyncButton /></div>
          {#if manual}
            <button type="button" class="od-account-sheet--ios-row od-account-sheet--ios-link" onclick={syncOptionsIos}>{t('account.syncOptions')}</button>
          {/if}
        {/if}
      </div>
    {/if}
    {#if isRelease && !desktopApp}
      <div class="od-account-sheet--ios-group">
        <button type="button" class="od-account-sheet--ios-row" onclick={() => go(() => openOver('/profile'))}>
          <Icon name="briefcase" />
          <span class="od-account-sheet--row-label">
            {t('gear.profile.title')}
            <span class="od-account-sheet--row-line">{t('gear.profile.cardLine')}</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
      </div>
    {/if}
    <div class="od-account-sheet--ios-group">
      <button type="button" class="od-account-sheet--ios-row" onclick={() => go(openSettings)}>
        <Icon name="settings" />
        <span class="od-account-sheet--row-label">{t('settings.title')}</span>
        <Icon name="chevron" size={20} />
      </button>
      {#if mapUpdates > 0}
        <!-- The message about the update opens the offline maps part of Réglages (todo 89). -->
        <button type="button" class="od-account-sheet--ios-row" onclick={() => go(openMapSettings)}>
          <Icon name="map" />
          <span class="od-account-sheet--row-label">
            {t('settings.groups.maps')}
            <span class="od-account-sheet--row-line">{t('nav.mapUpdateWaiting')}</span>
          </span>
          <span class="od-account-sheet--badge" aria-label={t('nav.mapUpdates', { n: mapUpdates })}>{mapUpdates}</span>
          <Icon name="chevron" size={20} />
        </button>
      {/if}
      <button type="button" class="od-account-sheet--ios-row" onclick={() => go(openAbout)}>
        <Icon name="info" />
        <span class="od-account-sheet--row-label">{t('about.title')}</span>
        <Icon name="chevron" size={20} />
      </button>
    </div>
  </div>
  {:else}
  <div class="od-account-sheet--content">
    <div class="od-account-sheet--head">
      <button type="button" class="od-account-sheet--close" onclick={() => (navigation.accountOpen = false)}>
        <Icon name="close" /><span class="od-sr-only">{t('nav.close')}</span>
      </button>
      <!-- Centred on the sheet's width: an empty 48 dp slot on the right balances ✕ (task 2026-11-14-156).
           The simple logo with relief (the same drawing in both files, no inline gradient to share) (task 2026-11-14-123). -->
      <span class="od-account-sheet--brand">
        <img class="od-account-sheet--logo od-account-sheet--light" src="/logo-light.svg" alt="" width="24" height="24" />
        <img class="od-account-sheet--logo od-account-sheet--dark" src="/logo-dark.svg" alt="" width="24" height="24" />
        <span class="od-account-sheet--title">{t('menu.title')}</span>
      </span>
      <span aria-hidden="true"></span>
    </div>

    <div class="od-account-sheet--card od-account-sheet--identity">
      <div class="od-account-sheet--account">
        <span class="od-account-sheet--initial" aria-hidden="true">
          {#if initial}{initial}{:else}<Icon name="account" size={22} weight={2} />{/if}
        </span>
        <span class="od-account-sheet--texts">
          <span class="od-account-sheet--name">{accountName}</span>
          <span class="od-account-sheet--line">{accountLine}</span>
        </span>
      </div>
      <div class="od-account-sheet--manage">
        <button type="button" class="od-outlined-button" onclick={() => go(() => openOver('/account'))}>{t('nav.manageAccount')}</button>
      </div>
      {#if !logbook.loading && !logbook.error}
        <div class="od-account-sheet--divider"></div>
        <div class="od-account-sheet--sync">
          {#if logbook.syncFailure}
            <SyncFailureRow />
          {:else if logbook.conflict && logbook.conflictLater}
            <SyncFailureRow conflict />
          {:else if manual}
            <div class="od-account-sheet--manual">
              {#if logbook.pending > 0}
                <span class="od-account-sheet--pending">{t('nav.pendingChanges', { n: logbook.pending })}</span>
              {:else}
                <!-- Nothing waiting: the last sync, as in automatic sync, not « 0 modification ». -->
                <SyncStatus sync={logbook.sync === 'manual' ? 'cloud' : logbook.sync} pending={0} progress={logbook.syncProgress} live={false} />
              {/if}
              <SyncButton filled={logbook.pending > 0} />
              <button type="button" class="od-account-sheet--more" aria-label={t('account.syncOptions')} aria-haspopup="menu" onclick={syncOptions}>
                <Icon name="more" weight={4} />
              </button>
            </div>
          {:else}
            <!-- One row: the cloud and the status take the width, « Synchroniser » on the right; a long
                 status wraps beside the button, never above it (task 2026-11-14-156). -->
            <div class="od-account-sheet--auto">
              <SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
              {#if logbook.email}<SyncControl />{/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Release edition (task 2026-11-17-267): « Mon profil de plongeur », between the account and Réglages. -->
    {#if isRelease && !desktopApp}
      <div class="od-account-sheet--card">
        <a href="#profile" class="od-account-sheet--row" onclick={(e) => (e.preventDefault(), go(() => openOver('/profile')))}>
          <Icon name="briefcase" />
          <span class="od-account-sheet--row-label">
            {t('gear.profile.title')}
            <span class="od-account-sheet--row-line">{t('gear.profile.cardLine')}</span>
          </span>
          <Icon name="chevron" size={20} />
        </a>
      </div>
    {/if}

    <!-- Desktop: Réglages and À propos leave the sheet (rail, or the Mac's menu bar; task 2026-11-15-169). -->
    {#if !desktopApp}
    <div class="od-account-sheet--card">
      <a href="#settings" class="od-account-sheet--row" onclick={(e) => (e.preventDefault(), go(openSettings))}>
        <Icon name="settings" />
        <span class="od-account-sheet--row-label">{t('settings.title')}</span>
        <Icon name="chevron" size={20} />
      </a>
      <div class="od-account-sheet--divider od-account-sheet--inset"></div>
      {#if mapUpdates > 0}
        <!-- The message about the update opens the offline maps part of Réglages (todo 89). -->
        <a href="#settings-maps" class="od-account-sheet--row" onclick={(e) => (e.preventDefault(), go(openMapSettings))}>
          <Icon name="map" />
          <span class="od-account-sheet--row-label">
            {t('settings.groups.maps')}
            <span class="od-account-sheet--row-line">{t('nav.mapUpdateWaiting')}</span>
          </span>
          <span class="od-account-sheet--badge" aria-label={t('nav.mapUpdates', { n: mapUpdates })}>{mapUpdates}</span>
          <Icon name="chevron" size={20} />
        </a>
        <div class="od-account-sheet--divider od-account-sheet--inset"></div>
      {/if}
      <a href="#about" class="od-account-sheet--row" onclick={(e) => (e.preventDefault(), go(openAbout))}>
        <Icon name="info" />
        <span class="od-account-sheet--row-label">{t('about.title')}</span>
        <Icon name="chevron" size={20} />
      </a>
    </div>
    {/if}
  </div>
  {/if}
</Sheet>

<style>
  @layer od.components {
    :global(.sheet-modal.od-account-sheet) {
      --f7-sheet-bg-color: var(--od-drawer);
      height: auto;
      /* 36 dp corners (task 2026-11-14-158). */
      border-radius: 36px 36px 0 0;
    }

    :global(.sheet-modal.od-account-sheet.od-account-sheet--floating) {
      left: calc(var(--od-nav-width) + env(safe-area-inset-left) + 8px);
      bottom: calc(16px + env(safe-area-inset-bottom));
      width: 360px;
      border-radius: 36px;
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.15), 0 8px 24px rgb(0 0 0 / 0.12);

      .od-account-sheet--content {
        padding-bottom: 12px;
      }
    }

    /* iPhone: grouped lists on the grouped background, 10 pt corners at the top. */
    :global(.ios .sheet-modal.od-account-sheet) {
      --f7-sheet-bg-color: var(--od-background);
      border-radius: 10px 10px 0 0;
    }

    .od-account-sheet--ios {
      padding: 0 16px calc(16px + env(safe-area-inset-bottom));
    }

    /* Title centred, « OK » at the end: three columns. */
    .od-account-sheet--ios-bar {
      height: 56px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
    }

    .od-account-sheet--ios-title {
      grid-column: 2;
      font-size: 17px;
      font-weight: 600;
      color: var(--od-text);
    }

    .od-account-sheet--ios-ok {
      grid-column: 3;
      justify-self: end;
      min-width: 44px;
      height: 44px;
      border: none;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
    }

    .od-account-sheet--ios-group {
      margin-top: 16px;
      border-radius: 10px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-account-sheet--ios-row {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: 10px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 17px;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;

      & + .od-account-sheet--ios-row {
        box-shadow: inset 0 0.5px 0 var(--od-separator);
      }

      :global(.od-sync-status) {
        padding: 0;
        font-size: 15px;
      }
    }

    .od-account-sheet--ios-sync {
      justify-content: center;
    }

    .od-account-sheet--ios-link {
      color: var(--od-secondary);
    }

    .od-account-sheet--content {
      padding: 8px 8px calc(16px + env(safe-area-inset-bottom));
    }

    .od-account-sheet--head {
      height: 48px;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) 48px;
      align-items: center;
    }

    .od-account-sheet--brand {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .od-account-sheet--close {
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-account-sheet--dark,
    :global(html.dark) .od-account-sheet--light {
      display: none;
    }

    :global(html.dark) .od-account-sheet--dark {
      display: block;
    }

    .od-account-sheet--title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 16px;
      font-weight: 500;
      color: var(--od-text);
    }

    .od-account-sheet--auto {
      align-self: stretch;
      display: flex;
      align-items: center;
      gap: 16px;

      :global(.od-sync-status) {
        flex: 1;
        min-width: 0;
        justify-content: flex-start;
        text-align: start;
        color: var(--od-text-2);
      }

      > :global(*:last-child) {
        flex: none;
      }
    }

    /* The white cards: 28 dp corners; the identity card (the first) 12 dp narrower on each side (task 2026-11-14-158). */
    .od-account-sheet--card {
      margin-top: 8px;
      border-radius: 28px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-account-sheet--identity {
      margin-left: 12px;
      margin-right: 12px;
    }

    .od-account-sheet--account {
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-account-sheet--initial {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      background: var(--od-nav-avatar-ink);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 600;
    }

    .od-account-sheet--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-account-sheet--name {
      font-size: 16px;
      font-weight: 500;
      color: var(--od-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .od-account-sheet--line {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-account-sheet--manage {
      padding: 0 16px 16px 68px;
    }

    .od-account-sheet--divider {
      height: 1px;
      background: var(--od-row-divider);

      &.od-account-sheet--inset {
        margin-left: 56px;
      }
    }

    .od-account-sheet--sync {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;

      :global(.od-sync-status) {
        padding: 0;
        font-size: 14px;
      }
    }

    .od-account-sheet--row {
      min-height: 56px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--od-text);
      text-decoration: none;
      font-size: 16px;
    }

    .od-account-sheet--row-label {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .od-account-sheet--row-line {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    /* Manual sync: the changes waiting, « Synchroniser » and ⋮ on one row. */
    .od-account-sheet--manual {
      align-self: stretch;
      display: flex;
      align-items: center;
      gap: 8px;

      :global(.od-sync-status) {
        flex: 1;
        justify-content: flex-start;
      }
    }

    .od-account-sheet--pending {
      flex: 1;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-pending);
    }

    .od-account-sheet--more {
      flex: none;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 20px;
      background: var(--od-surface-container-high);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-account-sheet--badge {
      padding: 2px 10px;
      border-radius: 12px;
      background: var(--od-tertiary);
      color: var(--od-on-tertiary);
      font-size: 12px;
      line-height: 18px;
      font-weight: 600;
    }
  }
</style>
