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
  import { t } from '../lib/i18n.js';
  import { formatInstantDate } from '../lib/format.js';
  import { logbooks, openRecent, forgetRecent, relocateRecent } from '../lib/desktop-logbooks.svelte.js';
  import { recentRows } from '../lib/desktop-recents.js';

  let now = $state(Date.now());
  /** The row whose dialog is open. @type {string|null} */
  let asking = $state(null);
  let busy = $state(false);

  /** @param {number} time */

  /** @type {Record<'device'|'file'|'cloud'|'git', 'desktop'|'file'|'cloud'|'git'>} */
  const ICONS = { device: 'desktop', file: 'file', cloud: 'cloud', git: 'git' };

  const rows = $derived(recentRows(logbooks.recent, logbooks.exists, now, t, formatInstantDate));
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

<section class="bc-recent-logbooks" aria-labelledby="od-recent-logbooks-title">
  <h2 id="od-recent-logbooks-title" class="bc-recent-logbooks--title">{t('desktopLogbooks.recents.title')}</h2>
  <ul class="bc-recent-logbooks--list">
    {#each rows as row (row.id)}
      <li>
        <button type="button" class="bc-recent-logbooks--row" class:bc-recent-logbooks--missing={row.missing} onclick={() => choose(row)}>
          <span class="bc-recent-logbooks--tile"><Icon name={ICONS[row.kind]} size={20} /></span>
          <span class="bc-recent-logbooks--text">
            <span class="bc-recent-logbooks--name">{row.name}</span>
            <span class="bc-recent-logbooks--detail">
              {#if row.missing}<span class="bc-recent-logbooks--warning"><Icon name="warning" size={16} /></span>{/if}
              <span class="bc-recent-logbooks--detail-text">{row.detail}</span>
            </span>
          </span>
          <span class="bc-recent-logbooks--chevron"><Icon name="chevron" size={20} weight={2} /></span>
        </button>
      </li>
    {/each}
  </ul>
</section>

{#if missing}
  <Md3Dialog class="bc-recent-logbooks--dialog" title={t('desktopLogbooks.recents.missingTitle')} text={t('desktopLogbooks.recents.missingText', { file: missing.fileName, place: missing.place })} oncancel={() => (asking = null)} role="alertdialog">
    {#snippet children()}{/snippet}
    {#snippet actions()}
      <button type="button" class="bc-recent-logbooks--remove" disabled={busy} onclick={remove}>{t('desktopLogbooks.recents.remove')}</button>
      <button type="button" class="bc-recent-logbooks--search" disabled={busy} onclick={search}>{t('desktopLogbooks.recents.search')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    .bc-recent-logbooks--title {
      margin: 0 0 14px;
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .bc-recent-logbooks--list {
      margin: 0;
      padding: 0;
      list-style: none;
      border-radius: 16px;
      overflow: hidden;
      background: var(--bc-surface);
      & li + li {
        border-top: 1px solid var(--bc-release-divider);
      }
    }

    .bc-recent-logbooks--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 16px;
      border: none;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background-color 0.15s;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: -2px;
      }
    }

    .bc-recent-logbooks--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-surface-2);
      color: var(--bc-text);
    }

    .bc-recent-logbooks--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-recent-logbooks--name {
      font-size: 16px;
      line-height: 22px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bc-recent-logbooks--detail {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-recent-logbooks--detail-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bc-recent-logbooks--chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    /* A logbook that cannot be found: its name greyed, the place in error red with a warning icon. */
    .bc-recent-logbooks--missing .bc-recent-logbooks--name {
      color: var(--bc-text-2);
    }

    .bc-recent-logbooks--missing .bc-recent-logbooks--detail {
      color: var(--bc-error);
    }

    .bc-recent-logbooks--warning {
      flex: none;
      display: flex;
    }

    /* The dialog (Md3Dialog moves it under <body>, its CSS is its own): 420 dp, « Chercher le fichier… » filled. */
    :global(.bc-recent-logbooks--dialog .bc-md3-dialog--surface) {
      width: min(420px, calc(100% - 48px));
      padding: 24px;
      background: var(--bc-background);
    }

    :global(.bc-recent-logbooks--dialog .bc-md3-dialog--surface h2) {
      margin: 0 0 16px;
    }

    :global(.bc-recent-logbooks--dialog .bc-md3-dialog--surface .bc-md3-dialog--text) {
      margin: 0;
      font-size: 15px;
      line-height: 21px;
    }

    :global(.bc-recent-logbooks--dialog .bc-md3-dialog--surface .bc-md3-dialog--actions) {
      margin: 18px 0 0;
    }

    .bc-recent-logbooks--remove,
    .bc-recent-logbooks--search {
      font-size: 15px;
      cursor: pointer;

      &:disabled {
        opacity: 0.6;
        cursor: default;
      }
    }

    .bc-recent-logbooks--remove.bc-recent-logbooks--remove {
      color: var(--bc-release-link);
    }

    .bc-recent-logbooks--search.bc-recent-logbooks--search {
      padding: 0 20px;
      background: var(--bc-release-row-main);
      color: var(--bc-release-on-panel);
      transition: opacity 0.15s;

      @media (hover: hover) {
        &:hover:not(:disabled) {
          box-shadow: none;
          opacity: 0.88;
        }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-recent-logbooks--row,
      .bc-recent-logbooks--search.bc-recent-logbooks--search {
        transition: none;
      }
    }
  }
</style>
