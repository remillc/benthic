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

<nav class="bc-nav-rail bc-nav-rail--rail" class:ios aria-label={t('menu.sections')} use:tolerantTaps>
  {#if ios}
    <p class="bc-nav-rail--title">{t('menu.title')}</p>
  {/if}
  {#each sections as section (section)}
    <a
      href="#{section}"
      class="bc-nav-rail--item"
      aria-current={navigation.section === section ? 'page' : undefined}
      onclick={(e) => choose(e, () => goToSection(section))}
    >
      <span class="bc-nav-rail--icon">
        {#if ios}<Icon name={section} size={22} />{:else}<NavIcon {section} active={navigation.section === section} />{/if}
      </span>
      <span class="bc-nav-rail--label">{t(`tabs.${section}`)}</span>
    </a>
  {/each}
  <div class="bc-nav-rail--spacer"></div>
  {#if !ios}
  <!-- Desktop, Windows and Linux: Réglages above the avatar (task 2026-11-15-169); the Mac has it in its menu bar. -->
  {#if desktopApp && !desktopMac}
    <a href="#settings" class="bc-nav-rail--item bc-nav-rail--settings" aria-current={navigation.page === 'settings' ? 'page' : undefined} title="{t('settings.title')} (Ctrl+,)" onclick={(e) => choose(e, openSettings)}>
      <span class="bc-nav-rail--icon"><Icon name="settings" size={24} /></span>
      <span class="bc-nav-rail--label">{t('settings.title')}</span>
    </a>
  {/if}
  <AccountAvatar rail />{:else}
  <a
    href="#account"
    class="bc-nav-rail--item bc-nav-rail--bottom"
    aria-current={navigation.section === 'account' ? 'page' : undefined}
    onclick={(e) => choose(e, () => goToSection('account'))}
  >
    <span class="bc-nav-rail--icon"><Icon name="account" size={ios ? 22 : 24} /></span>
    <span class="bc-nav-rail--label" class:bc-sr-only={!ios}>{t('account.title')}</span>
  </a>
  <a href="#settings" class="bc-nav-rail--item bc-nav-rail--bottom" onclick={(e) => choose(e, openSettings)}>
    <span class="bc-nav-rail--icon"><Icon name="settings" size={ios ? 22 : 24} /></span>
    <span class="bc-nav-rail--label" class:bc-sr-only={!ios}>{t('settings.title')}</span>
  </a>
  <a href="#about" class="bc-nav-rail--item" onclick={(e) => choose(e, openAbout)}>
    <span class="bc-nav-rail--icon"><Icon name="info" size={ios ? 22 : 24} /></span>
    <span class="bc-nav-rail--label" class:bc-sr-only={!ios}>{t('about.title')}</span>
  </a>
  {/if}
  {#if ios && !logbook.loading && !logbook.error}
    <div class="bc-nav-rail--status"><SyncStatus sync={logbook.sync} pending={logbook.pending} progress={logbook.syncProgress} live={false} /></div>
  {/if}
</nav>

<style>
  @layer od.components {
    /* Android: Material 3 navigation rail. */
    .bc-nav-rail--rail {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 6000;
      /* It also covers the left safe area (camera cut-out in landscape). */
      width: calc(var(--bc-nav-width) + var(--bc-safe-left));
      box-sizing: border-box;
      padding: calc(var(--f7-safe-area-top) + 24px) 0 calc(var(--f7-safe-area-bottom) + 16px) var(--bc-safe-left);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      /* Never cut at the foot: a window too low for the rail's items makes it scroll, with no visible bar. */
      overflow-y: auto;
      scrollbar-width: none;
      background: var(--bc-background);
      color: var(--bc-text);
      & > :not(.bc-nav-rail--spacer) {
        flex-shrink: 0;
      }
    }

    /* A low window (the desktop app's smallest is 560 dp, less its title bar): closer items keep the account button in view. */
    @media (max-height: 520px) {
      .bc-nav-rail--rail {
        gap: 4px;
        padding-top: calc(var(--f7-safe-area-top) + 12px);
      }
    }

    .bc-nav-rail--item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 56px;
      color: var(--bc-text-2);
      font-size: 13px;
      line-height: 16px;
      font-weight: 400;
      text-decoration: none;

      .bc-nav-rail--icon {
        width: 56px;
        height: 32px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* As the phone's bottom bar: the active section in the secondary colour on its pill. */
      &[aria-current='page'] {
        color: var(--bc-nav-active);
        font-weight: 600;

        .bc-nav-rail--icon {
          background: var(--bc-nav-active-container);
          color: var(--bc-nav-active);
        }
      }

      /* Account and Settings: icons only in the rail, in 48 dp targets. */
      &.bc-nav-rail--bottom {
        gap: 0;

        .bc-nav-rail--icon {
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
      .bc-nav-rail--item {
        cursor: pointer;

        .bc-nav-rail--icon {
          position: relative;
          &::after {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: inherit;
            background: var(--bc-text);
            opacity: 0;
            transition: opacity 120ms linear;
          }
        }
        &:hover .bc-nav-rail--icon::after {
          opacity: 0.08;
        }
        &:hover:not([aria-current='page']) {
          color: var(--bc-text);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-nav-rail--item .bc-nav-rail--icon::after {
        transition: none;
      }
    }
    /* Keyboard focus: the Material 3 focus ring, 2 dp outside the pill. */
    .bc-nav-rail--item:focus-visible {
      outline: none;

      .bc-nav-rail--icon {
        outline: 2px solid var(--bc-on-table-selected);
        outline-offset: 2px;
      }
    }

    .bc-nav-rail--spacer {
      flex: 1;
    }

    .bc-nav-rail--title,
    .bc-nav-rail--status {
      display: none;
    }

    /* iPad: sidebar with 44 pt rows and a rounded highlight. */
    .bc-nav-rail--rail.ios {
      align-items: stretch;
      gap: 2px;
      padding: calc(var(--f7-safe-area-top) + 32px) 12px calc(var(--f7-safe-area-bottom) + 16px)
        calc(12px + var(--bc-safe-left));
      border-right: 0.5px solid var(--bc-separator);

      .bc-nav-rail--title {
        display: block;
        margin: 0;
        padding: 0 10px 14px;
        font-size: 22px;
        font-weight: 700;
      }

      .bc-nav-rail--item,
      .bc-nav-rail--item.bc-nav-rail--bottom {
        height: 44px;
        flex-direction: row;
        gap: 10px;
        padding: 0 10px;
        border-radius: 10px;
        color: var(--bc-text);
        font-size: 17px;
        font-weight: 400;
        letter-spacing: normal;

        .bc-nav-rail--icon,
        &.bc-nav-rail--bottom .bc-nav-rail--icon {
          width: 22px;
          height: 22px;
          border-radius: 0;
          background: none;
        }

        &[aria-current='page'] {
          background: var(--bc-tint);
          font-weight: 600;

          .bc-nav-rail--icon {
            background: none;
          }
        }
      }

      .bc-nav-rail--status {
        display: block;
        margin: 6px 10px 0;
      }
    }
  }
</style>
