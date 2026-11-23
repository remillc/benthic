<script>
  // @ts-check
  // Side menu of the phone layout (spec, section 3, "Side menu" and "Side menu
  // and section headers, identity"): the identity band with the account card,
  // the four sections, Settings and About, then the sync card. A modal
  // navigation drawer on Android (MD3); on iOS a panel drawn for the project,
  // as iOS has none. Opens only with the ☰ button: the panel follows a swipe
  // to close, never an edge swipe to open, which stays iOS's swipe back.
  import { onDestroy } from 'svelte';
  import { Panel } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import SyncFailureRow from './SyncFailureRow.svelte';
  import SyncButton from './SyncButton.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { navigation, sections, goToSection, closeMenu, restoreFocus, openSettings, openAbout } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';
  import { BAND_PROFILE } from '../lib/band-profile.js';
  import { updatesCount } from '../lib/offline-maps.svelte.js';
  import { tolerantTaps } from '../lib/tap.js';

  /** @type {Record<string, 'logbook'|'sites'|'profile'|'statistics'|'tools'>} */
  const icons = { logbook: 'logbook', sites: 'sites', profile: 'profile', statistics: 'statistics', tools: 'tools' };

  const PROFILE = BAND_PROFILE;

  /** @type {HTMLElement|undefined} */
  let menu = $state();

  /** While open, the screens behind cannot be reached, by touch or by a screen reader. */
  function setBackgroundInert(/** @type {boolean} */ inert) {
    document.querySelector('.views')?.toggleAttribute('inert', inert);
  }

  function onOpen() {
    navigation.menuOpen = true;
    setBackgroundInert(true);
  }

  function onOpened() {
    menu?.querySelector(/** @type {'a'} */ ('[aria-current="page"]'))?.focus();
  }

  function onClose() {
    navigation.menuOpen = false;
    setBackgroundInert(false);
  }

  /**
   * @param {MouseEvent} e
   * @param {() => void} go
   */
  function choose(e, go) {
    e.preventDefault();
    closeMenu();
    go();
  }

  onDestroy(() => setBackgroundInert(false));

  /** The row of the screen shown: Settings or About over a section, else the section. */
  const current = $derived(navigation.page || navigation.section);
  /** Map updates waiting: the badge on Settings (appbar-tiroir-android-maj-cartes.dc.html). */
  const mapUpdates = $derived(updatesCount());
  const accountName = $derived(logbook.email || t('menu.noAccount'));
  const accountLine = $derived(t(logbook.email ? (logbook.mode === 'git' ? (logbook.benthicPlus ? 'menu.serverDives' : 'menu.gitDives') : 'menu.cloudDives') : 'menu.localDives',{ n: logbook.dives.length }));
</script>

<Panel
  id="bc-menu"
  class="bc-nav-menu bc-menu"
  left
  cover
  swipe
  swipeOnlyClose
  role="dialog"
  aria-modal="true"
  aria-label={t('menu.title')}
  onPanelOpen={onOpen}
  onPanelOpened={onOpened}
  onPanelClose={onClose}
  onPanelClosed={restoreFocus}
>
  <nav class="bc-nav-menu--menu" aria-label={t('menu.sections')} bind:this={menu} use:tolerantTaps>
    <div class="bc-nav-menu--band">
      <svg class="bc-nav-menu--profile" width="300" height="34" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
        <path d="{PROFILE} V140 H0 Z" class="bc-nav-menu--area" />
        <path d={PROFILE} class="bc-sync-status--line" />
      </svg>
      <div class="bc-nav-menu--brand">
        <img src="logo-menu.svg" alt="" width="44" height="44" />
        <span class="bc-nav-menu--name">{t('menu.title')}</span>
      </div>
      <a href="#account" class="bc-nav-menu--account" aria-label={t('menu.accountLabel', { name: accountName })} onclick={(e) => choose(e, () => goToSection('account'))}>
        <Icon name="account" />
        <span class="bc-nav-menu--texts">
          <span class="bc-nav-menu--address">{accountName}</span>
          <span class="bc-nav-menu--line-2">{accountLine}</span>
        </span>
        <Icon name="chevron" size={20} />
      </a>
      <svg class="bc-nav-menu--wave" width="300" height="18" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
    </div>

    {#each sections() as section (section)}
      <a href="#{section}" class="bc-nav-menu--item" aria-current={current === section ? 'page' : undefined} onclick={(e) => choose(e, () => goToSection(section))}>
        <Icon name={icons[section]} />
        <span>{t(`tabs.${section}`)}</span>
      </a>
    {/each}
    <div class="bc-nav-menu--separator" role="separator"></div>
    <a href="#settings" class="bc-nav-menu--item" aria-current={current === 'settings' ? 'page' : undefined} onclick={(e) => choose(e, openSettings)}>
      <Icon name="settings" />
      <span class="bc-nav-menu--label">{t('settings.title')}</span>
      {#if mapUpdates > 0}
        <span class="badge" aria-label={t('settings.maps.updates', { n: mapUpdates })}>{mapUpdates}</span>
      {/if}
    </a>
    <a href="#about" class="bc-nav-menu--item" aria-current={current === 'about' ? 'page' : undefined} onclick={(e) => choose(e, openAbout)}>
      <Icon name="info" />
      <span>{t('about.title')}</span>
    </a>
    <div class="bc-nav-menu--spacer"></div>
    {#if !logbook.loading && !logbook.error}
      <div class="bc-nav-menu--status">
        <!-- The button stays in place while it runs and shows its progress (to-do #2). -->
        {#if logbook.email}<SyncButton />{/if}
        {#if logbook.syncFailure}
          <SyncFailureRow />
        {:else if logbook.conflict && logbook.conflictLater}
          <SyncFailureRow conflict />
        {:else}
          <SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} steady />
        {/if}
      </div>
    {/if}
  </nav>
</Panel>

<style>
  @layer bc.components {
    :global(.panel.bc-menu) {
      --f7-panel-width: 300px;
      --f7-panel-bg-color: var(--bc-drawer);
      border-radius: 0 16px 16px 0;
      box-shadow: 0 8px 30px rgb(0 0 0 / 0.18);
    }

    :global(.ios .panel.bc-menu) {
      --f7-panel-bg-color: var(--bc-surface);
    }

    .bc-nav-menu--menu {
      min-height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-bottom: calc(var(--f7-safe-area-bottom) + 16px);
      color: var(--bc-text);
    }

    .bc-nav-menu--band {
      position: relative;
      overflow: hidden;
      margin-bottom: 12px;
      padding: calc(var(--f7-safe-area-top) + 16px) 20px 40px;
      border-radius: 0 16px 0 0;
      background-image: var(--bc-band-grain), var(--bc-band-gradient);
      background-size: 256px 256px, auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
      color: var(--bc-on-band);
    }

    .bc-nav-menu--profile {
      position: absolute;
      left: 0;
      bottom: 2px;
      width: 100%;
      height: 34px;

      .bc-nav-menu--area {
        fill: var(--bc-band-profile-area);
      }

      .bc-sync-status--line {
        fill: none;
        stroke: var(--bc-band-profile-line);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }
    }

    .bc-nav-menu--wave {
      position: absolute;
      left: 0;
      bottom: -1px;
      width: 100%;
      height: 18px;
      display: block;

      path {
        fill: var(--f7-panel-bg-color);
      }
    }

    .bc-nav-menu--brand {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;

      .bc-nav-menu--name {
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
      }
    }

    .bc-nav-menu--account {
      position: relative;
      padding: 10px 10px 10px 12px;
      border-radius: 16px;
      background: rgb(255 255 255 / 0.72);
      display: flex;
      align-items: center;
      gap: 12px;
      /* A light card on the band: dark ink, as the mock-up draws it. */
      color: var(--bc-on-band-control);
      text-decoration: none;

      .bc-nav-menu--texts {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .bc-nav-menu--address {
        font-size: 14px;
        line-height: 20px;
        font-weight: 500;
        letter-spacing: 0.1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bc-nav-menu--line-2 {
        font-size: 12px;
        line-height: 16px;
        letter-spacing: 0.4px;
        color: var(--bc-on-band-control-2);
      }
    }

    /* Android: MD3 drawer item, 56 dp pill. */
    .bc-nav-menu--item {
      margin: 0 12px;
      min-height: 56px;
      padding: 0 16px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--bc-text);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      text-decoration: none;

      &[aria-current='page'] {
        background: var(--bc-water-top);
        /* The pill stays light in dark mode too: dark ink on it. */
        color: var(--bc-on-band-control);
        font-weight: 700;

        :global(svg) {
          fill: currentColor;
        }

        /* The notebook's spine, cut out of the filled shape in the pill's colour. */
        :global(.bc-icon--accent) {
          fill: none;
          stroke: var(--bc-water-top);
        }
      }
      & .bc-nav-menu--label {
        flex: 1;
      }
    }

    /* Count of waiting map updates: on the tertiary role (what waits for the diver), a number and a name, not the colour alone. */
    .badge {
      min-width: 24px;
      height: 24px;
      padding: 0 7px;
      box-sizing: border-box;
      border-radius: 12px;
      background: var(--bc-tertiary);
      color: var(--bc-on-tertiary);
      font-size: 12px;
      line-height: 24px;
      font-weight: 700;
      text-align: center;
    }

    .bc-nav-menu--separator {
      height: 1px;
      margin: 8px 28px;
      background: var(--bc-separator);
    }

    .bc-nav-menu--spacer {
      flex: 1;
      min-height: 12px;
    }

    /* The sync card: the button and the state, centred. */
    .bc-nav-menu--status {
      margin: 0 12px 16px;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;

      /* The state line under the button: 13/18, secondary ink, no padding of its own. */
      :global(.bc-sync-status) {
        padding: 0;
        font-size: 13px;
        line-height: 18px;
        color: var(--bc-text-2);
      }

      :global(.bc-sync-status .bc-icon) {
        width: 20px;
        height: 20px;
      }

      :global(.bc-sync-status.bc-sync-status--pending) {
        color: var(--bc-tertiary);
      }

      :global(.bc-sync-status),
      :global(.bc-sync-status .bc-sync-status--line) {
        justify-content: center;
        text-align: center;
        min-height: 0;
      }
    }

    /* iOS: 48 pt rows with a rounded highlight. */
    :global(.ios) {
      .bc-nav-menu--item {
        margin: 0 10px;
        min-height: 48px;
        padding: 0 12px;
        border-radius: 10px;
        gap: 14px;
        font-size: 17px;
        font-weight: 400;
        letter-spacing: normal;

        &[aria-current='page'] {
          font-weight: 600;
        }
      }

      .bc-nav-menu--separator {
        margin: 8px 16px;
      }
    }
  }
</style>
