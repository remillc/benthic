<script>
  // @ts-check
  // The « Lest » field of the desktop detail's Équipement tab (task 2026-11-16-262; mock-up
  // bureau-carnet-onglet-equipement): every weight of the dive is a chip with its place and its weight
  // (« Ceinture 5 kg ») with a cross that removes it, then a dashed « + Ajouter » chip; the total is in the card's
  // header (task 2026-11-23-366). The chips wrap on a second line when there are many. A click on a chip edits it
  // in place (place and weight); Entrée or leaving the field keeps it and saves it at once, Échap restores it. `onsave` gets the rows of desktop-edit.js
  // weightChanges and returns false when the change could not be saved.
  import { tick } from 'svelte';
  import { BenthicCore } from 'benthic-core';
  import Icon from './Icon.svelte';
  import { weightChips, weightPlaceName } from '../lib/desktop-detail.js';
  import { parseTyped, weightText } from '../lib/desktop-edit.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   weights: { grams: number, description: string }[],
   *   prefs: { weight: string },
   *   label: string,
   *   onsave: (rows: { description: string, text: string, grams0: number, text0: string }[]) => Promise<boolean|void>|boolean|void,
   * }}
   */
  let { weights, prefs, label, onsave } = $props();

  /** Subsurface's own weight types: the list when the core cannot give the logbook's. */
  const PLACES = ['integrated', 'belt', 'ankle', 'backplate', 'clip-on'];
  /**
   * The logbook's weight types, each with the weight last used for it (Subsurface's ws_info table: its own types and those
   * of the earlier dives), as the dive editor offered them.
   * @type {{ name: string, grams: number }[]}
   */
  let types = $state([]);
  BenthicCore.toolQuery({ kind: 'weights' }).then(
    (/** @type {{ types: { name: string, grams: number }[] }} */ list) => (types = Array.isArray(list?.types) ? list.types.filter((w) => w.name) : []),
    (/** @type {unknown} */ e) => console.error('Weight types', e),
  );
  const names = $derived(types.length ? types.map((w) => w.name) : PLACES);
  const shown = $derived(weightChips(weights, prefs));
  const unit = $derived(prefs.weight === 'lbs' ? t('units.pounds') : t('units.kilograms'));
  const limit = $derived(prefs.weight === 'lbs' ? 400 : 200);

  /** The weight being edited: `index` -1 for a new one. @type {{ index: number, description: string, text: string }|null} */
  let editing = $state(null);
  let saving = false;
  /** @type {HTMLElement|undefined} */
  let box = $state();

  const placeOptions = $derived.by(() => {
    const list = names.map((value) => ({ value, label: weightPlaceName(value) }));
    const d = editing?.description ?? '';
    if (d && !names.includes(d)) list.unshift({ value: d, label: weightPlaceName(d) });
    return list;
  });
  const valid = $derived(!editing || !editing.text.trim() || (parseTyped(editing.text) >= 0 && parseTyped(editing.text) <= limit));

  /** @param {number} index */
  function edit(index) {
    const w = weights[index];
    editing = { index, description: w.description, text: weightText(w.grams, prefs) };
    focusEditor();
  }
  function add() {
    // As the dive editor did: the logbook's first weight type, with the weight last used for it.
    const first = types[0];
    editing = { index: -1, description: first?.name ?? 'belt', text: first?.grams ? weightText(first.grams, prefs) : '' };
    focusEditor();
  }
  function focusEditor() {
    tick().then(() => /** @type {HTMLElement|null|undefined} */ (box?.querySelector('input'))?.focus());
  }
  /** The rows of every weight, the edited one replaced (or removed). @param {boolean} [remove] */
  function rowsFor(remove = false) {
    const rows = weights.map((w) => ({ description: w.description, text: weightText(w.grams, prefs), grams0: w.grams, text0: weightText(w.grams, prefs) }));
    const e = editing;
    if (!e) return rows;
    if (e.index < 0) return remove || !e.text.trim() ? rows : [...rows, { description: e.description, text: e.text, grams0: -1, text0: '' }];
    return remove ? rows.filter((_, i) => i !== e.index) : rows.map((r, i) => (i === e.index ? { ...r, description: e.description, text: e.text } : r));
  }
  /** A chip's cross: that weight is removed at once. @param {number} index */
  async function removeAt(index) {
    if (saving) return;
    saving = true;
    try {
      await onsave(weights.map((w) => ({ description: w.description, text: weightText(w.grams, prefs), grams0: w.grams, text0: weightText(w.grams, prefs) })).filter((_, i) => i !== index));
    } finally {
      saving = false;
    }
  }
  /** @param {boolean} [remove] */
  async function keep(remove = false) {
    if (!editing || saving) return;
    if (!valid && !remove) {
      editing = null;
      return;
    }
    const rows = rowsFor(remove);
    editing = null;
    saving = true;
    try {
      await onsave(rows);
    } finally {
      saving = false;
    }
  }
  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      keep();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      editing = null;
    }
  }
  /** @param {FocusEvent} e */
  function focusout(e) {
    if (e.relatedTarget && box?.contains(/** @type {Node} */ (e.relatedTarget))) return;
    keep();
  }
</script>

<div class="bc-desktop-weights" role="group" aria-label={label}>
  {#if editing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bc-desktop-weights--editing" bind:this={box} onfocusout={focusout} onkeydown={keydown}>
      <select class="bc-desktop-weights--place" aria-label={t('desktopDetail.weightPlace')} value={editing.description} onchange={(e) => editing && (editing.description = e.currentTarget.value)}>
        {#each placeOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
      </select>
      <input class="bc-desktop-weights--input" type="text" inputmode="decimal" aria-label={label} aria-invalid={!valid} value={editing.text} oninput={(e) => editing && (editing.text = e.currentTarget.value)} />
      <span class="bc-desktop-weights--unit">{unit}</span>
      {#if editing.index >= 0}
        <button type="button" class="bc-desktop-weights--remove" aria-label={t('desktopDetail.removeWeight')} title={t('desktopDetail.removeWeight')} onmousedown={(e) => e.preventDefault()} onclick={() => keep(true)}><Icon name="delete" size={18} /></button>
      {/if}
      <span class="bc-desktop-weights--hint">{valid ? t('desktopDetail.hint') : t('desktopDetail.invalid')}</span>
    </div>
  {:else}
    <div class="bc-desktop-weights--rest">
      {#each shown.chips as chip (chip.index)}
        <span class="bc-desktop-weights--chip">
          <button type="button" class="bc-desktop-weights--chip-edit" aria-label="{chip.place} {chip.weight}" onclick={() => edit(chip.index)}>
            {chip.place}<span class="bc-desktop-weights--amount">{chip.weight}</span>
          </button>
          <button type="button" class="bc-desktop-weights--chip-x" aria-label={t('desktopDetail.removeWeightNamed', { name: `${chip.place} ${chip.weight}` })} title={t('desktopDetail.removeWeight')} onclick={() => removeAt(chip.index)}><Icon name="close" size={16} /></button>
        </span>
      {/each}
      <button type="button" class="bc-desktop-weights--add" onclick={add}><Icon name="plus" size={18} />{t('desktopDetail.add')}</button>
    </div>
  {/if}
</div>

<style>
  @layer bc.components {
    .bc-desktop-weights {
      min-width: 0;
    }

    .bc-desktop-weights--rest {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      color: var(--bc-text);
    }

    .bc-desktop-weights--editing {
      box-sizing: border-box;
      min-height: 40px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 15px;
      color: var(--bc-text);
      background: var(--bc-surface);
      box-shadow: inset 0 0 0 2px var(--bc-secondary);
    }

    /* A weight: 40 px tall, 8 px corners, a 1 px border; the cross removes it. */
    .bc-desktop-weights--chip {
      box-sizing: border-box;
      height: 40px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--bc-field-hover);
      border-radius: 8px;
      color: var(--bc-text);
      font-size: 14px;
    }

    .bc-desktop-weights--chip-edit {
      width: auto;
      height: 100%;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 4px 0 12px;
      border: 0;
      border-radius: 7px 0 0 7px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
    }

    .bc-desktop-weights--chip-x {
      width: 32px;
      height: 100%;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 0 7px 7px 0;
      background: none;
      color: var(--bc-text-2);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
        color: var(--bc-text);
      }
    }

    .bc-desktop-weights--amount {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .bc-desktop-weights--add {
      width: auto;
      height: 40px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 12px 0 8px;
      border: 1.5px dashed var(--bc-gas-card-add-outline);
      border-radius: 8px;
      background: none;
      color: var(--bc-on-table-selected);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
    }

    .bc-desktop-weights--place,
    .bc-desktop-weights--input {
      height: 32px;
      border: 0;
      outline: 0;
      background: none;
      color: inherit;
      font: inherit;
    }

    .bc-desktop-weights--input {
      width: 80px;
      border-bottom: 1px solid var(--bc-field-hover);
    }

    .bc-desktop-weights--unit {
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-desktop-weights--remove {
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
    }

    .bc-desktop-weights--hint {
      flex-basis: 100%;
      font-size: 12px;
      color: var(--bc-text-2);
    }
  }
</style>
