<script>
  // @ts-check
  // The logbook selector of Windows and Linux (task 2026-11-15-173; docs/mockups/bureau-carnets-selecteur.dc.html):
  // the Carnet title becomes « Carnet · plongees.ssrf ▾ » on a pill. Its menu lists the recent logbooks (name,
  // source and when, a check on the open one), then Nouveau carnet…, Ouvrir un carnet…, Enregistrer une
  // copie… and Fermer le carnet with their shortcuts. The Mac has no selector: its menu bar does the same.
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { formatInstantDate } from '../lib/format.js';
  import {
    logbooks,
    windowLogbook,
    refreshRecent,
    openRecent,
    openLogbookDialog,
    saveCopy,
    closeLogbook,
  } from '../lib/desktop-logbooks.svelte.js';
  import { displayName, sourceText, whenText, selectorShortcuts } from '../lib/desktop-logbooks.js';

  /** « Exporter le carnet… » (task 2026-11-15-189): the Carnet opens its export dialog on the whole logbook. */
  let { onexport = undefined } = $props();

  const current = $derived(windowLogbook());
  const shortcuts = selectorShortcuts(false);
  let open = $state(false);
  let now = $state(Date.now());
  /** @type {HTMLElement|undefined} */
  let menu = $state();
  /** @type {HTMLButtonElement|undefined} */
  let pill = $state();

  /** @param {number} time */

  async function toggle() {
    open = !open;
    if (!open) return;
    now = Date.now();
    refreshRecent();
    await tick();
    /** @type {HTMLElement|null|undefined} */ (menu?.querySelector('[role="menuitem"]'))?.focus();
  }

  function close() {
    open = false;
    pill?.focus();
  }

  /** @param {() => void} action */
  function run(action) {
    open = false;
    action();
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    const items = /** @type {HTMLElement[]} */ ([...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]);
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  onMount(() => {
    refreshRecent();
  });
</script>

<div class="bc-logbook-selector">
  <button
    type="button"
    class="bc-logbook-selector--pill"
    bind:this={pill}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t('desktopLogbooks.selector.change')}
    title={t('desktopLogbooks.selector.change')}
    onclick={toggle}
  >
    <span class="bc-logbook-selector--title">{t('desktopLogbooks.selector.label')}</span>
    {#if current}<span class="bc-logbook-selector--name">{displayName(current, t)}</span>{/if}
    <Icon name="expand" size={20} />
  </button>
  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bc-logbook-selector--scrim" onpointerdown={(e) => e.target === e.currentTarget && close()} oncontextmenu={(e) => (e.preventDefault(), close())}>
      <div class="bc-logbook-selector--menu" role="menu" tabindex="-1" bind:this={menu} onkeydown={keydown}>
        <p class="bc-logbook-selector--heading">{t('desktopLogbooks.selector.recentTitle')}</p>
        {#each logbooks.recent as entry (entry.id)}
          {@const here = entry.id === current?.id}
          <button type="button" role="menuitem" class="bc-logbook-selector--item bc-logbook-selector--recent" onclick={() => run(() => (here ? undefined : openRecent(entry.id)))}>
            <span class="bc-logbook-selector--check">{#if here}<Icon name="check" size={18} weight={2} />{/if}</span>
            <span class="bc-logbook-selector--text">
              <span class="bc-logbook-selector--item-name">{displayName(entry, t)}</span>
              <span class="bc-logbook-selector--item-source">{[sourceText(entry, t), whenText(entry, now, t, formatInstantDate)].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        {:else}
          <p class="bc-logbook-selector--none">{t('desktopLogbooks.selector.noRecent')}</p>
        {/each}
        <hr class="bc-logbook-selector--rule" />
        <button type="button" role="menuitem" class="bc-logbook-selector--item" onclick={() => run(() => (logbooks.dialog = true))}>
          <span class="bc-logbook-selector--label">{t('desktopLogbooks.selector.newLogbook')}</span><kbd>{shortcuts.newLogbook}</kbd>
        </button>
        <button type="button" role="menuitem" class="bc-logbook-selector--item" onclick={() => run(openLogbookDialog)}>
          <span class="bc-logbook-selector--label">{t('desktopLogbooks.selector.openLogbook')}</span><kbd>{shortcuts.openLogbook}</kbd>
        </button>
        <button type="button" role="menuitem" class="bc-logbook-selector--item" onclick={() => run(() => (logbooks.renameDialog = true))}>
          <span class="bc-logbook-selector--label">{t('desktopLogbooks.rename.action')}</span>
        </button>
        <button type="button" role="menuitem" class="bc-logbook-selector--item" onclick={() => run(saveCopy)}>
          <span class="bc-logbook-selector--label">{t('desktopLogbooks.selector.saveCopy')}</span><kbd>{shortcuts.saveCopy}</kbd>
        </button>
        {#if onexport}
          <button type="button" role="menuitem" class="bc-logbook-selector--item" onclick={() => run(onexport)}>
            <span class="bc-logbook-selector--label">{t('desktop.export.logbook')}</span><kbd>Ctrl+Maj+E</kbd>
          </button>
        {/if}
        <hr class="bc-logbook-selector--rule" />
        <button type="button" role="menuitem" class="bc-logbook-selector--item" onclick={() => run(closeLogbook)}>
          <span class="bc-logbook-selector--label">{t('desktopLogbooks.selector.closeLogbook')}</span><kbd>{shortcuts.closeLogbook}</kbd>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  @layer od.components {
    .bc-logbook-selector {
      position: relative;
      display: inline-flex;
      /* Fluid layout: in a narrow window the pill gives way and the logbook's name is cut with an ellipsis. */
      max-width: 100%;
      min-width: 0;
    }
    .bc-logbook-selector--pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 12px 0 16px;
      border: none;
      border-radius: 22px;
      background: var(--bc-surface-2);
      color: var(--bc-text);
      font: inherit;
      cursor: pointer;
      max-width: 100%;
      min-width: 0;
      &:focus-visible {
        outline: 2px solid var(--bc-action);
        outline-offset: 2px;
      }
    }
    .bc-logbook-selector--title {
      font-family: var(--bc-title-font);
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }
    .bc-logbook-selector--name {
      flex: 0 1 auto;
      min-width: 0;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 16px;
      color: var(--bc-text-2);
      &::before {
        content: '· ';
      }
    }
    .bc-logbook-selector--scrim {
      position: fixed;
      inset: 0;
      z-index: 13000;
    }
    .bc-logbook-selector--menu {
      position: fixed;
      top: 52px;
      left: 108px;
      width: 360px;
      max-height: calc(100vh - 68px);
      overflow-y: auto;
      box-sizing: border-box;
      padding: 8px 0;
      border-radius: 12px;
      background: var(--bc-dialog);
      box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
      outline: none;
    }
    .bc-logbook-selector--heading {
      margin: 0;
      padding: 8px 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
    .bc-logbook-selector--none {
      margin: 0;
      padding: 8px 16px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-logbook-selector--rule {
      margin: 8px 0;
      border: none;
      border-top: 1px solid var(--bc-separator);
    }
    .bc-logbook-selector--item {
      display: flex;
      align-items: center;
      width: 100%;
      box-sizing: border-box;
      min-height: 44px;
      padding: 4px 16px;
      border: none;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      font-size: 15px;
      text-align: start;
      cursor: pointer;
    }
    .bc-logbook-selector--item:hover,
    .bc-logbook-selector--item:focus-visible {
      background: var(--bc-surface-2);
      outline: none;
    }
    .bc-logbook-selector--check {
      flex: none;
      width: 28px;
      color: var(--bc-selected);
    }
    .bc-logbook-selector--text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .bc-logbook-selector--item-name {
      font-size: 16px;
      line-height: 20px;
    }
    .bc-logbook-selector--item-source {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-logbook-selector--label {
      flex: 1;
    }
    .bc-logbook-selector--item kbd {
      margin-inline-start: 16px;
      font: inherit;
      font-size: 13px;
      color: var(--bc-text-2);
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-logbook-selector--pill {
        transition: box-shadow 120ms linear;
        &:not(:disabled):hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-logbook-selector--pill {
        transition: none;
      }
    }
  }
</style>
