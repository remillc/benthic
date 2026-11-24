<script>
  // @ts-check
  // « Modifier ensemble… » on the desktop and the tablet (task 2026-11-15-178, part 2; fields in tabs and new fields: tasks
  // 2026-11-24-384 and 385): a dialog « Modifier 3 plongées » for the selected dives, an exception to the in-place editing of
  // the detail pane because it changes many dives at once. Four tabs as in a single dive's detail without « Carte »:
  // Informations (Site, Guide, Compagnons, Étiquettes, Type d'eau, Note, Visibilité), Équipement (Kit, Combinaison, Lest), Gaz
  // (Type de plongée) and Notes (« Ajouter aux notes »). A field whose values differ shows « Plusieurs valeurs » with the spread
  // under it and is left as it is unless the diver changes it; the chips are those of every dive, then those of only some
  // (« sur 2 plongées »); what is added or removed is applied to each dive, nothing else is replaced. « Appliquer aux 3
  // plongées » is one undoable step. The state and the rules are shared with the phone's sheet (lib/multi-edit-form.svelte.js).
  import { onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import MultiEditTabs from './MultiEditTabs.svelte';
  import DesktopSegments from './DesktopSegments.svelte';
  import DesktopStarsRow from './DesktopStarsRow.svelte';
  import Icon from './Icon.svelte';
  import { cachedSites } from '../lib/core-cache.js';
  import { siteChange } from '../lib/sites.svelte.js';
  import { siteChoice, withItem } from '../lib/desktop-edit.js';
  import { gear } from '../lib/inventory.svelte.js';
  import { MODES, MULTI_TABS, MultiEditForm } from '../lib/multi-edit-form.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { WATER_TYPES, waterTypeName } from '../lib/tools.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ ids: number[], openId?: number|null, onclose: () => void }} */
  let { ids, openId = null, onclose } = $props();

  const uid = $props.id();
  const n = ids.length;
  // svelte-ignore state_referenced_locally
  const form = new MultiEditForm(ids);
  let tab = $state('info');
  /** @type {import('benthic-core').SiteSummary[]} */
  let sites = $state([]);
  const typed = $state({ guides: '', buddies: '', tags: '' });
  const many = t('multiDive.manyValues');

  onMount(async () => {
    await form.load();
    sites = await cachedSites().catch(() => []);
  });

  const waterOptions = $derived([
    ...(form.state?.salinity.mixed && !form.waterTouched ? [{ value: '__many', label: many }] : []),
    { value: '', label: t('edit.notSet') },
    ...WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) })),
  ]);

  /** @param {Event} e */
  function waterChosen(e) {
    const value = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
    if (value === '__many') return;
    form.waterType = value;
    form.waterTouched = true;
  }

  /** The dives do not all have the same kit and the diver has not chosen one. */
  const kitMixed = $derived(!form.kitTouched && form.kitMixed);

  /** @param {Event} e */
  function kitChosen(e) {
    const select = /** @type {HTMLSelectElement} */ (e.currentTarget);
    if (!select.value || select.value === '__many') {
      select.value = kitMixed ? '__many' : form.kitId;
      return;
    }
    form.kitId = select.value;
    form.kitTouched = true;
  }

  /** @param {'guides'|'buddies'|'tags'} key */
  const listOf = (key) => (key === 'guides' ? form.guides : key === 'buddies' ? form.buddies : form.tags);
  /** @param {'guides'|'buddies'|'tags'} key @param {string[]} list */
  function setList(key, list) {
    if (key === 'guides') form.guides = list;
    else if (key === 'buddies') form.buddies = list;
    else form.tags = list;
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
    const chip = form.state?.[key].find((c) => c.name === name);
    return chip && !chip.common ? t('multiDive.onSome', { n: chip.count }) : '';
  }
  const knownOf = { guides: () => form.known.guide, buddies: () => form.known.buddy, tags: () => form.known.tag };
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
    if (!form.state || form.busy || !form.changed) return;
    form.busy = true;
    let steps = 0;
    try {
      if (form.siteTouched) {
        const choice = siteChoice(form.siteName, '', sites);
        if (choice.action === 'create') {
          const created = await siteChange({ action: 'create', value: choice.name });
          steps++;
          form.siteUuid = created.site?.uuid ?? 0;
        } else form.siteUuid = choice.action === 'existing' ? choice.uuid : 0;
      }
      const { coreStep, restoreKit } = await form.apply(openId);
      if (coreStep) steps++;
      onclose();
      if (steps) offerUndo(t('multiDive.edited', { n }), restoreKit ? async () => void (await restoreKit()) : undefined, 6000, steps);
      else if (restoreKit) showSnackbar(t('multiDive.edited', { n }), { action: t('edit.undo'), timeout: 6000, onAction: () => restoreKit() });
    } catch (e) {
      console.error('Edit dives together', e);
      form.busy = false;
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('multiDive.editFailed'));
    }
  }
</script>

{#snippet chips(/** @type {'guides'|'buddies'|'tags'} */ key, /** @type {string} */ label)}
  {@const proposed = proposals(key)}
  <div class="bc-edit-together--field">
    <label class="bc-edit-together--label" for="bc-et-{uid}-{key}">{label}</label>
    <div class="bc-edit-together--chips">
      {#each listOf(key) as name (name)}
        {@const note = noteOf(key, name)}
        <span class="bc-edit-together--chip" class:bc-edit-together--chip-some={!!note}>
          {name}{#if note}<span class="bc-edit-together--chip-note">{note}</span>{/if}
          <button type="button" class="bc-edit-together--chip-x" aria-label={t('desktopDetail.removeItem', { name })} onclick={() => removeChip(key, name)}><Icon name="close" size={14} /></button>
        </span>
      {/each}
      <input id="bc-et-{uid}-{key}" class="bc-edit-together--chip-input" type="text" autocomplete="off" bind:value={typed[key]} onkeydown={(e) => chipKey(e, key)} />
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

<Md3Dialog class="bc-edit-together" title={t('multiDive.editTitle', { n })} text={form.subtitle} oncancel={onclose}>
  {#if form.failed}
    <p class="bc-edit-together--message">{t('multiDive.loadFailed')}</p>
  {:else if form.state}
    {@const state = form.state}
    <MultiEditTabs tabs={MULTI_TABS} {tab} idBase="bc-et-{uid}" onchange={(next) => (tab = next)} />
    <div class="bc-edit-together--panel" role="tabpanel" id="bc-et-{uid}-panel-{tab}" aria-labelledby="bc-et-{uid}-tab-{tab}" data-bc-scroll>
      {#if tab === 'info'}
        <div class="bc-edit-together--form">
          <div class="bc-edit-together--field">
            <label class="bc-edit-together--label" for="bc-et-{uid}-site">{t('edit.site')}</label>
            <input
              id="bc-et-{uid}-site"
              class="bc-edit-together--input"
              class:bc-edit-together--many={state.site.mixed && !form.siteTouched}
              type="text"
              autocomplete="off"
              list="bc-et-{uid}-sites"
              placeholder={state.site.mixed && !form.siteTouched ? many : t('edit.noSite')}
              bind:value={form.siteName}
              oninput={() => (form.siteTouched = true)}
            />
            <datalist id="bc-et-{uid}-sites">{#each sites as site (site.uuid)}<option value={site.name}></option>{/each}</datalist>
            {#if state.site.mixed && !form.siteTouched}<p class="bc-edit-together--spread">{form.spreads.site}</p>{/if}
          </div>

          {@render chips('guides', t('edit.guides'))}
          {@render chips('buddies', t('edit.buddies'))}
          {@render chips('tags', t('edit.tags'))}

          <div class="bc-edit-together--field">
            <label class="bc-edit-together--label" for="bc-et-{uid}-water">{t('edit.waterType')}</label>
            <select
              id="bc-et-{uid}-water"
              class="bc-edit-together--input"
              class:bc-edit-together--many={state.salinity.mixed && !form.waterTouched}
              value={state.salinity.mixed && !form.waterTouched ? '__many' : form.waterType}
              onchange={waterChosen}
            >
              {#each waterOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
            </select>
            {#if state.salinity.mixed && !form.waterTouched}<p class="bc-edit-together--spread">{form.spreads.water}</p>{/if}
          </div>

          <DesktopStarsRow
            name="rating"
            label={t('multiDive.rating')}
            value={form.rating}
            text={state.rating.mixed && !form.ratingTouched ? many : ''}
            onsave={(v) => ((form.rating = v), (form.ratingTouched = true))}
          />
          <DesktopStarsRow
            name="visibility"
            label={t('multiDive.visibility')}
            value={form.visibility}
            text={state.visibility.mixed && !form.visibilityTouched ? many : ''}
            onsave={(v) => ((form.visibility = v), (form.visibilityTouched = true))}
          />
        </div>
      {:else if tab === 'equipment'}
        <div class="bc-edit-together--form">
          {#if form.kitAvailable}
            <div class="bc-edit-together--field">
              <label class="bc-edit-together--label" for="bc-et-{uid}-kit">{t('multiDive.kit')}<span class="bc-edit-together--plus" title={t('benthicPlus.chipName')}>B+</span></label>
              <select
                id="bc-et-{uid}-kit"
                class="bc-edit-together--input"
                class:bc-edit-together--many={kitMixed}
                value={kitMixed ? '__many' : form.kitId}
                onchange={kitChosen}
              >
                {#if kitMixed}<option value="__many">{many}</option>{:else if !form.kitId}<option value="">{t('multiDive.kitNone')}</option>{/if}
                {#each gear.kits as kit (kit.id)}<option value={kit.id}>{kit.name} · {kit.gearIds.length}</option>{/each}
              </select>
              {#if kitMixed}<p class="bc-edit-together--spread">{form.spreads.kit}</p>{/if}
              <p class="bc-edit-together--hint">{t('multiDive.kitNote')}</p>
            </div>
          {/if}

          <div class="bc-edit-together--field">
            <label class="bc-edit-together--label" for="bc-et-{uid}-suit">{t('multiDive.suit')}</label>
            <input
              id="bc-et-{uid}-suit"
              class="bc-edit-together--input"
              type="text"
              autocomplete="off"
              list="bc-et-{uid}-suits"
              placeholder={state.suit.mixed && !form.suitTouched ? many : ''}
              bind:value={form.suit}
              oninput={() => (form.suitTouched = true)}
            />
            <datalist id="bc-et-{uid}-suits">{#each form.known.suit as name (name)}<option value={name}></option>{/each}</datalist>
            {#if state.suit.mixed && !form.suitTouched}<p class="bc-edit-together--spread">{form.spreads.suit}</p>{/if}
          </div>

          <div class="bc-edit-together--field">
            <label class="bc-edit-together--label" for="bc-et-{uid}-weight">{t('multiDive.weight')}</label>
            <input
              id="bc-et-{uid}-weight"
              class="bc-edit-together--input"
              class:bc-edit-together--invalid={form.invalid}
              type="text"
              inputmode="decimal"
              autocomplete="off"
              aria-invalid={form.invalid}
              placeholder={state.weight.mixed && !form.weightTouched ? many : ''}
              bind:value={form.weightInput}
              oninput={() => (form.weightTouched = true)}
            />
            {#if state.weight.mixed && !form.weightTouched}<p class="bc-edit-together--spread">{form.spreads.weight}</p>{/if}
          </div>
        </div>
      {:else if tab === 'gas'}
        <div class="bc-edit-together--form">
          <div class="bc-edit-together--field">
            <span class="bc-edit-together--label">{t('multiDive.diveType')}</span>
            <DesktopSegments
              block
              ariaLabel={t('multiDive.diveType')}
              options={MODES.map((m) => ({ value: m, label: t(`multiDive.modes.${m}`) }))}
              value={form.mode}
              onchange={(m) => ((form.mode = m), (form.modeTouched = true))}
            />
            {#if state.mode.mixed && !form.modeTouched}
              <p class="bc-edit-together--spread">{t('multiDive.modeMany', { spread: form.spreads.mode })}</p>
            {/if}
            <p class="bc-edit-together--hint">{t('multiDive.modeNote')}</p>
          </div>
        </div>
      {:else}
        <div class="bc-edit-together--form">
          <div class="bc-edit-together--field">
            <label class="bc-edit-together--label" for="bc-et-{uid}-notes">{t('multiDive.appendNotes')}</label>
            <textarea
              id="bc-et-{uid}-notes"
              class="bc-edit-together--input bc-edit-together--textarea"
              rows="5"
              placeholder={t('multiDive.appendNotesHint')}
              bind:value={form.appendNotes}
            ></textarea>
            <p class="bc-edit-together--hint">{t('multiDive.appendNotesNote')}</p>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    {t('multiDive.footnote')}
  {/snippet}
  {#snippet actions()}
    <button type="button" class="button" onclick={onclose}>{t('dialog.cancel')}</button>
    <button type="button" class="button button-fill bc-edit-together--apply" disabled={form.busy || !form.state || !form.changed} onclick={apply}>{t('desktopMultiDive.apply', { n })}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    /* « Appliquer aux N plongées »: filled #114477 (--bc-secondary), not the ink of the other main buttons (task 2026-11-24-384). */
    :global(.bc-md3-dialog) button.bc-edit-together--apply {
      width: auto;
      height: 40px;
      padding: 0 24px;
      border-radius: 20px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      font-weight: 600;

      &:disabled {
        opacity: 0.38;
      }
    }
    .bc-edit-together--panel {
      /* One height from tab to tab: the dialog does not jump when the diver switches. */
      height: min(440px, 52vh);
      overflow-y: auto;
    }
    .bc-edit-together--form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 24px 8px;
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
    .bc-edit-together--invalid {
      border-color: var(--bc-alarm);
    }
    .bc-edit-together--spread {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-edit-together--hint {
      margin: 6px 0 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
    .bc-edit-together--plus {
      margin-left: 6px;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--bc-surface-container);
      font-size: 11px;
      font-weight: 700;
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
