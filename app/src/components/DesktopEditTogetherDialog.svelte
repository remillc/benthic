<script>
  // @ts-check
  // « Modifier ensemble… » on the desktop (task 2026-11-15-178, part 2): a dialog « Modifier 3
  // plongées » for the selected dives, an exception to the in-place editing of the detail pane
  // because it changes many dives at once. Site, Guide, Compagnons, Étiquettes, Combinaison, Type
  // d'eau and Notes. A field whose values differ shows « Plusieurs valeurs » and is left as it is
  // unless the diver changes it; the chips are those of every dive, then those of only some
  // (« sur 2 plongées »); what is added or removed is applied to each dive, nothing else is
  // replaced. « Appliquer aux 3 plongées » is one undoable step. The rules are those of the
  // phone's sheet (pages/EditDivesTogether.svelte): lib/multi-dive.js, lib/logbook.svelte.js.
  import { onMount } from 'svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { cachedSites } from '../lib/core-cache.js';
  import { logbookValues } from '../lib/people.js';
  import { editDivesTogether } from '../lib/logbook.svelte.js';
  import { siteChange } from '../lib/sites.svelte.js';
  import { siteChoice, withItem } from '../lib/desktop-edit.js';
  import { multiEditChanges, multiEditState } from '../lib/multi-dive.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { WATER_TYPES, waterTypeName, waterTypeOfSalinity } from '../lib/tools.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ ids: number[], openId?: number|null, onclose: () => void }} */
  let { ids, openId = null, onclose } = $props();

  const uid = $props.id();
  const n = ids.length;

  /** @type {import('../lib/multi-dive.js').MultiEditState|null} */
  let state = $state(null);
  let failed = $state(false);
  let busy = $state(false);
  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  let known = $state({ guide: /** @type {string[]} */ ([]), buddy: /** @type {string[]} */ ([]), tag: /** @type {string[]} */ ([]), suit: /** @type {string[]} */ ([]) });

  // What the diver changed: a field is touched once they act on it.
  let siteTouched = $state(false);
  let siteText = $state('');
  let notesTouched = $state(false);
  let notes = $state('');
  let suitTouched = $state(false);
  let suit = $state('');
  let waterTouched = $state(false);
  let waterType = $state('');
  let guides = $state(/** @type {string[]} */ ([]));
  let buddies = $state(/** @type {string[]} */ ([]));
  let tags = $state(/** @type {string[]} */ ([]));
  const typed = $state({ guides: '', buddies: '', tags: '' });

  onMount(async () => {
    try {
      const details = await Promise.all(ids.map((id) => OpenDivesCore.getDive({ id })));
      const s = multiEditState(details);
      siteText = s.site.mixed ? '' : s.site.value;
      notes = s.notes.mixed ? '' : s.notes.value;
      suit = s.suit.mixed ? '' : s.suit.value;
      waterType = s.salinity.mixed || !s.salinity.value ? '' : waterTypeOfSalinity(s.salinity.value);
      guides = s.guides.map((c) => c.name);
      buddies = s.buddies.map((c) => c.name);
      tags = s.tags.map((c) => c.name);
      state = s;
    } catch (e) {
      console.error('Edit dives together', e);
      failed = true;
      return;
    }
    const [guide, buddy, tag, suitList, siteList] = await Promise.all([
      logbookValues('guide'),
      logbookValues('buddy'),
      logbookValues('tag'),
      logbookValues('suit'),
      cachedSites().catch(() => []),
    ]);
    known = { guide, buddy, tag, suit: suitList };
    sites = siteList;
  });

  const many = t('multiDive.manyValues');

  /** The edits the diver made, as lib/multi-dive.js takes them (a site by name, resolved on applying). @returns {import('../lib/multi-dive.js').MultiEdits} */
  function currentEdits() {
    /** @type {import('../lib/multi-dive.js').MultiEdits} */
    const edits = { guides, buddies, tags };
    if (notesTouched) edits.notes = notes;
    if (suitTouched) edits.suit = suit.trim();
    if (waterTouched) edits.salinity = WATER_TYPES.find((w) => w.id === waterType)?.salinity ?? 0;
    return edits;
  }

  /** Whether anything differs from what the dives hold: the Apply button needs it. */
  const changed = $derived(!!state && (siteTouched || Object.keys(multiEditChanges(state, currentEdits())).length > 0));

  const waterOptions = $derived([
    ...(state?.salinity.mixed && !waterTouched ? [{ value: '__many', label: many }] : []),
    { value: '', label: t('edit.notSet') },
    ...WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) })),
  ]);

  /** @param {Event} e */
  function waterChosen(e) {
    const value = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
    if (value === '__many') return;
    waterType = value;
    waterTouched = true;
  }

  /**
   * The chip lists of the three fields, by key.
   * @param {'guides'|'buddies'|'tags'} key
   */
  const listOf = (key) => (key === 'guides' ? guides : key === 'buddies' ? buddies : tags);
  /** @param {'guides'|'buddies'|'tags'} key @param {string[]} list */
  function setList(key, list) {
    if (key === 'guides') guides = list;
    else if (key === 'buddies') buddies = list;
    else tags = list;
  }
  /** @param {'guides'|'buddies'|'tags'} key @param {string} name */
  function addChip(key, name) {
    setList(key, withItem(listOf(key), name));
    typed[key] = '';
  }
  /** @param {'guides'|'buddies'|'tags'} key @param {string} name */
  const removeChip = (key, name) => setList(key, listOf(key).filter((c) => c !== name));
  /** « sur 2 plongées » for a chip of only some of the dives. @param {'guides'|'buddies'|'tags'} key @param {string} name */
  function noteOf(key, name) {
    const chip = state?.[key].find((c) => c.name === name);
    return chip && !chip.common ? t('multiDive.onSome', { n: chip.count }) : '';
  }
  const knownOf = { guides: () => known.guide, buddies: () => known.buddy, tags: () => known.tag };
  /** The logbook's names matching the typed text, not already chosen. @param {'guides'|'buddies'|'tags'} key */
  function proposals(key) {
    const q = typed[key].trim().toLocaleLowerCase();
    const chosen = new Set(listOf(key).map((c) => c.toLocaleLowerCase()));
    return knownOf[key]()
      .filter((name) => !chosen.has(name.toLocaleLowerCase()) && (!q || name.toLocaleLowerCase().includes(q)))
      .slice(0, 5);
  }
  /** @param {KeyboardEvent} e @param {'guides'|'buddies'|'tags'} key */
  function chipKey(e, key) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (typed[key].trim()) addChip(key, typed[key]);
    } else if (e.key === 'Backspace' && !typed[key]) {
      setList(key, listOf(key).slice(0, -1));
    }
  }

  async function apply() {
    if (!state || busy || !changed) return;
    busy = true;
    let steps = 1;
    try {
      const edits = currentEdits();
      if (siteTouched) {
        const choice = siteChoice(siteText, '', sites);
        if (choice.action === 'create') {
          const created = await siteChange({ action: 'create', value: choice.name });
          steps++;
          edits.site = created.site?.uuid ?? 0;
        } else edits.site = choice.action === 'existing' ? choice.uuid : 0;
      }
      const changes = multiEditChanges(state, edits);
      if (Object.keys(changes).length) await editDivesTogether(ids, changes, openId);
      onclose();
      offerUndo(t('multiDive.edited', { n }), undefined, 6000, steps);
    } catch (e) {
      console.error('Edit dives together', e);
      busy = false;
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('multiDive.editFailed'));
    }
  }
</script>

{#snippet chips(/** @type {'guides'|'buddies'|'tags'} */ key, /** @type {string} */ label)}
  {@const proposed = proposals(key)}
  <div class="bc-edit-together--field">
    <label class="bc-edit-together--label" for="od-et-{uid}-{key}">{label}</label>
    <div class="bc-edit-together--chips">
      {#each listOf(key) as name (name)}
        {@const note = noteOf(key, name)}
        <span class="bc-edit-together--chip" class:bc-edit-together--chip-some={!!note}>
          {name}{#if note}<span class="bc-edit-together--chip-note">{note}</span>{/if}
          <button type="button" class="bc-edit-together--chip-x" aria-label={t('desktopDetail.removeItem', { name })} onclick={() => removeChip(key, name)}><Icon name="close" size={14} /></button>
        </span>
      {/each}
      <input id="od-et-{uid}-{key}" class="bc-edit-together--chip-input" type="text" autocomplete="off" bind:value={typed[key]} onkeydown={(e) => chipKey(e, key)} />
    </div>
    {#if proposed.length && typed[key].trim()}
      <ul class="bc-edit-together--suggestions">
        {#each proposed as name (name)}
          <li><button type="button" onmousedown={(e) => e.preventDefault()} onclick={() => addChip(key, name)}>{name}</button></li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

<Md3Dialog class="bc-edit-together" title={t('multiDive.editTitle', { n })} oncancel={onclose}>
  {#if failed}
    <p class="bc-edit-together--message">{t('multiDive.loadFailed')}</p>
  {:else if state}
    <div class="bc-edit-together--form">
      <div class="bc-edit-together--field">
        <label class="bc-edit-together--label" for="od-et-{uid}-site">{t('edit.site')}</label>
        <input
          id="od-et-{uid}-site"
          class="bc-edit-together--input"
          class:bc-edit-together--many={state.site.mixed && !siteTouched}
          type="text"
          autocomplete="off"
          list="od-et-{uid}-sites"
          placeholder={state.site.mixed && !siteTouched ? many : t('edit.noSite')}
          bind:value={siteText}
          oninput={() => (siteTouched = true)}
        />
        <datalist id="od-et-{uid}-sites">{#each sites as site (site.uuid)}<option value={site.name}></option>{/each}</datalist>
      </div>

      {@render chips('guides', t('edit.guides'))}
      {@render chips('buddies', t('edit.buddies'))}
      {@render chips('tags', t('edit.tags'))}

      <div class="bc-edit-together--field">
        <label class="bc-edit-together--label" for="od-et-{uid}-suit">{t('edit.suit')}</label>
        <input
          id="od-et-{uid}-suit"
          class="bc-edit-together--input"
          type="text"
          autocomplete="off"
          list="od-et-{uid}-suits"
          placeholder={state.suit.mixed && !suitTouched ? many : ''}
          bind:value={suit}
          oninput={() => (suitTouched = true)}
        />
        <datalist id="od-et-{uid}-suits">{#each known.suit as name (name)}<option value={name}></option>{/each}</datalist>
      </div>

      <div class="bc-edit-together--field">
        <label class="bc-edit-together--label" for="od-et-{uid}-water">{t('edit.waterType')}</label>
        <select
          id="od-et-{uid}-water"
          class="bc-edit-together--input"
          class:bc-edit-together--many={state.salinity.mixed && !waterTouched}
          value={state.salinity.mixed && !waterTouched ? '__many' : waterType}
          onchange={waterChosen}
        >
          {#each waterOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
        </select>
      </div>

      <div class="bc-edit-together--field">
        <label class="bc-edit-together--label" for="od-et-{uid}-notes">{t('edit.notes')}</label>
        <textarea
          id="od-et-{uid}-notes"
          class="bc-edit-together--input bc-edit-together--textarea"
          class:bc-edit-together--many={state.notes.mixed && !notesTouched}
          rows="4"
          placeholder={state.notes.mixed && !notesTouched ? many : ''}
          bind:value={notes}
          oninput={() => (notesTouched = true)}
        ></textarea>
      </div>
    </div>
  {/if}

  {#snippet actions()}
    <button type="button" class="button" onclick={onclose}>{t('dialog.cancel')}</button>
    <button type="button" class="button button-fill" disabled={busy || !state || !changed} onclick={apply}>{t('desktopMultiDive.apply', { n })}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .bc-edit-together--form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 4px 24px 8px;
    }
    .bc-edit-together--message {
      margin: 0;
      padding: 0 24px;
      color: var(--bc-text-2);
    }
    .bc-edit-together--label {
      display: block;
      margin-bottom: 4px;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-edit-together--input,
    .bc-edit-together--chips {
      box-sizing: border-box;
      width: 100%;
      min-height: 40px;
      padding: 0 12px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: var(--bc-surface-container);
      color: var(--bc-text);
      font: inherit;
      font-size: 15px;
    }
    .bc-edit-together--input:focus,
    .bc-edit-together--chips:focus-within {
      outline: none;
      border: 2px solid var(--bc-action);
      padding: 0 11px;
      background: var(--bc-surface);
    }
    .bc-edit-together--textarea {
      padding-block: 8px;
      resize: vertical;
    }
    /* « Plusieurs valeurs » in #4B4A47 (--bc-text-2): not one of the dives' values. */
    .bc-edit-together--many::placeholder {
      color: var(--bc-text-2);
      opacity: 1;
    }
    select.bc-edit-together--many {
      color: var(--bc-text-2);
    }
    .bc-edit-together--chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding-block: 4px;
    }
    .bc-edit-together--chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 28px;
      padding: 0 4px 0 10px;
      border-radius: 14px;
      background: var(--bc-surface);
      border: 1px solid var(--bc-separator);
      font-size: 14px;
    }
    .bc-edit-together--chip-some {
      border-style: dashed;
    }
    .bc-edit-together--chip-note {
      font-size: 12px;
      color: var(--bc-text-2);
    }
    .bc-edit-together--chip-x {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 11px;
      background: none;
      color: inherit;
      cursor: pointer;
    }
    .bc-edit-together--chip-input {
      flex: 1;
      min-width: 80px;
      height: 28px;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      font-size: 15px;
      outline: none;
    }
    .bc-edit-together--suggestions {
      margin: 4px 0 0;
      padding: 4px 0;
      list-style: none;
      border-radius: 8px;
      background: var(--bc-surface);
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
      & button {
        display: block;
        width: 100%;
        padding: 8px 12px;
        border: 0;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 14px;
        text-align: start;
        cursor: pointer;

        &:hover {
          background: color-mix(in srgb, var(--bc-text) 8%, transparent);
        }
      }
    }
  }
</style>
