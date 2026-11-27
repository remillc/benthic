<script>
  // @ts-check
  // A multi-value field of the desktop detail's Informations tab (task 2026-11-23-376): one 36 px chip per value, each with its
  // ✕ « Retirer … », then a dashed « + Ajouter » chip that opens the picker (the names already in the logbook first, then
  // « Ajouter « … » comme nouveau… »). `variant` 'person' draws a round initial before the name; 'tag' an outlined chip.
  // A change is saved at once, as one undoable step (`onsave` gets the whole list, like the list field's).
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { floatMenu } from '../lib/float-menu.js';
  import { listSuggestions, withItem, withoutItem } from '../lib/desktop-edit.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   label: string,
   *   value: string[],
   *   variant?: 'person'|'tag',
   *   known?: { key: string, dives: number }[],
   *   newLabel?: string,
   *   name?: string,
   *   showLabel?: boolean,
   *   onsave: (value: string[]) => Promise<boolean|void>|boolean|void,
   * }}
   */
  let { label, value, variant = 'person', known = [], newLabel = '', name = '', showLabel = true, onsave } = $props();

  const uid = $props.id();
  let adding = $state(false);
  let typed = $state('');
  let highlighted = $state(-1);
  /** @type {HTMLInputElement|undefined} */
  let input = $state();

  const suggestions = $derived(listSuggestions(known, value, typed));
  const rows = $derived([...suggestions.matches.map((m) => ({ key: m.key, dives: m.dives, add: false })), ...(suggestions.addNew ? [{ key: suggestions.addNew, dives: 0, add: true }] : [])]);

  async function open() {
    adding = true;
    typed = '';
    highlighted = -1;
    await tick();
    input?.focus();
  }
  function close() {
    adding = false;
    typed = '';
    highlighted = -1;
  }
  /** @param {string} key */
  async function add(key) {
    const next = withItem(value, key);
    close();
    if (next !== value) await onsave(next);
  }
  /** @param {number} index */
  async function remove(index) {
    await onsave(withoutItem(value, index));
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (highlighted >= 0 && rows[highlighted]) add(rows[highlighted].key);
      else if (typed.trim()) add(typed);
      else close();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rows.length) {
      e.preventDefault();
      const next = highlighted + (e.key === 'ArrowDown' ? 1 : -1);
      highlighted = next >= rows.length ? -1 : next < -1 ? rows.length - 1 : next;
    }
  }
  /** The focus left the picker: what was typed is kept, as in the other fields. @param {FocusEvent} e */
  function focusout(e) {
    if (!adding || (e.relatedTarget && /** @type {HTMLElement} */ (e.currentTarget).contains(/** @type {Node} */ (e.relatedTarget)))) return;
    if (typed.trim()) add(typed);
    else close();
  }
  /** @param {string} item */
  const initial = (item) => Array.from(item.trim())[0]?.toLocaleUpperCase() ?? '';
</script>

<div class="bc-desktop-chips" data-field={name || undefined} role="group" aria-labelledby="bc-chips-{uid}">
  <span class="bc-desktop-chips--label" class:bc-sr-only={!showLabel} id="bc-chips-{uid}">{label}</span>
  <div class="bc-desktop-chips--row">
    {#each value as item, i (item)}
      <span class="bc-desktop-chips--chip" class:bc-desktop-chips--chip-tag={variant === 'tag'}>
        {#if variant === 'person'}<span class="bc-desktop-chips--initial" aria-hidden="true">{initial(item)}</span>{/if}
        <span class="bc-desktop-chips--name">{item}</span>
        <button type="button" class="bc-desktop-chips--remove" aria-label={t(variant === 'tag' ? 'desktopDetail.removeTag' : 'desktopDetail.removeItem', { name: item })} onclick={() => remove(i)}><Icon name="close" size={16} /></button>
      </span>
    {/each}
    {#if adding}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="bc-desktop-chips--picker" onfocusout={focusout} onkeydown={keydown}>
        <input class="bc-desktop-chips--input" type="text" aria-labelledby="bc-chips-{uid}" bind:this={input} bind:value={typed} oninput={() => (highlighted = -1)} />
        {#if rows.length}
          <ul class="bc-desktop-chips--suggestions" role="listbox" aria-label={label} use:floatMenu>
            {#each rows as row, i (row.add ? `add-${row.key}` : row.key)}
              <li role="option" aria-selected={highlighted === i}>
                <button type="button" class="bc-desktop-chips--suggestion" class:bc-desktop-chips--suggestion-on={highlighted === i} onmousedown={(e) => e.preventDefault()} onclick={() => add(row.key)}>
                  {#if row.add}{newLabel.replace('{name}', row.key)}{:else}<span>{row.key}</span><span class="bc-desktop-chips--dives">{t('desktopDetail.diveCount', { n: row.dives })}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else}
      <button type="button" class="bc-desktop-chips--add" onclick={open}><Icon name="plus" size={18} />{t('desktopDetail.add')}</button>
    {/if}
  </div>
</div>

<style>
  @layer bc.components {
    .bc-desktop-chips {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .bc-desktop-chips--label {
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-desktop-chips--row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .bc-desktop-chips--chip {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 40px;
      max-width: 100%;
      padding: 0 4px 0 4px;
      border-radius: 20px;
      background: var(--bc-chip-fill);
      color: var(--bc-text);
      font-size: 15px;
    }

    /* A tag: the same grey chip, no initial (task 2026-11-27-420). */
    .bc-desktop-chips--chip-tag {
      gap: 4px;
      padding-inline-start: 14px;
    }

    .bc-desktop-chips--initial {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--bc-person-initial);
      color: var(--bc-on-person-initial);
      font-size: 14px;
      font-weight: 600;
    }

    .bc-desktop-chips--name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bc-desktop-chips--remove {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text-2);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }

    .bc-desktop-chips--add {
      box-sizing: border-box;
      flex: none;
      width: auto;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 36px;
      padding: 0 14px 0 10px;
      border: 1px dashed var(--bc-chip-outline);
      border-radius: 18px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
    }

    .bc-desktop-chips--picker {
      position: relative;
      flex: 1 1 200px;
      min-width: 160px;
    }

    .bc-desktop-chips--input {
      box-sizing: border-box;
      width: 100%;
      height: 36px;
      padding: 0 14px;
      border: 2px solid var(--bc-desktop-selected-ink);
      border-radius: 18px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      outline: none;
    }

    .bc-desktop-chips--suggestions {
      /* In the top layer, placed by floatMenu (lib/float-menu.js). */
      position: fixed;
      inset: auto;
      box-sizing: border-box;
      border: none;
      color: var(--bc-text);
      margin: 0;
      padding: 4px;
      list-style: none;
      border-radius: 8px;
      background: var(--bc-surface);
      box-shadow: 0 2px 12px rgb(0 0 0 / 0.22);
    }

    .bc-desktop-chips--suggestion {
      width: 100%;
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border: 0;
      border-radius: 6px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      text-align: start;
      cursor: pointer;
    }

    .bc-desktop-chips--suggestion:hover,
    .bc-desktop-chips--suggestion-on {
      background: var(--bc-field-rest);
    }

    .bc-desktop-chips--dives {
      font-size: 12px;
      color: var(--bc-text-2);
    }
  }
</style>
