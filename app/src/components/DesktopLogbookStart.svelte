<script>
  // @ts-check
  // The window without a logbook (« Fermer le carnet », a new window, « Choisir à chaque fois »; task
  // 2026-11-16-242, replacing the centred screen of tasks 2026-11-15-173 and 2026-11-16-222; mock-ups docs/mockups/
  // bureau-demarrage-actuel.dc.html and bureau-demarrage-introuvable.dc.html, a 1440 x 900 window): the blue panel of
  // the first launch on the left, with its profile still, and on the right « Carnets récents » (components/
  // RecentLogbooks.svelte), « Ou bien » with « Ouvrir un carnet… » and « Nouveau carnet… », the hint about dropping a
  // file and « Une question ? À propos et contact ». It covers the whole window, rail included: the rail is not drawn
  // here (the mock-ups have none); the screen steps aside while Réglages is open, and the rail, with its four sections
  // dimmed and inert (task 2026-11-16-240), is back then. The first launch (no logbook and no account yet) is not
  // this screen: it is pages/WelcomeStart.svelte (lib/desktop-first-launch.js says how the desktop tells them apart).
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import FirstLaunchPanel from './FirstLaunchPanel.svelte';
  import RecentLogbooks from './RecentLogbooks.svelte';
  import WelcomeHelpLink from './WelcomeHelpLink.svelte';
  import { t } from '../lib/i18n.js';
  import { navigation, openAbout } from '../lib/navigation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { logbooks, refreshRecent, checkRecent, openLogbookDialog, enableDropToOpen } from '../lib/desktop-logbooks.svelte.js';

  const visible = $derived(navigation.section !== 'account');
  let dragging = $state(false);

  // The rail is out of sight while this screen is on top (its sections stay dimmed under it: theme-level class below).
  $effect(() => {
    document.documentElement.classList.toggle('od-start-screen', visible);
    return () => document.documentElement.classList.remove('od-start-screen');
  });

  onMount(() => {
    document.documentElement.classList.add('od-no-logbook');
    void refreshRecent().then(checkRecent);
    const stopDrop = enableDropToOpen(() => showSnackbar(t('desktopLogbooks.start.notALogbook')));
    const over = () => (dragging = true);
    const leave = () => (dragging = false);
    window.addEventListener('dragenter', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', leave);
    return () => {
      document.documentElement.classList.remove('od-no-logbook');
      stopDrop();
      window.removeEventListener('dragenter', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', leave);
    };
  });
</script>

{#if visible}
  <main class="od-logbook-start" class:od-logbook-start--dragging={dragging} aria-label={t('desktopLogbooks.start.empty')}>
    <FirstLaunchPanel still />
    <div class="od-logbook-start--column">
      <div class="od-logbook-start--content">
        {#if logbooks.recent.length}
          <RecentLogbooks />
          <h2 class="od-logbook-start--or">{t('desktopLogbooks.recents.orElse')}</h2>
        {/if}
        <nav class="od-logbook-start--choices" aria-label={t('desktopLogbooks.recents.otherChoices')}>
          <button type="button" class="od-logbook-start--choice" onclick={openLogbookDialog}>
            <span class="od-logbook-start--tile"><Icon name="folder" size={24} /></span>
            <span class="od-logbook-start--text">
              <span class="od-logbook-start--label">{t('desktopLogbooks.start.open')}</span>
              <span class="od-logbook-start--hint">{t('desktopLogbooks.start.openHint')}</span>
            </span>
            <span class="od-logbook-start--chevron"><Icon name="chevron" size={20} weight={2} /></span>
          </button>
          <button type="button" class="od-logbook-start--choice" onclick={() => (logbooks.dialog = true)}>
            <span class="od-logbook-start--tile"><Icon name="plus" size={24} weight={2} /></span>
            <span class="od-logbook-start--text">
              <span class="od-logbook-start--label">{t('desktopLogbooks.start.newLogbook')}</span>
              <span class="od-logbook-start--hint">{t('desktopLogbooks.start.newHint')}</span>
            </span>
            <span class="od-logbook-start--chevron"><Icon name="chevron" size={20} weight={2} /></span>
          </button>
        </nav>
        <p class="od-logbook-start--drop">{dragging ? t('desktopLogbooks.start.dropHere') : t('desktopLogbooks.start.drop')}</p>
      </div>
      <WelcomeHelpLink onopen={openAbout} />
    </div>
  </main>
{/if}

<style>
  @layer od.components {
    .od-logbook-start {
      position: fixed;
      inset: 0;
      /* Above the rail (6000): the mock-ups show this window without it. */
      z-index: 6100;
      display: flex;
      background: var(--od-background);
      color: var(--od-text);
    }

    /* The panel's own rules for the desktop app size it (components/FirstLaunchPanel.svelte); the rest is this column. */
    .od-logbook-start--column {
      --od-help-link-left: 50%;
      position: relative;
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 0 clamp(24px, 4.4vw, 64px);
    }

    /* The choices are centred in what the help link leaves; the link stays under them, at the bottom. */
    .od-logbook-start--content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 24px 0;
    }

    .od-logbook-start--column :global(.od-welcome-help-link) {
      position: relative;
      inset: auto;
      flex: none;
      transform: none;
      margin: 0 auto 28px;
    }

    .od-logbook-start--or {
      margin: 28px 0 10px;
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-logbook-start--choices {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .od-logbook-start--choice {
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 16px;
      border: 1px solid var(--od-separator);
      border-radius: 16px;
      background: var(--od-surface);
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background-color 0.15s;

      @media (hover: hover) {
        &:hover {
          background: color-mix(in srgb, var(--od-text) 6%, var(--od-surface));
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-start-fill);
        outline-offset: 2px;
      }
    }

    .od-logbook-start--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-first-tile);
      color: var(--od-code-active);
    }

    .od-logbook-start--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-logbook-start--label {
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-logbook-start--hint {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-logbook-start--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-logbook-start--drop {
      margin: 14px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }
    .od-logbook-start--dragging .od-logbook-start--drop {
      color: var(--od-action);
      font-weight: 600;
    }
    .od-logbook-start--dragging .od-logbook-start--column {
      box-shadow: inset 0 0 0 2px var(--od-start-fill);
    }

    /* The sections need a logbook: dimmed and inert, as the mock-up draws them; Réglages and the account stay. Out of
       sight while this screen is on top. */
    :global(html.od-no-logbook .od-nav-rail--item:not(.od-nav-rail--settings)) {
      opacity: 0.38;
      pointer-events: none;
    }
    :global(html.od-start-screen .od-nav-rail--rail) {
      visibility: hidden;
    }

    @media (prefers-reduced-motion: reduce) {
      .od-logbook-start--choice {
        transition: none;
      }
    }
  }
</style>
