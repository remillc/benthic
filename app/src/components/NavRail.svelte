<script>
  // @ts-check
  // Main navigation of the tablet layout (spec, section 3): the 220 px sidebar
  // on iPad, the 96 px navigation rail on Android (no "+": it is the floating button of the
  // Logbook, spec section 7). iPad: the sections, then Account, Settings and About. Android (task
  // 2026-11-14-126): the sections drawn as in the phone's bottom bar, and at the bottom only the
  // account avatar, which opens the account sheet. The phones have their own navigation
  // (NavigationBar.svelte on Android, NavMenu.svelte on iPhone).
  import Icon from './Icon.svelte';
  import NavIcon from './NavIcon.svelte';
  import AccountAvatar from './AccountAvatar.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { ios, desktopApp, desktopMac } from '../lib/layout.svelte.js';
  import { navigation, sections, goToSection, openSettings, openAbout } from '../lib/navigation.svelte.js';
  import { t } from '../lib/i18n.js';
  import { tolerantTaps } from '../lib/tap.js';

  /**
   * @param {MouseEvent} e
   * @param {() => void} go
   */
  function choose(e, go) {
    e.preventDefault();
    go();
  }
</script>

<nav class="od-nav-rail od-nav-rail--rail" class:ios aria-label={t('menu.sections')} use:tolerantTaps>
  {#if ios}
    <p class="od-nav-rail--title">{t('menu.title')}</p>
  {/if}
  {#each sections as section (section)}
    <a
      href="#{section}"
      class="od-nav-rail--item"
      aria-current={navigation.section === section ? 'page' : undefined}
      onclick={(e) => choose(e, () => goToSection(section))}
    >
      <span class="od-nav-rail--icon">
        {#if ios}<Icon name={section} size={22} />{:else}<NavIcon {section} active={navigation.section === section} />{/if}
      </span>
      <span class="od-nav-rail--label">{t(`tabs.${section}`)}</span>
    </a>
  {/each}
  <div class="od-nav-rail--spacer"></div>
  {#if !ios}
  <!-- Desktop, Windows and Linux: Réglages above the avatar (task 2026-11-15-169); the Mac has it in its menu bar. -->
  {#if desktopApp && !desktopMac}
    <a href="#settings" class="od-nav-rail--item od-nav-rail--settings" aria-current={navigation.page === 'settings' ? 'page' : undefined} title="{t('settings.title')} (Ctrl+,)" onclick={(e) => choose(e, openSettings)}>
      <span class="od-nav-rail--icon"><Icon name="settings" size={24} /></span>
      <span class="od-nav-rail--label">{t('settings.title')}</span>
    </a>
  {/if}
  <AccountAvatar rail />{:else}
  <a
    href="#account"
    class="od-nav-rail--item od-nav-rail--bottom"
    aria-current={navigation.section === 'account' ? 'page' : undefined}
    onclick={(e) => choose(e, () => goToSection('account'))}
  >
    <span class="od-nav-rail--icon"><Icon name="account" size={ios ? 22 : 24} /></span>
    <span class="od-nav-rail--label" class:od-sr-only={!ios}>{t('account.title')}</span>
  </a>
  <a href="#settings" class="od-nav-rail--item od-nav-rail--bottom" onclick={(e) => choose(e, openSettings)}>
    <span class="od-nav-rail--icon"><Icon name="settings" size={ios ? 22 : 24} /></span>
    <span class="od-nav-rail--label" class:od-sr-only={!ios}>{t('settings.title')}</span>
  </a>
  <a href="#about" class="od-nav-rail--item" onclick={(e) => choose(e, openAbout)}>
    <span class="od-nav-rail--icon"><Icon name="info" size={ios ? 22 : 24} /></span>
    <span class="od-nav-rail--label" class:od-sr-only={!ios}>{t('about.title')}</span>
  </a>
  {/if}
  {#if ios && !logbook.loading && !logbook.error}
    <div class="od-nav-rail--status"><SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} /></div>
  {/if}
</nav>

<style>
  @layer od.components {
    /* Android: Material 3 navigation rail. */
    .od-nav-rail--rail {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 6000;
      /* It also covers the left safe area (camera cut-out in landscape). */
      width: calc(var(--od-nav-width) + env(safe-area-inset-left));
      box-sizing: border-box;
      padding: calc(var(--f7-safe-area-top) + 24px) 0 calc(var(--f7-safe-area-bottom) + 16px) env(safe-area-inset-left);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      background: var(--od-background);
      color: var(--od-text);
    }

    .od-nav-rail--item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 56px;
      color: var(--od-text-2);
      font-size: 13px;
      line-height: 16px;
      font-weight: 400;
      text-decoration: none;

      .od-nav-rail--icon {
        width: 56px;
        height: 32px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* As the phone's bottom bar: the active section in the secondary colour on its pill. */
      &[aria-current='page'] {
        color: var(--od-nav-active);
        font-weight: 600;

        .od-nav-rail--icon {
          background: var(--od-nav-active-container);
          color: var(--od-nav-active);
        }
      }

      /* Account and Settings: icons only in the rail, in 48 dp targets. */
      &.od-nav-rail--bottom {
        gap: 0;

        .od-nav-rail--icon {
          width: 48px;
          height: 48px;
          border-radius: 24px;
        }
      }
    }

    /* Mouse (the desktop app, task 2026-11-15-180): the Material 3 hover layer on the pill, ink
       for the icon and label; the active pill keeps its colours under the layer. An action: the hand pointer
       (docs/system-design.md, « Pointer »). */
    @media (hover: hover) and (pointer: fine) {
      .od-nav-rail--item {
        cursor: pointer;

        .od-nav-rail--icon {
          position: relative;
        }
        .od-nav-rail--icon::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: var(--od-text);
          opacity: 0;
          transition: opacity 120ms linear;
        }
        &:hover .od-nav-rail--icon::after {
          opacity: 0.08;
        }
        &:hover:not([aria-current='page']) {
          color: var(--od-text);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .od-nav-rail--item .od-nav-rail--icon::after {
        transition: none;
      }
    }
    /* Keyboard focus: the Material 3 focus ring, 2 dp outside the pill. */
    .od-nav-rail--item:focus-visible {
      outline: none;

      .od-nav-rail--icon {
        outline: 2px solid var(--od-on-table-selected);
        outline-offset: 2px;
      }
    }

    .od-nav-rail--spacer {
      flex: 1;
    }

    .od-nav-rail--title,
    .od-nav-rail--status {
      display: none;
    }

    /* iPad: sidebar with 44 pt rows and a rounded highlight. */
    .od-nav-rail--rail.ios {
      align-items: stretch;
      gap: 2px;
      padding: calc(var(--f7-safe-area-top) + 32px) 12px calc(var(--f7-safe-area-bottom) + 16px)
        calc(12px + env(safe-area-inset-left));
      border-right: 0.5px solid var(--od-separator);

      .od-nav-rail--title {
        display: block;
        margin: 0;
        padding: 0 10px 14px;
        font-size: 22px;
        font-weight: 700;
      }

      .od-nav-rail--item,
      .od-nav-rail--item.od-nav-rail--bottom {
        height: 44px;
        flex-direction: row;
        gap: 10px;
        padding: 0 10px;
        border-radius: 10px;
        color: var(--od-text);
        font-size: 17px;
        font-weight: 400;
        letter-spacing: normal;

        .od-nav-rail--icon,
        &.od-nav-rail--bottom .od-nav-rail--icon {
          width: 22px;
          height: 22px;
          border-radius: 0;
          background: none;
        }

        &[aria-current='page'] {
          background: var(--od-tint);
          font-weight: 600;

          .od-nav-rail--icon {
            background: none;
          }
        }
      }

      .od-nav-rail--status {
        display: block;
        margin: 6px 10px 0;
      }
    }
  }
</style>
