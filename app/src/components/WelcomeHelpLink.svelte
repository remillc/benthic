<script>
  // @ts-check
  // « Une question ? À propos et contact » at the bottom of the first-launch screens (task 2026-11-15-219;
  // look: docs/mockups/android-tablette-premier-lancement-production-*.dc.html). It opens About and
  // « Retour » comes back to the screen it was opened from.
  // Tablet: centred, pinned 28 dp above the bottom of the page. Phone: centred at the end of the content, 20 dp above the edge on the welcome screen (--bc-help-link-bottom).
  import { t } from '../lib/i18n.js';
  import { f7 } from 'framework7-svelte';

  /**
   * onopen: where the link is outside a view (the desktop's window without a logbook, task 2026-11-16-242).
   * inline: in a line of its own (the desktop first launch beside the language menu, task 2026-11-16-246).
   * inColumn: the last item of a scrolling column (the first launch of a tablet and of the desktop, task 2026-11-16-257), not pinned to the page.
   * @type {{ onopen?: () => void, inline?: boolean, inColumn?: boolean }}
   */
  let { onopen, inline = false, inColumn = false } = $props();

  /** @param {MouseEvent} e */
  function open(e) {
    e.preventDefault();
    if (onopen) return onopen();
    // The router of the view the link is in (first launch has a view of its own, in a popup).
    const view = /** @type {HTMLElement} */ (e.currentTarget).closest('.view');
    // The desktop app's window without a logbook has no view of its own: About opens over it, in the main view
    // (task 2026-11-16-228; not `f7.views.current`, which can be the view of the first launch's hidden popup).
    if (!view) f7.views.get('#view-logbook')?.router.navigate('/about');
    else /** @type {any} */ (view).f7View?.router.navigate('/about');
  }
</script>

<a href="/about" class="bc-welcome-help-link" class:bc-welcome-help-link--column={inColumn} class:bc-welcome-help-link--inline={inline} aria-label={t('welcomeHelp.label')} onclick={open}>
  <svg class="bc-welcome-help-link--icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01"></path>
  </svg>
  <span>{t('welcomeHelp.question')} <span class="bc-welcome-help-link--link">{t('welcomeHelp.link')}</span></span>
</a>

<style>
  @layer od.components {
    .bc-welcome-help-link {
      box-sizing: border-box;
      position: relative;
      z-index: 2;
      width: fit-content;
      max-width: calc(100% - 32px);
      margin: 0 auto calc(var(--f7-safe-area-bottom) + var(--bc-help-link-bottom, 28px));
      padding: 6px 12px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
      text-decoration: none;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-text-2);
        outline-offset: 2px;
      }

      @media (hover: hover) {
        &:hover {
          background: color-mix(in srgb, var(--bc-text-2) 10%, transparent);
        }
      }

      /* Tablet: pinned to the bottom of the page. */
      @media (min-width: 768px) {
        position: absolute;
        left: var(--bc-help-link-left, 50%);
        bottom: calc(var(--f7-safe-area-bottom) + 28px);
        margin: 0;
        transform: translateX(-50%);
        white-space: nowrap;
      }

      /* The last item of the step's column: in the flow, 24 dp under the content, 28 dp above the foot. */
      &.bc-welcome-help-link--column {
        position: static;
        flex: none;
        margin: 24px auto 0;
        transform: none;
      }
    }

    /* Beside the blue panel of the tablet's first launch (task 2026-11-16-237): in the middle of the choices' side. */
    :global(.bc-first-panelled) {
      --bc-help-link-left: calc(min(700px, 55%) + (100% - min(700px, 55%)) / 2);

      @media (orientation: portrait) {
        --bc-help-link-left: 50%;
      }
    }

    /* The desktop app: the panel is 48.6 % of the window at most 700 dp (components/FirstLaunchPanel.svelte), in any shape. */
    :global(html.bc-desktop-app .bc-welcome-help-link) {
      position: absolute;
      left: var(--bc-help-link-left, 50%);
      bottom: 28px;
      margin: 0;
      transform: translateX(-50%);
      white-space: nowrap;

      /* A low window: a step may scroll under the link, which then keeps its own ground. */
      @media (max-height: 700px) {
        background: var(--bc-background);
      }
    }
    :global(html.bc-desktop-app .bc-first-panelled) {
      --bc-help-link-left: calc(min(700px, 48.6%) + (100% - min(700px, 48.6%)) / 2);
    }

    /* In a line of its own: no pinning. */
    :global(html.bc-desktop-app .bc-welcome-help-link.bc-welcome-help-link--inline) {
      position: relative;
      left: auto;
      bottom: auto;
      transform: none;
    }

    .bc-welcome-help-link--icon {
      flex: none;

      circle,
      path {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
      }
    }

    .bc-welcome-help-link--link {
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }
</style>
