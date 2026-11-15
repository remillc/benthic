<script>
  // @ts-check
  // The start screen of a window with no logbook open (task 2026-11-15-173; docs/mockups/
  // bureau-carnets-accueil.dc.html): the logo, « Aucun carnet ouvert dans cette fenêtre », the two buttons, the
  // recent logbooks with the icon of their source, and the hint about dropping a file. It covers the
  // pages, right of the rail, whose sections are dimmed and inert (theme-level class set below);
  // Réglages and the account stay active, and the screen steps aside while Réglages is open.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { t, locale } from '../lib/i18n.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { logbooks, refreshRecent, openLogbookDialog, openRecent, enableDropToOpen } from '../lib/desktop-logbooks.svelte.js';
  import { sourceKind, sourceText, whenText, displayName } from '../lib/desktop-logbooks.js';

  const visible = $derived(navigation.section !== 'account');
  let now = $state(Date.now());
  let dragging = $state(false);

  /** @param {number} time */
  const formatDate = (time) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(time);

  /** @type {Record<'device'|'file'|'cloud'|'git', 'desktop'|'file'|'cloud'|'git'>} */
  const ICONS = { device: 'desktop', file: 'file', cloud: 'cloud', git: 'git' };

  onMount(() => {
    document.documentElement.classList.add('od-no-logbook');
    refreshRecent();
    const timer = setInterval(() => (now = Date.now()), 30000);
    const stopDrop = enableDropToOpen(() => showSnackbar(t('desktopLogbooks.start.notALogbook')));
    const over = () => (dragging = true);
    const leave = () => (dragging = false);
    window.addEventListener('dragenter', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', leave);
    return () => {
      document.documentElement.classList.remove('od-no-logbook');
      clearInterval(timer);
      stopDrop();
      window.removeEventListener('dragenter', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', leave);
    };
  });
</script>

{#if visible}
  <main class="od-logbook-start" class:od-logbook-start--dragging={dragging} aria-label={t('desktopLogbooks.start.empty')}>
    <div class="od-logbook-start--column">
      <div class="od-logbook-start--head">
        <img class="od-logbook-start--logo od-logbook-start--light" src="logo-light.svg" alt="" width="64" height="64" />
        <img class="od-logbook-start--logo od-logbook-start--dark" src="logo-dark.svg" alt="" width="64" height="64" />
        <div>
          <h1 class="od-logbook-start--title">OpenDives</h1>
          <p class="od-logbook-start--subtitle">{t('desktopLogbooks.start.empty')}</p>
        </div>
      </div>
      <div class="od-logbook-start--actions">
        <button type="button" class="od-logbook-start--primary" onclick={openLogbookDialog}>{t('desktopLogbooks.start.open')}</button>
        <button type="button" class="od-logbook-start--secondary" onclick={() => (logbooks.dialog = true)}>{t('desktopLogbooks.start.newLogbook')}</button>
      </div>
      {#if logbooks.recent.length}
        <h2 class="od-logbook-start--heading">{t('desktopLogbooks.start.recent')}</h2>
        <ul class="od-logbook-start--list">
          {#each logbooks.recent as entry (entry.id)}
            {@const kind = sourceKind(entry)}
            <li>
              <button type="button" class="od-logbook-start--row" onclick={() => openRecent(entry.id)}>
                <span class="od-logbook-start--tile"><Icon name={ICONS[kind]} size={22} /></span>
                <span class="od-logbook-start--text">
                  <span class="od-logbook-start--name">{displayName(entry, t)}</span>
                  <span class="od-logbook-start--source">{[sourceText(entry, t), whenText(entry, now, t, formatDate)].filter(Boolean).join(' · ')}</span>
                </span>
                <Icon name="chevron" size={20} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="od-logbook-start--hint">{dragging ? t('desktopLogbooks.start.dropHere') : t('desktopLogbooks.start.drop')}</p>
    </div>
  </main>
{/if}

<style>
  @layer od.components {
    .od-logbook-start {
      position: fixed;
      inset: 0 0 0 calc(var(--od-nav-width) + env(safe-area-inset-left));
      z-index: 5500;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-y: auto;
      background: var(--od-background);
      color: var(--od-text);
    }

    .od-logbook-start--column {
      width: 560px;
      max-width: calc(100% - 48px);
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 24px 0;
    }

    .od-logbook-start--head {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .od-logbook-start--logo {
      flex: none;
    }
    .od-logbook-start--dark {
      display: none;
    }
    :global(html.dark) .od-logbook-start--light {
      display: none;
    }
    :global(html.dark) .od-logbook-start--dark {
      display: block;
    }

    .od-logbook-start--title {
      margin: 0;
      font-family: var(--od-title-font);
      font-size: 28px;
      line-height: 32px;
      font-weight: 500;
    }

    .od-logbook-start--subtitle {
      margin: 0;
      font-size: 16px;
      line-height: 22px;
      color: var(--od-text-2);
    }

    .od-logbook-start--actions {
      display: flex;
      gap: 12px;
    }

    .od-logbook-start--primary,
    .od-logbook-start--secondary {
      height: 44px;
      padding: 0 22px;
      border-radius: 22px;
      font: inherit;
      font-size: 16px;
      cursor: pointer;
    }
    .od-logbook-start--primary {
      border: none;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
    }
    .od-logbook-start--secondary {
      border: 1px solid var(--od-outline);
      background: transparent;
      color: var(--od-text);
    }

    .od-logbook-start--heading {
      margin: 8px 0 -8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
    }

    .od-logbook-start--list {
      margin: 0;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      overflow: hidden;
      background: var(--od-surface);
    }
    .od-logbook-start--list li + li {
      border-top: 1px solid var(--od-separator);
    }

    .od-logbook-start--row {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      box-sizing: border-box;
      padding: 12px 16px;
      border: none;
      background: transparent;
      color: var(--od-text-2);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .od-logbook-start--row:hover {
      background: var(--od-surface-2);
    }
    .od-logbook-start--row:focus-visible {
      outline: 2px solid var(--od-action);
      outline-offset: -2px;
    }

    .od-logbook-start--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-surface-2);
      color: var(--od-text);
    }

    .od-logbook-start--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .od-logbook-start--name {
      color: var(--od-text);
      font-size: 16px;
      line-height: 22px;
    }
    .od-logbook-start--source {
      font-size: 14px;
      line-height: 18px;
      color: var(--od-text-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .od-logbook-start--hint {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
    .od-logbook-start--dragging .od-logbook-start--hint {
      color: var(--od-action);
      font-weight: 600;
    }

    /* The sections need a logbook: dimmed and inert, as the mock-up draws them; Réglages and the account stay. */
    :global(html.od-no-logbook .od-nav-rail--item:not(.od-nav-rail--settings)) {
      opacity: 0.38;
      pointer-events: none;
    }
  }
</style>
