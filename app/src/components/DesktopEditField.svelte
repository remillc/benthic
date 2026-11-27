<script>
  // @ts-check
  // One field of the desktop detail pane (tasks 2026-11-15-172 and 184; mock-ups
  // bureau-carnet-profil-droite and bureau-carnet-edition-sur-place):
  // - at rest an editable value sits in a grey field (40 dp, 8 dp corners), an empty one shows its
  //   invitation; a read-only value is plain text, with no field;
  // - the pointer over it adds a 1 dp outline and a pencil;
  // - a click, or Tab from the previous field, turns it into an input in place: white, 2 dp blue
  //   border, « Entrée pour garder · Échap pour annuler » under it. Entrée or leaving the field keeps
  //   the value and saves it (onsave); Échap restores it. Tab goes on to the next editable field.
  // Kinds: text, multiline (notes), list (chips: buddies, guides, tags), choice (a menu), stars,
  // site (one name chosen in the logbook's list, or a new one). What a value becomes in the core is
  // decided by lib/desktop-edit.js; this component only edits and reports the new value.
  import { floatMenu } from '../lib/float-menu.js';
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import StarsInput from './StarsInput.svelte';
  import DetailSheet from './DetailSheet.svelte';
  import { layout } from '../lib/layout.svelte.js';
  import { editKeyAction, listSuggestions, withItem, withoutItem } from '../lib/desktop-edit.js';
  import { t } from '../lib/i18n.js';

  /**
   * `onpick`: the field opens a chooser of its own instead of being edited in place (the dive's site, task 2026-11-27-412);
   * `picking` says the chooser is open, so that the focus returning to the field does not open it again.
   * `value`: the field's value (a text, a list of names, or a number of stars). `display`: what is
   * shown at rest when it is not the value itself. `known`: what the logbook already holds, for the
   * list and site fields. `newLabel`: « Ajouter « {name} » comme nouveau… ». `valid`: live check of
   * the typed text. `onsave` returns false when the change could not be saved.
   * @type {{
   *   label: string,
   *   kind: import('../lib/desktop-edit.js').FieldKind,
   *   value: string|string[]|number,
   *   invitation?: string,
   *   display?: string,
   *   readonly?: boolean,
   *   options?: { value: string, label: string }[],
   *   known?: { key: string, dives: number }[],
   *   newLabel?: string,
   *   valid?: (text: string) => boolean,
   *   unit?: string,
   *   name?: string,
   *   stacked?: boolean,
   *   boxed?: boolean,
   *   outlined?: boolean,
   *   chevron?: boolean,
   *   trailing?: import('svelte').Snippet,
   *   note?: string,
   *   disabled?: boolean,
   *   card?: boolean,
   *   noLead?: boolean,
   *   tall?: boolean,
   *   emptyText?: string,
   *   onopen?: () => void,
   *   openLabel?: string,
   *   openChoiceOnClick?: boolean,
   *   onpick?: () => void,
   *   picking?: boolean,
   *   showHint?: boolean,
   *   manage?: { label: string, onclick: () => void }|null,
   *   leading?: import('svelte').Snippet,
   *   onsave?: (value: string|string[]|number) => Promise<boolean|void>|boolean|void,
   * }}
   */
  let { label, kind, value, invitation = '', display = '', readonly = false, options = [], known = [], newLabel = '', valid = () => true, unit = '', name = '', stacked = false, boxed = false, outlined = false, chevron = false, trailing, note = '', disabled = false, card = false, noLead = false, tall = false, emptyText = '', onopen, openLabel = '', openChoiceOnClick = false, onpick, picking = false, showHint = true, manage = null, leading, onsave } = $props();

  const uid = $props.id();
  let editing = $state(false);
  let saving = $state(false);
  /** The value being edited: a text, a list, or stars. @type {string|string[]|number} */
  let draft = $state('');
  /** The text typed in the chips or site input. */
  let typed = $state('');
  /** A site-kind field filters its list only once the text was changed: opened, it lists every known value (Christian, 27 November 2026). */
  let siteTyped = $state(false);
  let hovered = $state(false);
  let highlighted = $state(-1);
  /** @type {HTMLElement|undefined} */
  let rest = $state();
  /** @type {HTMLElement|undefined} */
  let box = $state();
  /** Returning to rest by Entrée or Échap puts the focus back on the field, which must not start an edit again. */
  let quiet = false;

  const multiline = $derived(kind === 'multiline');
  const empty = $derived(Array.isArray(value) ? value.length === 0 : value === '' || value === 0);
  const text = $derived(typeof draft === 'string' ? draft : '');
  const invalid = $derived((kind === 'text' || kind === 'multiline') && editing && !valid(text));
  const suggestions = $derived(
    kind === 'list' || kind === 'site'
      ? listSuggestions(knownOnce, Array.isArray(draft) ? draft : [], typed || (kind === 'site' && typeof draft === 'string' && editing && siteTyped ? draft : ''))
      : { matches: [], addNew: null },
  );
  /** The rows of the list under the field: the known values, then « Ajouter … ». */
  const rows = $derived([...suggestions.matches.map((m) => ({ key: m.key, dives: m.dives, add: false })), ...(suggestions.addNew ? [{ key: suggestions.addNew, dives: 0, add: true }] : [])]);
  const shownText = $derived(
    display ||
      (kind === 'choice' ? (options.find((o) => o.value === value)?.label ?? '') : typeof value === 'string' ? value : ''),
  );

  // On a phone a list field (a choice, the site) opens a bottom sheet instead of an input (task 2026-11-24-386): the list with
  // the current value checked, a search when it is long, « Nouveau … » when one can be created. A choice saves at once.
  let sheetOpen = $state(false);
  /** The value of the last row of a list that opens another page (`manage`). */
  const MANAGE = ':manage';
  const sheetKind = $derived(layout.phone && (kind === 'choice' || kind === 'site'));
  /**
   * The known values once each: two sites of the logbook can share a name (the lists are keyed by it, and a site is chosen
   * by its name), so their dives add up.
   */
  const knownOnce = $derived.by(() => {
    /** @type {Map<string, { key: string, dives: number }>} */
    const byKey = new Map();
    for (const k of known) {
      const seen = byKey.get(k.key);
      if (seen) seen.dives += k.dives;
      else byKey.set(k.key, { key: k.key, dives: k.dives });
    }
    return [...byKey.values()];
  });
  const sheetOptions = $derived(
    kind === 'site'
      ? knownOnce.map((k) => ({ value: k.key, label: k.key, example: t('desktopDetail.diveCount', { n: k.dives }) })).concat(manage ? [{ value: MANAGE, label: manage.label, example: '', divider: true }] : [])
      : [{ value: '', label: invitation || t('edit.notSet') }, ...options],
  );
  /** @param {string} v */
  async function sheetPick(v) {
    if (v === MANAGE) return manage?.onclick();
    if (v === (typeof value === 'string' ? value : '')) return;
    saving = true;
    try {
      await onsave?.(v);
    } finally {
      saving = false;
    }
  }
  // The chooser of `onpick` closed: the focus goes back to the field, which must not open it again.
  let wasPicking = false;
  $effect(() => {
    if (wasPicking && !picking) {
      quiet = true;
      setTimeout(() => (quiet = false), 300);
    }
    wasPicking = picking;
  });
  function sheetClosed() {
    sheetOpen = false;
    // The focus goes back to the field: that must not open the sheet again.
    quiet = true;
    setTimeout(() => (quiet = false), 300);
  }

  /** @param {boolean} [openChoice] */
  function startEdit(openChoice = false) {
    fingerDown = false;
    if (readonly || editing || quiet || sheetOpen || (onpick && picking)) {
      quiet = false;
      return;
    }
    if (onpick) {
      onpick();
      return;
    }
    if (sheetKind) {
      sheetOpen = true;
      return;
    }
    draft = Array.isArray(value) ? [...value] : value;
    typed = '';
    siteTyped = false;
    highlighted = -1;
    editing = true;
    tick().then(() => {
      const input = box?.querySelector('input, textarea, select, button');
      input?.focus();
      // Chrome refuses showPicker without a user gesture (a finger's pointerdown is none): the select stays focused, a second tap opens it.
      if (openChoice && input instanceof HTMLSelectElement) {
        try {
          input.showPicker();
        } catch {
          // Refused: nothing to report.
        }
      }
    });
  }

  /** A finger touched a field whose menu opens on the first tap: its focus opens the menu (never a focus by Tab). */
  let fingerDown = false;

  /** @param {PointerEvent} event */
  function pointerDown(event) {
    // A mouse opens the menu on the press; a finger on its lift (the focus that follows it), the user gesture Chrome asks for.
    if (!openChoiceOnClick || kind !== 'choice' || event.button !== 0) return;
    if (event.pointerType !== 'mouse') {
      fingerDown = true;
      return;
    }
    event.preventDefault();
    startEdit(true);
  }

  function backToRest() {
    editing = false;
    quiet = true;
    tick().then(() => {
      rest?.focus();
      // The focus event of a rest field comes first; a later click still starts an edit.
      setTimeout(() => (quiet = false));
    });
  }

  function cancel() {
    editing = false;
    backToRest();
  }

  /** Keeps the value (and saves it when it changed). @param {boolean} [refocus] */
  async function keep(refocus = false) {
    if (!editing || saving) return;
    let next = draft;
    if ((kind === 'list' || kind === 'site') && typed.trim()) next = kind === 'list' ? withItem(/** @type {string[]} */ (draft), typed) : typed.trim();
    if (invalid) {
      editing = false;
      return;
    }
    editing = false;
    if (refocus) backToRest();
    const changed = Array.isArray(next) ? JSON.stringify(next) !== JSON.stringify(value) : next !== value;
    if (!changed) return;
    saving = true;
    try {
      await onsave?.(next);
    } finally {
      saving = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    const action = editKeyAction(e, { multiline });
    // The star buttons are not text fields: the Carnet's Suppr and Entrée shortcuts must not reach the dive.
    if (kind === 'stars' && (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter')) e.stopPropagation();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if ((kind === 'list' || kind === 'site') && rows.length) {
        e.preventDefault();
        const next = highlighted + (e.key === 'ArrowDown' ? 1 : -1);
        highlighted = next >= rows.length ? -1 : next < -1 ? rows.length - 1 : next;
      }
      return;
    }
    if (action === 'cancel') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (action === 'commit') {
      e.preventDefault();
      if ((kind === 'list' || kind === 'site') && highlighted >= 0 && rows[highlighted]) pick(rows[highlighted].key);
      else if (kind === 'list' && typed.trim()) {
        draft = withItem(/** @type {string[]} */ (draft), typed);
        typed = '';
      } else keep(true);
    } else if (e.key === 'Backspace' && kind === 'list' && !typed && Array.isArray(draft) && draft.length) {
      draft = draft.slice(0, -1);
    }
  }

  /** A row of the list under the field is chosen. @param {string} key */
  function pick(key) {
    if (kind === 'list') {
      draft = withItem(/** @type {string[]} */ (draft), key);
      typed = '';
      highlighted = -1;
      box?.querySelector('input')?.focus();
    } else {
      draft = key;
      typed = '';
      keep(true);
    }
  }

  /** The focus left the field: the value is kept, unless it moved inside it. @param {FocusEvent} e */
  function focusout(e) {
    if (!editing) return;
    if (e.relatedTarget && box?.contains(/** @type {Node} */ (e.relatedTarget))) return;
    keep(false);
  }

  /** @param {string} v */
  function chooseOption(v) {
    draft = v;
    keep(true);
  }

  /** @param {number} stars */
  function chooseStars(stars) {
    draft = stars;
    keep(true);
  }

  /** @param {Event} e */
  function grow(e) {
    const el = /** @type {HTMLTextAreaElement} */ (e.currentTarget);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  /** What a screen reader says for the field at rest: its label, then its value or its invitation. */
  const restText = $derived(empty && !display ? invitation : Array.isArray(value) ? value.join(', ') : typeof value === 'number' ? t('desktopDetail.starsLabel', { label, n: value }) : shownText);
  const hint = $derived(t(multiline ? 'desktopDetail.hintNotes' : 'desktopDetail.hint'));
</script>

<div class="bc-desktop-edit-field" class:bc-desktop-edit-field--multiline={multiline} class:bc-desktop-edit-field--stacked={stacked} class:bc-desktop-edit-field--card-root={card} class:bc-desktop-edit-field--tall={tall} data-field={name || undefined}>
  <span class="bc-desktop-edit-field--label" class:bc-sr-only={card} id="bc-df-{uid}">{label}</span>

  {#if readonly}
    <span class="bc-desktop-edit-field--value bc-value" class:bc-desktop-edit-field--boxed={boxed} class:bc-desktop-edit-field--outlined={outlined} aria-labelledby="bc-df-{uid}">{#if leading}{@render leading()}{/if}<span class="bc-desktop-edit-field--value-text">{shownText || (Array.isArray(value) ? value.join(', ') : '')}</span>{#if trailing}{@render trailing()}{/if}</span>
  {:else if disabled}
    <!-- Not wired to any storage yet: grey and dimmed, nothing to edit. -->
    <div class="bc-desktop-edit-field--rest bc-desktop-edit-field--disabled" role="group" aria-disabled="true" aria-label="{label}, {restText}" title={invitation}>
      <span class="bc-desktop-edit-field--content bc-value">{shownText || (empty ? invitation : '')}</span>
    </div>
  {:else if !editing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bc-desktop-edit-field--rest"
      class:bc-desktop-edit-field--empty={empty && !display}
      class:bc-desktop-edit-field--hover={hovered}
      class:bc-desktop-edit-field--card={card}
      role="button"
      tabindex="0"
      aria-label="{label}, {restText}"
      bind:this={rest}
      onfocus={() => startEdit(fingerDown)}
      onclick={() => startEdit(fingerDown)}
      onpointerdown={pointerDown}
      onmouseenter={() => (hovered = true)}
      onmouseleave={() => (hovered = false)}
    >
      {#if card && !noLead}<span class="bc-desktop-edit-field--lead" aria-hidden="true"><Icon name="place" size={20} /></span>{/if}
      <span class="bc-desktop-edit-field--content bc-value">
        {#if card}
          <span class="bc-desktop-edit-field--main">{shownText || invitation}</span>
          {#if note}<span class="bc-desktop-edit-field--note-line">{note}</span>{/if}
        {:else if kind === 'stars'}
          <span class="bc-desktop-edit-field--stars" role="radiogroup" aria-label={label}>
            {#each [1, 2, 3, 4, 5] as star (star)}
              <button type="button" role="radio" aria-checked={value === star} aria-label={String(star)} tabindex="-1" class="bc-desktop-edit-field--star" onclick={(e) => { e.stopPropagation(); onsave?.(value === star ? 0 : star); }}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8-4.2-4.1 5.8-.8z" class:bc-desktop-edit-field--star-on={star <= Number(value)} /></svg>
              </button>
            {/each}
          </span>
          {#if !Number(value) && emptyText}<span class="bc-desktop-edit-field--note">{emptyText}</span>{/if}
        {:else if kind === 'list' && Array.isArray(value) && value.length}
          {#each value as item, i (i)}<span class="bc-desktop-edit-field--chip">{item}</span>{/each}
        {:else if empty && !display}
          {invitation}
        {:else}
          {shownText}{#if unit && shownText}&nbsp;{unit}{/if}
        {/if}
      </span>
      {#if note && !card && kind !== 'stars'}<span class="bc-desktop-edit-field--note">{note}</span>{/if}
      {#if onopen}<button type="button" class="bc-desktop-edit-field--open" aria-label={openLabel} title={openLabel} onfocus={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); onopen(); }}><Icon name="chevron" size={22} /></button>{:else if chevron}<span class="bc-desktop-edit-field--chevron" aria-hidden="true"><Icon name="chevron" size={22} /></span>{:else if tall}<span class="bc-desktop-edit-field--chevron" aria-hidden="true"><Icon name="expand" size={24} /></span>{:else}<span class="bc-desktop-edit-field--pencil" aria-hidden="true"><Icon name="edit" size={18} /></span>{/if}
    </div>
  {:else}
    <div class="bc-desktop-edit-field--edit-wrap">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="bc-desktop-edit-field--editing" class:bc-desktop-edit-field--invalid={invalid} bind:this={box} onfocusout={focusout} onkeydown={keydown}>
        {#if kind === 'list'}
          {#each Array.isArray(draft) ? draft : [] as item, i (i)}
            <span class="bc-desktop-edit-field--chip bc-desktop-edit-field--chip-edit">{item}<button type="button" class="bc-desktop-edit-field--chip-x" aria-label={t('desktopDetail.removeItem', { name: item })} onmousedown={(e) => e.preventDefault()} onclick={() => (draft = withoutItem(/** @type {string[]} */ (draft), i))}><Icon name="close" size={14} /></button></span>
          {/each}
          <input class="bc-desktop-edit-field--input" type="text" aria-labelledby="bc-df-{uid}" bind:value={typed} oninput={() => (highlighted = -1)} />
        {:else if kind === 'site'}
          <input class="bc-desktop-edit-field--input" type="text" aria-labelledby="bc-df-{uid}" bind:value={draft} oninput={() => ((highlighted = -1), (siteTyped = true))} />
        {:else if kind === 'choice'}
          <select class="bc-desktop-edit-field--input" aria-labelledby="bc-df-{uid}" value={draft} onchange={(e) => chooseOption(/** @type {HTMLSelectElement} */ (e.currentTarget).value)}>
            <option value="">{invitation}</option>
            {#each options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
          </select>
        {:else if kind === 'stars'}
          <StarsInput value={Number(draft)} label={label} onchange={chooseStars} />
        {:else if multiline}
          <textarea class="bc-desktop-edit-field--input bc-desktop-edit-field--textarea" aria-labelledby="bc-df-{uid}" rows="4" bind:value={draft} oninput={grow}></textarea>
        {:else}
          <input class="bc-desktop-edit-field--input" type="text" aria-labelledby="bc-df-{uid}" aria-invalid={invalid} bind:value={draft} />
          {#if unit}<span class="bc-desktop-edit-field--unit">{unit}</span>{/if}
        {/if}
      </div>
      {#if invalid || (showHint && kind !== 'choice' && kind !== 'stars')}<p class="bc-desktop-edit-field--hint" class:bc-desktop-edit-field--hint-invalid={invalid}>{invalid ? t('desktopDetail.invalid') : hint}</p>{/if}
      {#if (kind === 'list' || kind === 'site') && (rows.length || manage)}
        <ul class="bc-desktop-edit-field--suggestions" role="listbox" aria-label={label} use:floatMenu>
          {#each rows as row, i (row.add ? `add-${row.key}` : row.key)}
            <li role="option" aria-selected={highlighted === i}>
              <button type="button" class="bc-desktop-edit-field--suggestion" class:bc-desktop-edit-field--suggestion-on={highlighted === i} onmousedown={(e) => e.preventDefault()} onclick={() => pick(row.key)}>
                {#if row.add}
                  {newLabel.replace('{name}', row.key)}
                {:else}
                  <span>{row.key}</span><span class="bc-desktop-edit-field--dives">{t('desktopDetail.diveCount', { n: row.dives })}</span>
                {/if}
              </button>
            </li>
          {/each}
          {#if manage}
            <li role="option" aria-selected="false">
              <button type="button" class="bc-desktop-edit-field--suggestion bc-desktop-edit-field--manage" onmousedown={(e) => e.preventDefault()} onclick={() => manage.onclick()}>{manage.label}</button>
            </li>
          {/if}
        </ul>
      {/if}
    </div>
  {/if}
</div>

{#if sheetOpen}
  <DetailSheet title={label} options={sheetOptions} value={typeof value === 'string' ? value : ''} search={kind === 'site' && knownOnce.length > 6} newLabel={kind === 'site' ? newLabel : ''} onselect={sheetPick} onclose={sheetClosed} />
{/if}

<style>
  @layer bc.components {
    .bc-desktop-edit-field {
      position: relative;
      display: grid;
      grid-template-columns: 140px minmax(0, 1fr);
      align-items: start;
      column-gap: 12px;
      margin-bottom: 8px;
    }

    /* The label above the field (Informations tab). */
    .bc-desktop-edit-field--stacked {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 4px;
      margin-bottom: 0;
      & .bc-desktop-edit-field--label {
        min-height: 0;
        font-size: 13px;
      }
    }

    .bc-desktop-edit-field--note,
    .bc-desktop-edit-field--note-line {
      font-size: 13px;
      color: var(--bc-text-2);
      white-space: nowrap;
    }

    .bc-desktop-edit-field--note-line {
      white-space: normal;
    }

    /* 56 px (the rest rule below sets 40, so this one is the more specific). */
    .bc-desktop-edit-field--rest.bc-desktop-edit-field--card {
      min-height: 56px;
      gap: 12px;
      padding: 0 8px 0 10px;
      border-radius: 12px;
    }

    /* The card has no visible label (bc-sr-only): its name is read out. */
    .bc-desktop-edit-field--card-root {
      grid-template-columns: minmax(0, 1fr);
    }

    .bc-desktop-edit-field--disabled {
      opacity: 0.55;
      cursor: default;
    }

    /* The site card: a pin in a blue circle, the name, its country and dives, a chevron. */
    .bc-desktop-edit-field--lead {
      flex: none;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--bc-secondary-container);
      color: var(--bc-on-secondary-container);
    }

    .bc-desktop-edit-field--card .bc-desktop-edit-field--content {
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
    }

    .bc-desktop-edit-field--main {
      display: block;
      font-weight: 500;
    }

    .bc-desktop-edit-field--open {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }

    /* A 48 px field with a chevron at its end (the Équipement cards, task 2026-11-23-366). */
    /* A read-only value drawn in the grey field box (Carte tab's Coordonnées on a phone or tablet): nothing opens on a tap. */
    .bc-desktop-edit-field--value.bc-desktop-edit-field--boxed {
      box-sizing: border-box;
      min-height: 48px;
      display: flex;
      align-items: center;
      padding: 0 12px;
      border-radius: 10px;
      background: var(--bc-field-rest);
      color: var(--bc-text);
      font-size: 15px;
      & .bc-desktop-edit-field--value-text {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    /* A computed value (CNS, OTU, task 2026-11-27-422): the box's size, a thin outline, no fill. */
    .bc-desktop-edit-field--value.bc-desktop-edit-field--boxed.bc-desktop-edit-field--outlined {
      background: none;
      box-shadow: inset 0 0 0 1px var(--bc-chip-outline);
    }

    .bc-desktop-edit-field--tall {
      & .bc-desktop-edit-field--rest,
      & .bc-desktop-edit-field--editing {
        min-height: 48px;
      }
    }

    .bc-desktop-edit-field--chevron {
      flex: none;
      display: grid;
      color: var(--bc-text-2);
    }

    .bc-desktop-edit-field--stars {
      display: inline-flex;
      gap: 2px;
    }

    .bc-desktop-edit-field--star {
      width: auto;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
      & path {
        fill: none;
        stroke: var(--bc-text);
        stroke-width: 1.6;
        stroke-linejoin: round;

        &.bc-desktop-edit-field--star-on {
          fill: var(--bc-text);
        }
      }
    }

    .bc-desktop-edit-field--label {
      min-height: 40px;
      display: flex;
      align-items: center;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    /* A read-only value: plain text, no field. */
    .bc-desktop-edit-field--value {
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      font-size: 15px;
      color: var(--bc-text);
      overflow-wrap: anywhere;
    }

    .bc-desktop-edit-field--rest {
      box-sizing: border-box;
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border-radius: 8px;
      background: var(--bc-field-rest);
      color: var(--bc-text);
      font-size: 15px;
      cursor: text;
      outline: 0;
    }

    .bc-desktop-edit-field--multiline .bc-desktop-edit-field--rest {
      align-items: flex-start;
      padding-block: 10px;
      min-height: 72px;
      white-space: pre-wrap;
    }

    .bc-desktop-edit-field--content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      overflow-wrap: anywhere;
    }

    .bc-desktop-edit-field--multiline .bc-desktop-edit-field--content {
      display: block;
    }

    /* The invitation of an empty field. */
    .bc-desktop-edit-field--empty .bc-desktop-edit-field--content {
      color: var(--bc-text-2);
    }

    /* The pencil is for the pointer over the field. */
    .bc-desktop-edit-field--pencil {
      display: none;
      color: var(--bc-text-2);
    }

    .bc-desktop-edit-field--rest:hover,
    .bc-desktop-edit-field--rest:focus-visible {
      box-shadow: inset 0 0 0 1px var(--bc-field-hover);
    }

    .bc-desktop-edit-field--rest:hover .bc-desktop-edit-field--pencil {
      display: block;
    }

    .bc-desktop-edit-field--chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 28px;
      padding: 0 10px;
      border-radius: 8px;
      background: var(--bc-secondary-container);
      color: var(--bc-on-table-selected);
      font-size: 14px;
    }

    .bc-desktop-edit-field--chip-edit {
      padding-inline-end: 4px;
    }

    .bc-desktop-edit-field--chip-x {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, currentColor 14%, transparent);
      }
    }

    .bc-desktop-edit-field--edit-wrap {
      position: relative;
      min-width: 0;
    }

    .bc-desktop-edit-field--editing {
      box-sizing: border-box;
      min-height: 40px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 8px;
      background: var(--bc-surface);
      box-shadow: inset 0 0 0 2px var(--bc-secondary);
      font-size: 15px;
      color: var(--bc-text);
    }

    .bc-desktop-edit-field--invalid {
      box-shadow: inset 0 0 0 2px var(--bc-alarm);
    }

    .bc-desktop-edit-field--input {
      flex: 1;
      min-width: 80px;
      height: 32px;
      padding: 0 2px;
      border: 0;
      outline: 0;
      background: none;
      color: inherit;
      font: inherit;
    }

    .bc-desktop-edit-field--textarea {
      height: auto;
      padding: 6px 2px;
      resize: vertical;
      line-height: 1.4;
    }

    .bc-desktop-edit-field--unit {
      color: var(--bc-text-2);
      font-size: 14px;
    }

    .bc-desktop-edit-field--hint {
      margin: 3px 0 0 2px;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }

    .bc-desktop-edit-field--hint-invalid {
      color: var(--bc-alarm);
    }

    .bc-desktop-edit-field--suggestions {
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

    .bc-desktop-edit-field--manage {
      color: var(--bc-action);
      font-weight: 500;
    }

    .bc-desktop-edit-field--suggestion {
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

    .bc-desktop-edit-field--suggestion:hover,
    .bc-desktop-edit-field--suggestion-on {
      background: var(--bc-field-rest);
    }

    .bc-desktop-edit-field--dives {
      font-size: 12px;
      color: var(--bc-text-2);
    }
  }
</style>
