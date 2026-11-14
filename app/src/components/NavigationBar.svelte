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

<nav class="od-navigation-bar" aria-label={t('menu.sections')}>
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

    @media (prefers-reduced-motion: reduce) {
      .od-navigation-bar--pill {
        transition: none;
      }
    }
  }
</style>
