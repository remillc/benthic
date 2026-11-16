<script>
  // @ts-check
  // A choice row of the release edition's first launch (task 2026-11-15-218; mock-ups
  // docs/mockups/android-tablette-premier-lancement-production-*.dc.html): a 48 dp tonal icon tile, a title,
  // a help line and a chevron. `main` is the filled row (the first choice of a list). No radio button.
  import Icon from './Icon.svelte';

  /**
   * @type {{
   *   icon: string,
   *   title: string,
   *   help?: string,
   *   main?: boolean,
   *   compact?: boolean,
   *   disabled?: boolean,
   *   class?: string,
   *   onclick: () => void,
   * }}
   */
  let { icon, title, help = '', main = false, compact = false, disabled = false, class: extra = '', onclick } = $props();
</script>

<button type="button" class="od-release-row {extra}" class:od-release-row--main={main} class:od-release-row--compact={compact} {disabled} {onclick}>
  <span class="od-release-row--tile"><Icon name={/** @type {any} */ (icon)} size={24} /></span>
  <span class="od-release-row--text">
    <span class="od-release-row--title">{title}</span>
    {#if help}<span class="od-release-row--help">{help}</span>{/if}
  </span>
  <span class="od-release-row--chevron"><Icon name="chevron" size={20} weight={2} /></span>
</button>

<style>
  @layer od.components {
    .od-release-row {
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 20px;
      background: var(--od-surface);
      box-shadow: 0 1px 2px var(--od-release-row-shadow);
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition:
        transform 0.15s,
        box-shadow 0.15s,
        background-color 0.15s;

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }

      &:disabled {
        cursor: default;
        opacity: 0.6;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px var(--od-release-row-shadow-hover);
          background: var(--od-surface-2);
        }
      }
    }

    .od-release-row--main {
      border: none;
      background: var(--od-release-row-main);
      box-shadow: 0 6px 18px var(--od-release-row-main-shadow);
      color: var(--od-release-on-panel);

      @media (hover: hover) {
        &:hover:not(:disabled) {
          background: var(--od-release-row-main-hover);
          box-shadow: 0 8px 22px var(--od-release-row-main-shadow);
        }
      }

      .od-release-row--tile {
        background: var(--od-release-main-tile);
        color: var(--od-release-on-panel);
      }

      .od-release-row--help,
      .od-release-row--chevron {
        color: var(--od-release-on-main-soft);
      }
    }

    /* Compact (the recent logbooks screen, task 2026-11-16-241): a 40 dp tile and 10 dp above and below. */
    .od-release-row--compact {
      padding-block: 10px;

      .od-release-row--tile {
        width: 40px;
        height: 40px;
        border-radius: 12px;
      }
    }

    .od-release-row--tile {
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
    }

    .od-release-row--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-release-row--title {
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-release-row--help {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-release-row--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    @media (prefers-reduced-motion: reduce) {
      .od-release-row {
        transition: none;
      }
    }
  }
</style>
