<script>
  // @ts-check
  // The « Lest » field of the desktop detail's Équipement tab (task 2026-11-16-262; mock-up
  // bureau-carnet-onglet-equipement): every weight of the dive is a chip with its place and its weight
  // (« Ceinture 5 kg ») with a cross that removes it, then a dashed « + Ajouter » chip; the total is in the card's
  // header (task 2026-11-23-366). The chips wrap on a second line when there are many. A click on a chip edits it
  // in place (place and weight); Entrée or leaving the field keeps it and saves it at once, Échap restores it. `onsave` gets the rows of desktop-edit.js
  // weightChanges and returns false when the change could not be saved.
  import { tick } from 'svelte';
  import DetailSheet from './DetailSheet.svelte';
  import { readWeightTypeRows } from '../lib/weight-types.svelte.js';
  import { openOver } from '../lib/navigation.svelte.js';
  import { formatWeight } from '../lib/format.js';
  import Icon from './Icon.svelte';
  import { weightChips, weightPlaceName } from '../lib/desktop-detail.js';
  import { parseTyped, weightText } from '../lib/desktop-edit.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   weights: { grams: number, description: string }[],
   *   previous?: { grams: number, description: string }[],
   *   prefs: { weight: string },
   *   label: string,
   *   onsave: (rows: { description: string, text: string, grams0: number, text0: string }[]) => Promise<boolean|void>|boolean|void,
   * }}
   */
  let { weights, previous = [], prefs, label, onsave } = $props();

  /** Subsurface's own weight types: the list when the core cannot give the logbook's. */
  const PLACES = ['integrated', 'belt', 'ankle', 'backplate', 'clip-on'];
  /**
   * The logbook's weight types, each with the weight last used for it (Subsurface's ws_info table: its own types and those
   * of the earlier dives), as the dive editor offered them.
   * @type {{ name: string, grams: number }[]}
   */
  let types = $state([]);
  // With the diver's own types and usual weights (Settings › Types de lest, lib/weight-types.svelte.js).
  readWeightTypeRows().then(
    (rows) => (types = rows.map((r) => ({ name: r.name, grams: r.grams }))),
    (/** @type {unknown} */ e) => console.error('Weight types', e),
  );
  const names = $derived(types.length ? types.map((w) => w.name) : PLACES);
  /**
   * The weight a type starts from: the previous dive's weight of that type, else the type's usual weight (Settings › Types
   * de lest, or the weight last used); 0 when none.
   * @param {string} name
   */
  const suggested = (name) => previous.find((w) => w.description === name && w.grams > 0)?.grams || types.find((w) => w.name === name)?.grams || 0;
  const shown = $derived(weightChips(weights, prefs));
  const unit = $derived(prefs.weight === 'lbs' ? t('units.pounds') : t('units.kilograms'));
  const limit = $derived(prefs.weight === 'lbs' ? 400 : 200);

  /** The weight being edited: `index` -1 for a new one. @type {{ index: number, description: string, text: string }|null} */
  let editing = $state(null);
  /** The chips shown: every weight but the one being edited. */
  const others = $derived(shown.chips.filter((chip) => chip.index !== editing?.index));
  let saving = false;
  /** @type {HTMLElement|undefined} */
  let box = $state();

  const placeOptions = $derived.by(() => {
    const list = names.map((value) => {
      const grams = suggested(value);
      return { value, label: weightPlaceName(value), example: grams ? formatWeight(grams, prefs) : '' };
    });
    const d = editing?.description ?? '';
    if (d && !names.includes(d)) list.unshift({ value: d, label: weightPlaceName(d) });
    return list;
  });
  /** The sheet of the weight types is open. */
  let choosing = $state(false);
  /** The row of the sheet that opens Settings › Types de lest. */
  const MANAGE = ':manage-weight-types';
  const sheetOptions = $derived([...placeOptions, { value: MANAGE, label: t('desktopDetail.manageWeightTypes'), icon: 'settings', divider: true }]);
  /** @param {string} value */
  function pickType(value) {
    if (value === MANAGE) {
      editing = null;
      openOver('/settings/weights/');
      return;
    }
    if (!editing) return;
    // A new weight, or one without a weight yet, takes the weight of that type at the previous dive (else its usual one).
    const fill = editing.index < 0 || !editing.text.trim();
    editing.description = value;
    const grams = suggested(value);
    if (fill && grams) editing.text = weightText(grams, prefs);
  }
  const valid = $derived(!editing || !editing.text.trim() || (parseTyped(editing.text) >= 0 && parseTyped(editing.text) <= limit));

  /** @param {number} index */
  function edit(index) {
    const w = weights[index];
    editing = { index, description: w.description, text: weightText(w.grams, prefs) };
    focusEditor();
  }
  function add() {
    // The previous dive's first weight type not on this dive yet, else the logbook's first type; with its weight.
    const name = previous.find((w) => !weights.some((x) => x.description === w.description))?.description ?? types[0]?.name ?? 'belt';
    const grams = suggested(name);
    editing = { index: -1, description: name, text: grams ? weightText(grams, prefs) : '' };
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
    // The sheet of the types takes the focus: the weight being typed stays open.
    if (choosing) return;
    if (e.relatedTarget && box?.contains(/** @type {Node} */ (e.relatedTarget))) return;
    keep();
  }
</script>

<div class="bc-desktop-weights" role="group" aria-label={label}>
  <!-- The weights already entered stay in sight while one is typed: only the one being edited leaves the row. -->
  {#if !editing || others.length}
    <div class="bc-desktop-weights--rest">
      {#each others as chip (chip.index)}
        <span class="bc-desktop-weights--chip">
          <button type="button" class="bc-desktop-weights--chip-edit" aria-label="{chip.place} {chip.weight}" onclick={() => edit(chip.index)}>
            {chip.place}<span class="bc-desktop-weights--amount">{chip.weight}</span>
          </button>
          <button type="button" class="bc-desktop-weights--chip-x" aria-label={t('desktopDetail.removeWeightNamed', { name: `${chip.place} ${chip.weight}` })} title={t('desktopDetail.removeWeight')} onclick={() => removeAt(chip.index)}><Icon name="close" size={16} /></button>
        </span>
      {/each}
      {#if !editing}<button type="button" class="bc-desktop-weights--add" onclick={add}><Icon name="plus" size={18} />{t('desktopDetail.add')}</button>{/if}
    </div>
  {/if}
  {#if editing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bc-desktop-weights--editing" bind:this={box} onfocusout={focusout} onkeydown={keydown}>
      <button type="button" class="bc-desktop-weights--place" aria-label={t('desktopDetail.weightPlace')} aria-haspopup="listbox" onclick={() => (choosing = true)}>
        <span class="bc-desktop-weights--place-name">{weightPlaceName(editing.description)}</span><Icon name="arrowDown" size={18} />
      </button>
      <input class="bc-desktop-weights--input" type="text" inputmode="decimal" aria-label={label} aria-invalid={!valid} value={editing.text} oninput={(e) => editing && (editing.text = e.currentTarget.value)} />
      <span class="bc-desktop-weights--unit">{unit}</span>
      {#if editing.index >= 0}
        <button type="button" class="bc-desktop-weights--remove" aria-label={t('desktopDetail.removeWeight')} title={t('desktopDetail.removeWeight')} onmousedown={(e) => e.preventDefault()} onclick={() => keep(true)}><Icon name="delete" size={18} /></button>
      {/if}
      <!-- « Ajouter » (a new weight) or « OK »: the weight is kept without needing Enter. -->
      <button type="button" class="bc-desktop-weights--confirm" disabled={!valid} onmousedown={(e) => e.preventDefault()} onclick={() => keep()}>{editing.index < 0 ? t('desktopDetail.add') : t('dialog.ok')}</button>
      <span class="bc-desktop-weights--hint">{valid ? t('desktopDetail.hint') : t('desktopDetail.invalid')}</span>
    </div>
  {/if}
</div>
{#if choosing && editing}
  <DetailSheet title={t('desktopDetail.weightPlace')} options={sheetOptions} value={editing.description} onselect={pickType} onclose={() => { choosing = false; focusEditor(); }} />
{/if}

<style>
  @layer bc.components {
    .bc-desktop-weights {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
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

    /* « Ajouter » / « OK »: a filled button at the end of the row, 32 px like the fields. */
    .bc-desktop-weights--confirm {
      height: 32px;
      padding: 0 14px;
      border: none;
      border-radius: 16px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;

      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
    }

    /* The type: a button that opens the sheet of the weight types (no system list, no radio buttons). */
    .bc-desktop-weights--place {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      border-radius: 8px;
      background: var(--bc-surface-container);
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-text);
      }
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
