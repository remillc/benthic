<script>
  // @ts-check
  // The desktop's right-click menu (task 2026-11-15-169; docs/system-design.md, section 7):
  // 12 dp corners, 44 dp items with an icon, a label and the shortcut on the right; a first
  // line names what the menu acts on. Opens at the pointer, kept inside the window; ↑ ↓ move,
  // Entrée chooses, Échap or a click elsewhere closes.
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   x: number, y: number, heading: string,
   *   entries: import('../lib/desktop-table.js').MenuEntry[],
   *   onchoose: (key: string) => void, onclose: () => void,
   * }}
   */
  let { x, y, heading, entries, onchoose, onclose } = $props();

  /** @type {HTMLElement|undefined} */
  let menu = $state();
  let left = $state(0);
  let top = $state(0);

  $effect(() => {
    x;
    y;
    tick().then(() => {
      if (!menu) return;
      const { width, height } = menu.getBoundingClientRect();
      left = Math.max(8, Math.min(x, innerWidth - width - 8));
      top = Math.max(8, Math.min(y, innerHeight - height - 8));
      /** @type {HTMLElement|null} */ (menu.querySelector('.od-context-menu--item:not(:disabled)'))?.focus();
    });
  });

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    const items = /** @type {HTMLElement[]} */ ([...(menu?.querySelectorAll('.od-context-menu--item:not(:disabled)') ?? [])]);
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  /** @param {string} key */
  function choose(key) {
    onclose();
    onchoose(key);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="od-context-menu--scrim"
  onpointerdown={(e) => e.target === e.currentTarget && onclose()}
  oncontextmenu={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <div class="od-context-menu" role="menu" aria-label={heading} bind:this={menu} style:left="{left}px" style:top="{top}px" tabindex="-1" onkeydown={keydown}>
    {#if heading}<p class="od-context-menu--heading">{heading}</p>{/if}
    {#each entries as entry, i (entry.key === 'separator' ? `separator${i}` : entry.key)}
      {#if entry.key === 'separator'}
        <div class="od-context-menu--separator" role="separator"></div>
      {:else if 'label' in entry}
        <button type="button" role="menuitem" class="od-context-menu--item" class:od-context-menu--danger={entry.danger} disabled={entry.disabled} aria-disabled={entry.disabled} title={entry.hint ? t(entry.hint) : undefined} onclick={() => choose(entry.key)}>
          <Icon name={/** @type {any} */ (entry.icon)} size={20} />
          <span class="od-context-menu--label">{entry.text ?? t(entry.label)}{#if entry.hint}<span class="od-context-menu--hint">{t(entry.hint)}</span>{/if}</span>
          {#if entry.shortcut}<kbd class="od-context-menu--shortcut">{entry.shortcut}</kbd>{/if}
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  @layer od.components {
    .od-context-menu--scrim {
      position: fixed;
      inset: 0;
      z-index: 13000;
    }
    .od-context-menu {
      position: fixed;
      min-width: 280px;
      max-width: 360px;
      padding: 8px 0;
      border-radius: 12px;
      background: var(--od-surface);
      box-shadow:
        0 2px 6px 2px rgb(0 0 0 / 0.15),
        0 1px 2px rgb(0 0 0 / 0.3);
      outline: none;
    }
    .od-context-menu--heading {
      margin: 0;
      padding: 4px 16px 8px;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-context-menu--item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 44px;
      padding: 0 16px;
      border: 0;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--od-text);
      text-align: start;
      cursor: pointer;
    }
    .od-context-menu--item:disabled {
      opacity: 0.38;
      cursor: default;
    }
    .od-context-menu--item:not(:disabled):hover,
    .od-context-menu--item:focus-visible {
      background: color-mix(in srgb, var(--od-text) 8%, transparent);
      outline: none;
    }
    .od-context-menu--label {
      flex: 1;
    }
    /* The supporting line of a disabled item: why it cannot be chosen. */
    .od-context-menu--hint {
      display: block;
      padding-block: 2px;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }
    .od-context-menu--shortcut {
      font: inherit;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-context-menu--danger,
    .od-context-menu--danger .od-context-menu--shortcut {
      color: var(--od-menu-danger);
    }
    .od-context-menu--separator {
      height: 1px;
      margin: 8px 0;
      background: var(--od-separator);
    }
  }
</style>
