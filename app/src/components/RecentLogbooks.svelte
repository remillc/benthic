<script>
  // @ts-check
  // « Carnets récents » of the window without a logbook, release edition (task 2026-11-16-241; mock-ups
  // docs/mockups/bureau-premier-lancement-production-recents.dc.html and …-recents-introuvable.dc.html): a white card
  // with the logbooks opened most recently, newest first, at most five. A row opens that logbook in this window. A
  // logbook whose file is no longer there keeps its place, greyed, with « Introuvable dans {place} » in error red;
  // clicking it opens a dialog: « Retirer de la liste » (forget the entry) or « Chercher le fichier… » (the system's
  // file picker; the picked file replaces the entry and opens here). The list and the check are in
  // lib/desktop-logbooks.svelte.js, the rows' text in lib/desktop-recents.js.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import { t, locale } from '../lib/i18n.js';
  import { logbooks, openRecent, forgetRecent, relocateRecent } from '../lib/desktop-logbooks.svelte.js';
  import { recentRows } from '../lib/desktop-recents.js';

  let now = $state(Date.now());
  /** The row whose dialog is open. @type {string|null} */
  let asking = $state(null);
  let busy = $state(false);

  /** @param {number} time */
  const formatDate = (time) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(time);

  /** @type {Record<'device'|'file'|'cloud'|'git', 'desktop'|'file'|'cloud'|'git'>} */
  const ICONS = { device: 'desktop', file: 'file', cloud: 'cloud', git: 'git' };

  const rows = $derived(recentRows(logbooks.recent, logbooks.exists, now, t, formatDate));
  const missing = $derived(rows.find((row) => row.id === asking) ?? null);

  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 30000);
    return () => clearInterval(timer);
  });

  /** @param {{ id: string, missing: boolean }} row */
  function choose(row) {
    if (row.missing) asking = row.id;
    else void openRecent(row.id);
  }

  async function remove() {
    if (!asking || busy) return;
    busy = true;
    await forgetRecent(asking);
    asking = null;
    busy = false;
  }

  /** The picked file replaces the entry and opens in this window; cancelling the picker leaves the dialog open. */
  async function search() {
    if (!asking || busy) return;
    busy = true;
    const opened = await relocateRecent(asking);
    busy = false;
    if (opened) asking = null;
  }
</script>

<section class="od-recent-logbooks" aria-labelledby="od-recent-logbooks-title">
  <h2 id="od-recent-logbooks-title" class="od-recent-logbooks--title">{t('desktopLogbooks.recents.title')}</h2>
  <ul class="od-recent-logbooks--list">
    {#each rows as row (row.id)}
      <li>
        <button type="button" class="od-recent-logbooks--row" class:od-recent-logbooks--missing={row.missing} onclick={() => choose(row)}>
          <span class="od-recent-logbooks--tile"><Icon name={ICONS[row.kind]} size={20} /></span>
          <span class="od-recent-logbooks--text">
            <span class="od-recent-logbooks--name">{row.name}</span>
            <span class="od-recent-logbooks--detail">
              {#if row.missing}<span class="od-recent-logbooks--warning"><Icon name="warning" size={16} /></span>{/if}
              <span class="od-recent-logbooks--detail-text">{row.detail}</span>
            </span>
          </span>
          <span class="od-recent-logbooks--chevron"><Icon name="chevron" size={20} weight={2} /></span>
        </button>
      </li>
    {/each}
  </ul>
</section>

{#if missing}
  <Md3Dialog class="od-recent-logbooks--dialog" title={t('desktopLogbooks.recents.missingTitle')} text={t('desktopLogbooks.recents.missingText', { file: missing.fileName, place: missing.place })} oncancel={() => (asking = null)} role="alertdialog">
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button type="button" class="od-recent-logbooks--remove" disabled={busy} onclick={remove}>{t('desktopLogbooks.recents.remove')}</button>
      <button type="button" class="od-recent-logbooks--search" disabled={busy} onclick={search}>{t('desktopLogbooks.recents.search')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    .od-recent-logbooks--title {
      margin: 0 0 14px;
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .od-recent-logbooks--list {
      margin: 0;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      overflow: hidden;
      background: var(--od-surface);
    }

    .od-recent-logbooks--list li + li {
      border-top: 1px solid var(--od-release-divider);
    }

    .od-recent-logbooks--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 16px;
      border: none;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background-color 0.15s;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: -2px;
      }
    }

    .od-recent-logbooks--tile {
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

    .od-recent-logbooks--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-recent-logbooks--name {
      font-size: 16px;
      line-height: 22px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .od-recent-logbooks--detail {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-recent-logbooks--detail-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .od-recent-logbooks--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    /* A logbook that cannot be found: its name greyed, the place in error red with a warning icon. */
    .od-recent-logbooks--missing .od-recent-logbooks--name {
      color: var(--od-text-2);
    }

    .od-recent-logbooks--missing .od-recent-logbooks--detail {
      color: var(--od-error);
    }

    .od-recent-logbooks--warning {
      flex: none;
      display: flex;
    }

    /* The dialog (Md3Dialog moves it under <body>, its CSS is its own): 420 dp, « Chercher le fichier… » filled. */
    :global(.od-recent-logbooks--dialog .od-md3-dialog--surface) {
      width: min(420px, calc(100% - 48px));
      padding: 24px;
      background: var(--od-background);
    }

    :global(.od-recent-logbooks--dialog .od-md3-dialog--surface h2) {
      margin: 0 0 16px;
    }

    :global(.od-recent-logbooks--dialog .od-md3-dialog--surface .od-md3-dialog--text) {
      margin: 0;
      font-size: 15px;
      line-height: 21px;
    }

    :global(.od-recent-logbooks--dialog .od-md3-dialog--surface .od-md3-dialog--actions) {
      margin: 18px 0 0;
    }

    .od-recent-logbooks--remove,
    .od-recent-logbooks--search {
      font-size: 15px;
      cursor: pointer;

      &:disabled {
        opacity: 0.6;
        cursor: default;
      }
    }

    .od-recent-logbooks--remove.od-recent-logbooks--remove {
      color: var(--od-release-link);
    }

    .od-recent-logbooks--search.od-recent-logbooks--search {
      padding: 0 20px;
      background: var(--od-release-row-main);
      color: var(--od-release-on-panel);
      transition: opacity 0.15s;

      @media (hover: hover) {
        &:hover:not(:disabled) {
          box-shadow: none;
          opacity: 0.88;
        }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-recent-logbooks--row,
      .od-recent-logbooks--search.od-recent-logbooks--search {
        transition: none;
      }
    }
  }
</style>
