<script>
  // @ts-check
  // The logbook selector of Windows and Linux (task 2026-11-15-173; docs/mockups/bureau-carnets-selecteur.dc.html):
  // the Carnet title becomes « Carnet · plongees.ssrf ▾ » on a pill. Its menu lists the recent logbooks (name,
  // source and when, a check on the open one), then Nouveau carnet…, Ouvrir un carnet…, Enregistrer une
  // copie… and Fermer le carnet with their shortcuts. The Mac has no selector: its menu bar does the same.
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { t, locale } from '../lib/i18n.js';
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

  const current = windowLogbook();
  const shortcuts = selectorShortcuts(false);
  let open = $state(false);
  let now = $state(Date.now());
  /** @type {HTMLElement|undefined} */
  let menu = $state();
  /** @type {HTMLButtonElement|undefined} */
  let pill = $state();

  /** @param {number} time */
  const formatDate = (time) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(time);

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

<div class="od-logbook-selector">
  <button
    type="button"
    class="od-logbook-selector--pill"
    bind:this={pill}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={t('desktopLogbooks.selector.change')}
    title={t('desktopLogbooks.selector.change')}
    onclick={toggle}
  >
    <span class="od-logbook-selector--title">{t('desktopLogbooks.selector.label')}</span>
    {#if current}<span class="od-logbook-selector--name">{displayName(current, t)}</span>{/if}
    <Icon name="expand" size={20} />
  </button>
  {#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="od-logbook-selector--scrim" onpointerdown={(e) => e.target === e.currentTarget && close()} oncontextmenu={(e) => (e.preventDefault(), close())}>
      <div class="od-logbook-selector--menu" role="menu" tabindex="-1" bind:this={menu} onkeydown={keydown}>
        <p class="od-logbook-selector--heading">{t('desktopLogbooks.selector.recentTitle')}</p>
        {#each logbooks.recent as entry (entry.id)}
          {@const here = entry.id === current?.id}
          <button type="button" role="menuitem" class="od-logbook-selector--item od-logbook-selector--recent" onclick={() => run(() => (here ? undefined : openRecent(entry.id)))}>
            <span class="od-logbook-selector--check">{#if here}<Icon name="check" size={18} weight={2} />{/if}</span>
            <span class="od-logbook-selector--text">
              <span class="od-logbook-selector--item-name">{displayName(entry, t)}</span>
              <span class="od-logbook-selector--item-source">{[sourceText(entry, t), whenText(entry, now, t, formatDate)].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        {:else}
          <p class="od-logbook-selector--none">{t('desktopLogbooks.selector.noRecent')}</p>
        {/each}
        <hr class="od-logbook-selector--rule" />
        <button type="button" role="menuitem" class="od-logbook-selector--item" onclick={() => run(() => (logbooks.dialog = true))}>
          <span class="od-logbook-selector--label">{t('desktopLogbooks.selector.newLogbook')}</span><kbd>{shortcuts.newLogbook}</kbd>
        </button>
        <button type="button" role="menuitem" class="od-logbook-selector--item" onclick={() => run(openLogbookDialog)}>
          <span class="od-logbook-selector--label">{t('desktopLogbooks.selector.openLogbook')}</span><kbd>{shortcuts.openLogbook}</kbd>
        </button>
        <button type="button" role="menuitem" class="od-logbook-selector--item" onclick={() => run(saveCopy)}>
          <span class="od-logbook-selector--label">{t('desktopLogbooks.selector.saveCopy')}</span><kbd>{shortcuts.saveCopy}</kbd>
        </button>
        {#if onexport}
          <button type="button" role="menuitem" class="od-logbook-selector--item" onclick={() => run(onexport)}>
            <span class="od-logbook-selector--label">{t('desktop.export.logbook')}</span><kbd>Ctrl+Maj+E</kbd>
          </button>
        {/if}
        <hr class="od-logbook-selector--rule" />
        <button type="button" role="menuitem" class="od-logbook-selector--item" onclick={() => run(closeLogbook)}>
          <span class="od-logbook-selector--label">{t('desktopLogbooks.selector.closeLogbook')}</span><kbd>{shortcuts.closeLogbook}</kbd>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  @layer od.components {
    .od-logbook-selector {
      position: relative;
      display: inline-flex;
    }
    .od-logbook-selector--pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 12px 0 16px;
      border: none;
      border-radius: 22px;
      background: var(--od-surface-2);
      color: var(--od-text);
      font: inherit;
      cursor: pointer;
    }
    .od-logbook-selector--pill:focus-visible {
      outline: 2px solid var(--od-action);
      outline-offset: 2px;
    }
    .od-logbook-selector--title {
      font-family: var(--od-title-font);
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }
    .od-logbook-selector--name {
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 16px;
      color: var(--od-text-2);
    }
    .od-logbook-selector--name::before {
      content: '· ';
    }
    .od-logbook-selector--scrim {
      position: fixed;
      inset: 0;
      z-index: 13000;
    }
    .od-logbook-selector--menu {
      position: fixed;
      top: 52px;
      left: 108px;
      width: 360px;
      max-height: calc(100vh - 68px);
      overflow-y: auto;
      box-sizing: border-box;
      padding: 8px 0;
      border-radius: 12px;
      background: var(--od-dialog);
      box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
      outline: none;
    }
    .od-logbook-selector--heading {
      margin: 0;
      padding: 8px 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-logbook-selector--none {
      margin: 0;
      padding: 8px 16px;
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-logbook-selector--rule {
      margin: 8px 0;
      border: none;
      border-top: 1px solid var(--od-separator);
    }
    .od-logbook-selector--item {
      display: flex;
      align-items: center;
      width: 100%;
      box-sizing: border-box;
      min-height: 44px;
      padding: 4px 16px;
      border: none;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      font-size: 15px;
      text-align: start;
      cursor: pointer;
    }
    .od-logbook-selector--item:hover,
    .od-logbook-selector--item:focus-visible {
      background: var(--od-surface-2);
      outline: none;
    }
    .od-logbook-selector--check {
      flex: none;
      width: 28px;
      color: var(--od-selected);
    }
    .od-logbook-selector--text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .od-logbook-selector--item-name {
      font-size: 16px;
      line-height: 20px;
    }
    .od-logbook-selector--item-source {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-logbook-selector--label {
      flex: 1;
    }
    .od-logbook-selector--item kbd {
      margin-inline-start: 16px;
      font: inherit;
      font-size: 13px;
      color: var(--od-text-2);
    }
  }
</style>
