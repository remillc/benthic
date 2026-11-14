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
  import { navigation, openOver, openSettings, openAbout, showSection } from '../lib/navigation.svelte.js';
  import { updatesCount } from '../lib/offline-maps.svelte.js';
  import { t } from '../lib/i18n.js';
  import { layout } from '../lib/layout.svelte.js';

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
  <div class="od-account-sheet--content">
    <div class="od-account-sheet--head">
      <button type="button" class="od-account-sheet--close" onclick={() => (navigation.accountOpen = false)}>
        <Icon name="close" /><span class="od-sr-only">{t('nav.close')}</span>
      </button>
      <!-- The retained logo of the light surfaces, and its dark variant (task 2026-11-14-123). -->
      <img class="od-account-sheet--logo od-account-sheet--light" src="/logo-light.svg" alt="" width="24" height="24" />
      <img class="od-account-sheet--logo od-account-sheet--dark" src="/logo-dark.svg" alt="" width="24" height="24" />
      <span class="od-account-sheet--title">{t('menu.title')}</span>
    </div>

    <div class="od-account-sheet--card">
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
            <SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
          {/if}
          {#if logbook.email && !manual}<SyncControl />{/if}
        </div>
      {/if}
    </div>

    <div class="od-account-sheet--card">
      <a href="#settings" class="od-account-sheet--row" onclick={(e) => (e.preventDefault(), go(openSettings))}>
        <Icon name="settings" />
        <span class="od-account-sheet--row-label">
          {t('settings.title')}
          {#if mapUpdates > 0}<span class="od-account-sheet--row-line">{t('nav.mapUpdateWaiting')}</span>{/if}
        </span>
        {#if mapUpdates > 0}<span class="od-account-sheet--badge" aria-label={t('nav.mapUpdates', { n: mapUpdates })}>{mapUpdates}</span>{/if}
        <Icon name="chevron" size={20} />
      </a>
      <div class="od-account-sheet--divider od-account-sheet--inset"></div>
      <a href="#about" class="od-account-sheet--row" onclick={(e) => (e.preventDefault(), go(openAbout))}>
        <Icon name="info" />
        <span class="od-account-sheet--row-label">{t('about.title')}</span>
        <Icon name="chevron" size={20} />
      </a>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.sheet-modal.od-account-sheet) {
      --f7-sheet-bg-color: var(--od-drawer);
      height: auto;
      border-radius: 28px 28px 0 0;
    }

    :global(.sheet-modal.od-account-sheet.od-account-sheet--floating) {
      left: calc(var(--od-nav-width) + env(safe-area-inset-left) + 8px);
      bottom: calc(16px + env(safe-area-inset-bottom));
      width: 360px;
      border-radius: 28px;
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.15), 0 8px 24px rgb(0 0 0 / 0.12);

      .od-account-sheet--content {
        padding-bottom: 12px;
      }
    }

    .od-account-sheet--content {
      padding: 8px 8px calc(16px + env(safe-area-inset-bottom));
    }

    .od-account-sheet--head {
      height: 48px;
      display: flex;
      align-items: center;
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
      font-size: 16px;
      font-weight: 500;
      color: var(--od-text);
    }

    .od-account-sheet--card {
      margin-top: 8px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
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
