<script>
  // @ts-check
  // « Votre carnet est prêt » (task 2026-11-15-173; docs/mockups/bureau-nouveau-carnet-vide.dc.html): what an empty
  // logbook of a window shows in the Carnet, after « Nouveau carnet »: where the logbook is kept and the three
  // ways to add dives with their shortcuts. The page decides when to show it (an empty logbook that is not
  // the one of this computer) and what each way does.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { desktopMac } from '../lib/layout.svelte.js';
  import { windowLogbook } from '../lib/desktop-logbooks.svelte.js';
  import { displayName, keptIn } from '../lib/desktop-logbooks.js';

  /** @type {{ ondownload: () => void, onimport: () => void, onmanual: () => void }} */
  let { ondownload, onimport, onmanual } = $props();

  const entry = $derived(windowLogbook());
  const kept = $derived(entry ? keptIn(entry, t) : null);
  const mod = desktopMac ? '⌘' : 'Ctrl+';
  const ways = [
    // « Télécharger mes plongées » with the dive computer icon, as the empty logbook (task 2026-11-15-220).
    { key: 'download', icon: 'diveComputer', shortcut: `${mod}D`, run: ondownload },
    { key: 'import', icon: 'document', shortcut: `${mod}I`, run: onimport },
    { key: 'manual', icon: 'edit', shortcut: `${mod}N`, run: onmanual },
  ];
</script>

<section class="bc-logbook-ready" aria-labelledby="bc-logbook-ready-title">
  <h2 id="bc-logbook-ready-title" class="bc-logbook-ready--title">{t('desktopLogbooks.ready.title')}</h2>
  {#if entry && kept}
    <p class="bc-logbook-ready--where">{t(`desktopLogbooks.ready.${kept.key}`, { name: displayName(entry, t), where: kept.where })}</p>
  {/if}
  <ul class="bc-logbook-ready--list">
    {#each ways as way (way.key)}
      <li>
        <button type="button" class="bc-logbook-ready--way" onclick={way.run}>
          <span class="bc-logbook-ready--icon"><Icon name={/** @type {any} */ (way.icon)} size={22} /></span>
          <span class="bc-logbook-ready--text">
            <span class="bc-logbook-ready--name">{t(`desktopLogbooks.ready.${way.key}`)}</span>
            <span class="bc-logbook-ready--help">{t(`desktopLogbooks.ready.${way.key}Help`)}</span>
          </span>
          <kbd class="bc-logbook-ready--shortcut">{way.shortcut}</kbd>
        </button>
      </li>
    {/each}
  </ul>
  <p class="bc-logbook-ready--drop">{t('desktopLogbooks.ready.drop')}</p>
</section>

<style>
  @layer bc.components {
    .bc-logbook-ready {
      width: 560px;
      max-width: calc(100% - 48px);
      margin: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: var(--bc-text);
    }
    .bc-logbook-ready--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
    }
    .bc-logbook-ready--where,
    .bc-logbook-ready--drop {
      margin: 0;
      font-size: 15px;
      line-height: 20px;
      color: var(--bc-text-2);
    }
    .bc-logbook-ready--list {
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .bc-logbook-ready--way {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      box-sizing: border-box;
      min-height: 80px;
      padding: 16px 20px;
      border: none;
      border-radius: 16px;
      background: var(--bc-surface);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
      &:hover {
        background: var(--bc-surface-2);
      }
      &:focus-visible {
        outline: 2px solid var(--bc-action);
        outline-offset: 2px;
      }
    }
    .bc-logbook-ready--icon {
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-selected-container);
      color: var(--bc-selected);
    }
    .bc-logbook-ready--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .bc-logbook-ready--name {
      font-size: 17px;
      line-height: 24px;
    }
    .bc-logbook-ready--help {
      font-size: 14px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
    .bc-logbook-ready--shortcut {
      font: inherit;
      font-size: 13px;
      color: var(--bc-text-2);
    }
  }
</style>
