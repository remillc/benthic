<script>
  // @ts-check
  // Android phone: the Material 3 Expressive navigation bar at the bottom, four destinations
  // (task 2026-11-14-120, docs/mockups/nav-barre-android.dc.html). Shown only on the first
  // page of a section; every other page has its back arrow and no bar. The active item has a
  // 56 × 32 dp pill in the primary container and a filled icon. Tapping the current section
  // scrolls its page to the top.
  import { t } from '../lib/i18n.js';
  import { navigation, goToSection, sections } from '../lib/navigation.svelte.js';
  import NavIcon from './NavIcon.svelte';
  import { ios } from '../lib/layout.svelte.js';

  /**
   * A tap: another section opens; the current one scrolls back to its top.
   * @param {MouseEvent} e
   * @param {import('../lib/navigation.svelte.js').Section} section
   */
  function choose(e, section) {
    e.preventDefault();
    if (navigation.section !== section) {
      goToSection(section);
      return;
    }
    const content = /** @type {HTMLElement|null} */ (document.querySelector(`#view-${section} > .page-current .page-content, #view-${section} > .page-master .page-content`));
    content?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
</script>

<!-- iPhone (task 2026-11-14-127): the same four destinations as a tab bar, in iOS form. -->
<nav class="bc-navigation-bar" class:ios aria-label={t('menu.sections')}>
  {#each sections as section (section)}
    {@const active = navigation.section === section}
    <a href="#{section}" class="bc-navigation-bar--item" class:bc-navigation-bar--active={active} aria-current={active ? 'page' : undefined} onclick={(e) => choose(e, section)}>
      <span class="bc-navigation-bar--pill">
        <NavIcon {section} {active} />
      </span>
      <span class="bc-navigation-bar--label">{t(`tabs.${section}`)}</span>
    </a>
  {/each}
</nav>

<style>
  @layer bc.components {
    .bc-navigation-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      /* Above Framework7's views (5000), under its sheets and popups (10500 and up). */
      z-index: 5100;
      box-sizing: content-box;
      height: 64px;
      padding: 0 8px var(--bc-safe-bottom);
      background: var(--bc-surface-container-high);
      box-shadow: 0 -1px 0 color-mix(in srgb, var(--bc-text) 6%, transparent);
      display: flex;
    }

    .bc-navigation-bar--item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--bc-text-2);
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
    }

    .bc-navigation-bar--pill {
      width: 56px;
      height: 32px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 150ms linear;
    }

    .bc-navigation-bar--label {
      font-size: 13px;
      line-height: 16px;
      font-weight: 400;
    }

    .bc-navigation-bar--active {
      color: var(--bc-nav-active);

      .bc-navigation-bar--pill {
        background: var(--bc-nav-active-container);
      }

      .bc-navigation-bar--label {
        font-weight: 600;
      }
    }

    /* iPhone: a translucent 49 pt tab bar, no pill; the active tab in the secondary colour. */
    .bc-navigation-bar.ios {
      height: 49px;
      background: color-mix(in srgb, var(--bc-background) 94%, transparent);
      -webkit-backdrop-filter: blur(20px);
      backdrop-filter: blur(20px);
      box-shadow: 0 -0.5px 0 rgb(0 0 0 / 0.2);

      /* High contrast (task 2026-11-14-149): nothing translucent. */
      :global(html.bc-high-contrast) & {
        background: var(--bc-background);
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
        box-shadow: 0 -1.5px 0 var(--bc-text);
      }
      /* The inner lines of a filled icon take the bar's colour. */
      --bc-nav-active-container: var(--bc-background);

      .bc-navigation-bar--item {
        justify-content: flex-start;
        padding-top: 7px;
        gap: 2px;
      }

      .bc-navigation-bar--pill {
        width: auto;
        height: auto;
        background: none;
      }

      .bc-navigation-bar--label {
        font-size: 11px;
        line-height: 13px;
        font-weight: 500;
      }

      .bc-navigation-bar--active {
        color: var(--bc-secondary);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-navigation-bar--pill {
        transition: none;
      }
    }
  }
</style>
