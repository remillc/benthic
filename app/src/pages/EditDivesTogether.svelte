<script>
  // @ts-check
  // « Modifier ensemble… » of the Logbook's selection (task 2026-11-15-178, part 2;
  // docs/system-design.md, section 7, « Actions on several dives »): a full-screen sheet
  // « Modifier 3 plongées » on the phone, a popup on a tablet (the same route as « Modifier la
  // plongée », App.svelte). Site, Guide, Compagnons, Étiquettes, Combinaison, Type d'eau and
  // Notes. A field whose values differ shows « Plusieurs valeurs » and is left as it is on every
  // dive unless the diver changes it; the chips of Compagnons, Guide and Étiquettes are those of
  // every dive, then those of only some (« sur 2 plongées »): what is added or removed is
  // applied to each dive, nothing else is replaced. « Enregistrer » applies everything at once
  // as one undoable step (lib/multi-dive.js, lib/logbook.svelte.js).
  import { onMount } from 'svelte';
  import { navigation } from '../lib/navigation.svelte.js';
  import { Page, Navbar, Link, Popup, View, f7 } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ButtonField from '../components/ButtonField.svelte';
  import ChipsField from '../components/ChipsField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import { logbookValues } from '../lib/people.js';
  import { logbook, editDivesTogether } from '../lib/logbook.svelte.js';
  import { chooseSite } from '../lib/site-choice.js';
  import { layout, ios, navWidth } from '../lib/layout.svelte.js';
  import { multiEditChanges, multiEditState } from '../lib/multi-dive.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { WATER_TYPES, waterTypeName, waterTypeOfSalinity } from '../lib/tools.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { query: { ids?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  // As « Modifier la plongée »: a popup on a tablet, a full screen on a phone.
  const sheet = layout.rail;
  const leave = () => (sheet ? f7.popup.close() : f7router.back());
  const sheetStyle = ios
    ? '--f7-popup-tablet-width: min(780px, calc(100vw - 48px)); --f7-popup-tablet-height: min(740px, calc(100vh - 48px));'
    : `--f7-popup-tablet-width: calc(100vw - ${navWidth}px - 32px); --f7-popup-tablet-height: calc(100vh - 32px); left: calc(50% + ${navWidth / 2}px);`;

  const ids = (f7route.query.ids ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  /** @type {import('../lib/multi-dive.js').MultiEditState|null} */
  let state = $state(null);
  let failed = $state(false);
  let saving = $state(false);
  let known = $state({ guide: /** @type {string[]} */ ([]), buddy: /** @type {string[]} */ ([]), tag: /** @type {string[]} */ ([]), suit: /** @type {string[]} */ ([]) });

  // What the diver changed: a field is touched once they act on it.
  let siteTouched = $state(false);
  let siteName = $state('');
  let siteUuid = $state(0);
  let notesTouched = $state(false);
  let notes = $state('');
  let suitTouched = $state(false);
  let suit = $state('');
  let waterTouched = $state(false);
  let waterType = $state('');
  let guides = $state(/** @type {string[]} */ ([]));
  let buddies = $state(/** @type {string[]} */ ([]));
  let tags = $state(/** @type {string[]} */ ([]));

  onMount(async () => {
    try {
      const details = await Promise.all(ids.map((id) => BenthicCore.getDive({ id })));
      const s = multiEditState(details);
      siteName = s.site.value;
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
    const [guide, buddy, tag, suitList] = await Promise.all([logbookValues('guide'), logbookValues('buddy'), logbookValues('tag'), logbookValues('suit')]);
    known = { guide, buddy, tag, suit: suitList };
  });

  const n = ids.length;
  const many = $derived(t('multiDive.manyValues'));

  /** « sur 2 plongées » for the chips of only some of the dives. @param {import('../lib/multi-dive.js').MultiChip[]|undefined} chips */
  function notesOf(chips) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const c of chips ?? []) if (!c.common) out[c.name] = t('multiDive.onSome', { n: c.count });
    return out;
  }

  const waterOptions = $derived([
    ...(state?.salinity.mixed && !waterTouched ? [{ value: '__many', label: many }] : []),
    { value: '', label: t('edit.notSet') },
    ...WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) })),
  ]);

  /** @param {string} value */
  function waterChosen(value) {
    if (value === '__many') return;
    waterType = value;
    waterTouched = true;
  }

  async function save() {
    if (!state || saving) return;
    saving = true;
    /** @type {import('../lib/multi-dive.js').MultiEdits} */
    const edits = { guides, buddies, tags };
    if (siteTouched) edits.site = siteUuid;
    if (notesTouched) edits.notes = notes;
    if (suitTouched) edits.suit = suit.trim();
    if (waterTouched) edits.salinity = WATER_TYPES.find((w) => w.id === waterType)?.salinity ?? 0;
    const changes = multiEditChanges(state, edits);
    if (!Object.keys(changes).length) {
      leave();
      return;
    }
    try {
      await editDivesTogether(ids, changes, navigation.dive === null ? null : Number(navigation.dive));
      leave();
      offerUndo(t('multiDive.edited', { n }));
    } catch (e) {
      console.error('Edit dives together', e);
      saving = false;
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('multiDive.editFailed'));
    }
  }
</script>

{#snippet chrome()}
  <Navbar title={t('multiDive.editTitle', { n })}>
    {#snippet left()}
      {#if ios}
        <Link onClick={leave}>{t('dialog.cancel')}</Link>
      {:else}
        <Link iconOnly onClick={leave}><Icon name="close" /><span class="bc-sr-only">{t('dialog.cancel')}</span></Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving || !state ? 'disabled' : ''}>{t('multiDive.save')}</Link>
    {/snippet}
  </Navbar>
{/snippet}

{#snippet content()}
  {#if failed}
    <div class="block"><p>{t('multiDive.loadFailed')}</p></div>
  {:else if state}
    <div class="bc-multi-edit--content">
      <!-- Site: chosen on « Choisir un site »; « Plusieurs valeurs » until the diver chooses. -->
      <div class="bc-multi-edit--field" class:bc-multi-edit--many={state.site.mixed && !siteTouched}>
        <ButtonField
          label={t('edit.site')}
          value={state.site.mixed && !siteTouched ? many : siteName || t('edit.noSite')}
          onclick={() => chooseSite(f7router, (site) => ((siteName = site.name), (siteUuid = site.uuid), (siteTouched = true)))}
        />
        {#if siteTouched ? !!siteName : !!state.site.value && !state.site.mixed}
          <button type="button" class="bc-text-button bc-multi-edit--site-clear" onclick={() => ((siteName = ''), (siteUuid = 0), (siteTouched = true))}>{t('edit.siteClear')}</button>
        {/if}
      </div>

      <ChipsField label={t('edit.guides')} bind:values={guides} suggestions={known.guide} notes={notesOf(state.guides)} />
      <ChipsField label={t('edit.buddies')} bind:values={buddies} suggestions={known.buddy} notes={notesOf(state.buddies)} />
      <ChipsField label={t('edit.tags')} bind:values={tags} suggestions={known.tag} notes={notesOf(state.tags)} />

      <!-- Suit and notes: a mixed value is shown as « Plusieurs valeurs »; a tap makes the field editable, empty. -->
      {#if state.suit.mixed && !suitTouched}
        <div class="bc-multi-edit--field bc-multi-edit--many">
          <ButtonField label={t('edit.suit')} value={many} onclick={() => (suitTouched = true)} />
        </div>
      {:else}
        <ComboField label={t('edit.suit')} bind:value={suit} options={known.suit} />
      {/if}
      <div class="bc-multi-edit--field">
        <SelectField label={t('edit.waterType')} value={state.salinity.mixed && !waterTouched ? '__many' : waterType} options={waterOptions} onchange={waterChosen} />
      </div>
      {#if state.notes.mixed && !notesTouched}
        <div class="bc-multi-edit--field bc-multi-edit--many">
          <ButtonField label={t('edit.notes')} value={many} onclick={() => (notesTouched = true)} />
        </div>
      {:else}
        <TextField label={t('edit.notes')} bind:value={notes} multiline onchange={() => (notesTouched = true)} oninput={() => (notesTouched = true)} />
      {/if}
    </div>
  {/if}
{/snippet}

{#if sheet}
  <Popup class="bc-multi-edit bc-edit-sheet" push={false} swipeToClose={ios} style={sheetStyle}>
    <View>
      <Page class="bc-multi-edit">
        {@render chrome()}
        {@render content()}
      </Page>
    </View>
  </Popup>
{:else}
  <Page class="bc-multi-edit">
    {@render chrome()}
    {@render content()}
  </Page>
{/if}

<style>
  @layer bc.components {
    .bc-multi-edit--content {
      padding: 8px 0 32px;
    }

    .bc-multi-edit--field {
      margin-top: 0;
    }

    /* « Plusieurs valeurs » in #4B4A47 (--bc-text-2): the value is not one of the dives'. */
    .bc-multi-edit--many :global(.bc-button-field--value) {
      color: var(--bc-text-2);
    }

    .bc-multi-edit--site-clear {
      margin: 4px 16px 0;
    }
  }
</style>
