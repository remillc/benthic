<script>
  // @ts-check
  // The « Lest » card's content on an Android phone (task 2026-11-26-403; mock-ups detail-onglets-equipement-android,
  // detail3-android and detail2-android-menu): the amber suggestion (« Suggestion : 18 lb — Comme le … », « Utiliser », a
  // cross that dismisses it), then one row per weight with its Type (a grey field that opens the sheet of the diver's weight
  // types, « Gérer les types de lest » last), its Poids with the unit and a cross that removes the row; the labels are above
  // the first row only; an outlined « Ajouter un lest » and the note under it. Every change is kept at once, as in the
  // detail's other grey fields: the weight when the field is left or Entrée is pressed (Échap restores it), the type and the
  // cross at the touch. `onsave` gets the rows of lib/desktop-edit.js weightChanges and returns false when the change could
  // not be saved. The other devices keep the chips (components/DesktopWeights.svelte), as their mock-ups draw them.
  import DetailSheet from './DetailSheet.svelte';
  import Icon from './Icon.svelte';
  import { readWeightTypeRows } from '../lib/weight-types.svelte.js';
  import { openOver } from '../lib/navigation.svelte.js';
  import { formatWeight } from '../lib/format.js';
  import { weightPlaceName } from '../lib/desktop-detail.js';
  import { parseTyped, weightText } from '../lib/desktop-edit.js';
  import { t } from '../lib/i18n.js';

  /**
   * `suggestion`: the amber banner (texts already formatted), null when none is shown.
   * @type {{
   *   weights: { grams: number, description: string }[],
   *   previous?: { grams: number, description: string }[],
   *   prefs: { weight: string },
   *   suggestion?: { weight: string, date: string }|null,
   *   onuse?: () => void,
   *   ondismiss?: () => void,
   *   onsave: (rows: { description: string, text: string, grams0: number, text0: string }[]) => Promise<boolean|void>|boolean|void,
   * }}
   */
  let { weights, previous = [], prefs, suggestion = null, onuse = () => {}, ondismiss = () => {}, onsave } = $props();

  /** Subsurface's own weight types: the list when the core cannot give the logbook's. */
  const PLACES = ['integrated', 'belt', 'ankle', 'backplate', 'clip-on'];
  /** @type {{ name: string, grams: number }[]} */
  let types = $state([]);
  readWeightTypeRows().then(
    (rows) => (types = rows.map((r) => ({ name: r.name, grams: r.grams }))),
    (/** @type {unknown} */ e) => console.error('Weight types', e),
  );
  const names = $derived(types.length ? types.map((w) => w.name) : PLACES);
  /**
   * The weight a type starts from: the previous dive's weight of that type, else the type's usual weight (Réglages › Types de
   * lest); 0 when none.
   * @param {string} name
   */
  const suggested = (name) => previous.find((w) => w.description === name && w.grams > 0)?.grams || types.find((w) => w.name === name)?.grams || 0;
  const unit = $derived(prefs.weight === 'lbs' ? t('units.pounds') : t('units.kilograms'));
  const limit = $derived(prefs.weight === 'lbs' ? 400 : 200);

  /** The weights as the rows `onsave` takes, unchanged. */
  const rowsOf = () => weights.map((w) => ({ description: w.description, text: weightText(w.grams, prefs), grams0: w.grams, text0: weightText(w.grams, prefs) }));
  /** The typed text of each row, back to the saved weight whenever the dive changes. @type {string[]} */
  let texts = $state([]);
  $effect(() => {
    texts = weights.map((w) => weightText(w.grams, prefs));
  });
  /** A row not saved yet: « Ajouter un lest » adds it with the type of the previous dive and its weight; the weight kept saves it. @type {{ description: string, text: string }|null} */
  let adding = $state(null);

  /** @param {string} text */
  const valid = (text) => parseTyped(text) >= 0 && parseTyped(text) <= limit;
  let saving = false;
  /** @param {{ description: string, text: string, grams0: number, text0: string }[]} rows */
  async function save(rows) {
    if (saving) return;
    saving = true;
    try {
      await onsave(rows);
    } finally {
      saving = false;
    }
  }

  /** The weight of row `i` is kept: valid and changed, saved; invalid or empty, back to what it was. @param {number} i */
  function commit(i) {
    const text = texts[i] ?? '';
    if (text === weightText(weights[i].grams, prefs)) return;
    if (!text.trim() || !valid(text)) {
      texts[i] = weightText(weights[i].grams, prefs);
      return;
    }
    save(rowsOf().map((r, j) => (j === i ? { ...r, text } : r)));
  }
  function commitAdding() {
    const row = adding;
    if (!row || !row.text.trim() || !valid(row.text)) return;
    adding = null;
    save([...rowsOf(), { description: row.description, text: row.text, grams0: -1, text0: '' }]);
  }
  /** @param {number} i */
  const removeAt = (i) => save(rowsOf().filter((_, j) => j !== i));
  function add() {
    // The previous dive's first weight type not on this dive yet, else the logbook's first type; with its weight.
    const name = previous.find((w) => !weights.some((x) => x.description === w.description))?.description ?? names[0] ?? 'belt';
    const grams = suggested(name);
    adding = { description: name, text: grams ? weightText(grams, prefs) : '' };
    // A type that brings its weight is a complete row: it is kept at once.
    if (grams) commitAdding();
  }

  /** The sheet of the weight types: for row `index`, or -1 for the new one. @type {{ index: number }|null} */
  let choosing = $state(null);
  const MANAGE = ':manage-weight-types';
  const sheetOptions = $derived.by(() => {
    const own = choosing ? (choosing.index < 0 ? adding?.description : weights[choosing.index]?.description) : '';
    const list = names.map((value) => {
      const grams = suggested(value);
      return { value, label: weightPlaceName(value), example: grams ? formatWeight(grams, prefs) : '' };
    });
    if (own && !names.includes(own)) list.unshift({ value: own, label: weightPlaceName(own), example: '' });
    return [...list, { value: MANAGE, label: t('desktopDetail.manageWeightTypes'), example: '', icon: 'settings', divider: true }];
  });
  /** @param {string} value */
  function pickType(value) {
    const target = choosing;
    choosing = null;
    if (value === MANAGE) {
      adding = null;
      openOver('/settings/weights/');
      return;
    }
    if (!target) return;
    const grams = suggested(value);
    if (target.index < 0) {
      if (adding) adding = { description: value, text: adding.text.trim() || !grams ? adding.text : weightText(grams, prefs) };
      commitAdding();
      return;
    }
    const w = weights[target.index];
    if (!w || w.description === value) return;
    // A weight without a number yet takes the one of that type at the previous dive (else its usual one).
    const fill = !(w.grams > 0) && grams;
    save(rowsOf().map((r, j) => (j === target.index ? { ...r, description: value, text: fill ? weightText(grams, prefs) : r.text } : r)));
  }

  /** @param {KeyboardEvent} e @param {number} i */
  function keydown(e, i) {
    if (e.key === 'Enter') {
      e.preventDefault();
      /** @type {HTMLElement} */ (e.currentTarget).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (i >= 0) texts[i] = weightText(weights[i].grams, prefs);
      else adding = null;
      /** @type {HTMLElement} */ (e.currentTarget).blur();
    }
  }
  /** One row's list: the saved weights, then the new one. */
  const rows = $derived([...weights.map((w, i) => ({ i, description: w.description })), ...(adding ? [{ i: -1, description: adding.description }] : [])]);
</script>

<div class="bc-dive-weight-rows" role="group" aria-label={t('desktopDetail.label.weights')}>
  {#if suggestion}
    <div class="bc-dive-weight-rows--suggestion" role="group" aria-label={t('edit.weightSuggestionLabel', suggestion)}>
      <span class="bc-dive-weight-rows--suggestion-icon"><Icon name="lightbulb" size={24} /></span>
      <span class="bc-dive-weight-rows--suggestion-texts">
        <span class="bc-dive-weight-rows--suggestion-title">{t('edit.weightSuggestion', suggestion)}</span>
        <span class="bc-dive-weight-rows--suggestion-from">{t('edit.weightSuggestionFrom', suggestion)}</span>
      </span>
      <button type="button" class="bc-dive-weight-rows--suggestion-use" onclick={onuse}>{t('edit.weightUse')}</button>
      <button type="button" class="bc-dive-weight-rows--suggestion-close" aria-label={t('desktopDetail.weightSuggestionClose')} onclick={ondismiss}><Icon name="close" size={20} /></button>
    </div>
  {/if}
  {#each rows as row, n (row.i)}
    <div class="bc-dive-weight-rows--row" data-weight-row={row.i}>
      <div class="bc-dive-weight-rows--type">
        {#if n === 0}<span class="bc-dive-weight-rows--label">{t('desktopDetail.weightType')}</span>{/if}
        <button type="button" class="bc-dive-weight-rows--field bc-dive-weight-rows--type-field" aria-haspopup="dialog" aria-label={`${t('desktopDetail.weightType')} : ${weightPlaceName(row.description)}`} onclick={() => (choosing = { index: row.i })}>
          <span class="bc-dive-weight-rows--type-name">{weightPlaceName(row.description)}</span>
          <Icon name="expand" size={24} />
        </button>
      </div>
      <div class="bc-dive-weight-rows--amount">
        {#if n === 0}<span class="bc-dive-weight-rows--label">{t('edit.weight')}</span>{/if}
        <label class="bc-dive-weight-rows--field bc-dive-weight-rows--amount-field">
          {#if row.i >= 0}
            <input class="bc-dive-weight-rows--input" type="text" inputmode="decimal" aria-label={t('edit.weight')} aria-invalid={!valid(texts[row.i] ?? '') && (texts[row.i] ?? '') !== ''} bind:value={texts[row.i]} onblur={() => commit(row.i)} onkeydown={(e) => keydown(e, row.i)} />
          {:else if adding}
            <input class="bc-dive-weight-rows--input" type="text" inputmode="decimal" aria-label={t('edit.weight')} aria-invalid={adding.text !== '' && !valid(adding.text)} bind:value={adding.text} onblur={commitAdding} onkeydown={(e) => keydown(e, -1)} />
          {/if}
          <span class="bc-dive-weight-rows--unit">{unit}</span>
        </label>
      </div>
      <button type="button" class="bc-dive-weight-rows--remove" aria-label={t('desktopDetail.removeWeight')} onclick={() => (row.i >= 0 ? removeAt(row.i) : (adding = null))}><Icon name="close" size={20} /></button>
    </div>
  {/each}
  <button type="button" class="bc-dive-weight-rows--add" onclick={add}><Icon name="plus" size={18} />{t('desktopDetail.addWeight')}</button>
  <p class="bc-dive-weight-rows--note">{t('desktopDetail.weightRowsNote')}</p>
</div>
{#if choosing}
  <DetailSheet
    title={t('desktopDetail.weightType')}
    options={sheetOptions}
    value={choosing.index < 0 ? (adding?.description ?? '') : (weights[choosing.index]?.description ?? '')}
    onselect={pickType}
    onclose={() => (choosing = null)}
  />
{/if}

<style>
  @layer bc.components {
    .bc-dive-weight-rows {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    /* The suggestion: amber, 12 dp corners, the light bulb, two lines, « Utiliser » and a close button (mock-up detail-onglets-equipement-android). */
    .bc-dive-weight-rows--suggestion {
      padding: 12px 8px 12px 16px;
      border-radius: 12px;
      background: var(--bc-tertiary-container);
      color: var(--bc-on-tertiary-container);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bc-dive-weight-rows--suggestion-icon {
      flex: none;
      display: flex;
      color: var(--bc-tertiary);
    }

    .bc-dive-weight-rows--suggestion-texts {
      flex: 1;
      min-width: 0;
    }

    .bc-dive-weight-rows--suggestion-title {
      display: block;
      font-size: 16px;
      font-weight: 600;
    }

    .bc-dive-weight-rows--suggestion-from {
      display: block;
      font-size: 13px;
      line-height: 18px;
    }

    /* Framework7 stretches buttons to the full width (an unlayered rule): the sizes are set here. */
    .bc-dive-weight-rows--suggestion-use {
      width: auto;
      flex: none;
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: var(--bc-tertiary);
      color: var(--bc-on-tertiary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-dive-weight-rows--suggestion-close {
      width: 40px;
      flex: none;
      height: 40px;
      margin-inline-end: -4px;
      padding: 0;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--bc-on-tertiary-container);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-dive-weight-rows--row {
      margin-top: 12px;
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .bc-dive-weight-rows--row + .bc-dive-weight-rows--row {
      margin-top: 8px;
    }

    .bc-dive-weight-rows--suggestion + .bc-dive-weight-rows--row {
      margin-top: 12px;
    }

    .bc-dive-weight-rows--type {
      flex: 1;
      min-width: 0;
    }

    .bc-dive-weight-rows--amount {
      flex: 0 0 96px;
    }

    .bc-dive-weight-rows--label {
      display: block;
      margin: 0 0 6px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* The detail's grey in-place field: 48 dp, 10 dp corners (not a filled text field). */
    .bc-dive-weight-rows--field {
      box-sizing: border-box;
      width: 100%;
      min-height: 48px;
      margin: 0;
      padding: 0 12px;
      border: 0;
      border-radius: 10px;
      background: var(--bc-field-rest);
      color: var(--bc-text);
      font: inherit;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
      text-align: start;
    }

    .bc-dive-weight-rows--type-field {
      color: var(--bc-text);

      :global(svg) {
        flex: none;
        color: var(--bc-text-2);
      }
    }

    .bc-dive-weight-rows--type-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bc-dive-weight-rows--amount-field {
      font-variant-numeric: tabular-nums;
      cursor: text;

      &:focus-within {
        box-shadow: inset 0 0 0 2px var(--bc-secondary);
      }
    }

    .bc-dive-weight-rows--input {
      flex: 1;
      min-width: 0;
      width: 100%;
      height: 46px;
      margin: 0;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: inherit;
      font: inherit;

      &[aria-invalid='true'] {
        color: var(--bc-alarm);
      }
    }

    .bc-dive-weight-rows--unit {
      flex: none;
      color: var(--bc-text-2);
    }

    .bc-dive-weight-rows--remove {
      width: 48px;
      flex: none;
      height: 48px;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--bc-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* « Ajouter un lest »: outlined, 40 dp, fully rounded. */
    .bc-dive-weight-rows--add {
      width: auto;
      align-self: flex-start;
      margin: 12px 0 0;
      height: 40px;
      padding: 0 16px 0 12px;
      border: 1px solid var(--bc-outline);
      border-radius: 20px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .bc-dive-weight-rows--note {
      margin: 8px 0 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }
  }
</style>
