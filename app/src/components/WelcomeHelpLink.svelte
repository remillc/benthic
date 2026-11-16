<script>
  // @ts-check
  // « Une question ? À propos et contact » at the bottom of the first-launch screens (task 2026-11-15-219;
  // look: docs/mockups/android-tablette-premier-lancement-production-*.dc.html). It opens About and
  // « Retour » comes back to the screen it was opened from.
  // Tablet: centred, pinned 28 dp above the bottom of the page. Phone: centred at the end of the content.
  import { t } from '../lib/i18n.js';
  import { openAbout } from '../lib/navigation.svelte.js';

  /** @param {MouseEvent} e */
  function open(e) {
    e.preventDefault();
    // The router of the view the link is in (first launch has a view of its own, in a popup).
    const view = /** @type {HTMLElement} */ (e.currentTarget).closest('.view');
    // The desktop app's window without a logbook has no view of its own: About opens over it (task 2026-11-16-228).
    if (!view) openAbout();
    else /** @type {any} */ (view).f7View?.router.navigate('/about');
  }
</script>

<a href="/about" class="od-welcome-help-link" aria-label={t('welcomeHelp.label')} onclick={open}>
  <svg class="od-welcome-help-link--icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01"></path>
  </svg>
  <span>{t('welcomeHelp.question')} <span class="od-welcome-help-link--link">{t('welcomeHelp.link')}</span></span>
</a>

<style>
  @layer od.components {
    .od-welcome-help-link {
      box-sizing: border-box;
      position: relative;
      z-index: 2;
      width: fit-content;
      max-width: calc(100% - 32px);
      margin: 0 auto calc(var(--f7-safe-area-bottom) + 28px);
      padding: 6px 12px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
      text-decoration: none;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--od-text-2);
        outline-offset: 2px;
      }

      @media (hover: hover) {
        &:hover {
          background: color-mix(in srgb, var(--od-text-2) 10%, transparent);
        }
      }

      /* Tablet: pinned to the bottom of the page. */
      @media (min-width: 768px) {
        position: absolute;
        left: 50%;
        bottom: calc(var(--f7-safe-area-bottom) + 28px);
        margin: 0;
        transform: translateX(-50%);
        white-space: nowrap;
      }
    }

    .od-welcome-help-link--icon {
      flex: none;

      circle,
      path {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
      }
    }

    .od-welcome-help-link--link {
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }
</style>
