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
<nav class="od-navigation-bar" class:ios aria-label={t('menu.sections')}>
  {#each sections as section (section)}
    {@const active = navigation.section === section}
    <a href="#{section}" class="od-navigation-bar--item" class:od-navigation-bar--active={active} aria-current={active ? 'page' : undefined} onclick={(e) => choose(e, section)}>
      <span class="od-navigation-bar--pill">
        <NavIcon {section} {active} />
      </span>
      <span class="od-navigation-bar--label">{t(`tabs.${section}`)}</span>
    </a>
  {/each}
</nav>

<style>
  @layer od.components {
    .od-navigation-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      /* Above Framework7's views (5000), under its sheets and popups (10500 and up). */
      z-index: 5100;
      box-sizing: content-box;
      height: 64px;
      padding: 0 8px env(safe-area-inset-bottom);
      background: var(--od-surface-container-high);
      box-shadow: 0 -1px 0 color-mix(in srgb, var(--od-text) 6%, transparent);
      display: flex;
    }

    .od-navigation-bar--item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--od-text-2);
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
    }

    .od-navigation-bar--pill {
      width: 56px;
      height: 32px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 150ms linear;
    }

    .od-navigation-bar--label {
      font-size: 13px;
      line-height: 16px;
      font-weight: 400;
    }

    .od-navigation-bar--active {
      color: var(--od-nav-active);

      .od-navigation-bar--pill {
        background: var(--od-nav-active-container);
      }

      .od-navigation-bar--label {
        font-weight: 600;
      }
    }

    /* iPhone: a translucent 49 pt tab bar, no pill; the active tab in the secondary colour. */
    .od-navigation-bar.ios {
      height: 49px;
      background: color-mix(in srgb, var(--od-background) 94%, transparent);
      -webkit-backdrop-filter: blur(20px);
      backdrop-filter: blur(20px);
      box-shadow: 0 -0.5px 0 rgb(0 0 0 / 0.2);

      /* High contrast (task 2026-11-14-149): nothing translucent. */
      :global(html.od-high-contrast) & {
        background: var(--od-background);
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
        box-shadow: 0 -1.5px 0 var(--od-text);
      }
      /* The inner lines of a filled icon take the bar's colour. */
      --od-nav-active-container: var(--od-background);

      .od-navigation-bar--item {
        justify-content: flex-start;
        padding-top: 7px;
        gap: 2px;
      }

      .od-navigation-bar--pill {
        width: auto;
        height: auto;
        background: none;
      }

      .od-navigation-bar--label {
        font-size: 11px;
        line-height: 13px;
        font-weight: 500;
      }

      .od-navigation-bar--active {
        color: var(--od-secondary);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-navigation-bar--pill {
        transition: none;
      }
    }
  }
</style>
