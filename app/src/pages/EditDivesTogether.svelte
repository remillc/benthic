<script>
  // @ts-check
  // « Modifier ensemble… » of the Logbook's selection (task 2026-11-15-178, part 2; tabs and new fields: tasks
  // 2026-11-24-384 and 385; docs/system-design.md, section 7, « Actions on several dives »): a full-screen sheet
  // « Modifier 3 plongées » on the phone, a popup on a tablet (the same route as « Modifier la plongée », App.svelte). Four tabs
  // as in a single dive's detail without « Carte » (Material 3 primary tabs, a segmented control on the iPhone): Informations
  // (Site, Guide, Compagnons, Étiquettes, Type d'eau, Note, Visibilité), Équipement (Kit, Combinaison, Lest), Gaz (Type de
  // plongée) and Notes (« Ajouter aux notes »). A field whose values differ shows « Plusieurs valeurs » with the spread under it
  // and is left as it is on every dive unless the diver changes it; the chips of Compagnons, Guide and Étiquettes are those of
  // every dive, then those of only some (« sur 2 plongées »): what is added or removed is applied to each dive, nothing else is
  // replaced. « Enregistrer » applies everything at once as one undoable step (lib/multi-edit-form.svelte.js, lib/multi-dive.js).
  import { onMount } from 'svelte';
  import { navigation } from '../lib/navigation.svelte.js';
  import { Page, Navbar, Link, Popup, View, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ButtonField from '../components/ButtonField.svelte';
  import ChipsField from '../components/ChipsField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import StarsInput from '../components/StarsInput.svelte';
  import MultiEditTabs from '../components/MultiEditTabs.svelte';
  import DesktopSegments from '../components/DesktopSegments.svelte';
  import { gear } from '../lib/inventory.svelte.js';
  import { chooseSite } from '../lib/site-choice.js';
  import { layout, ios, navWidth } from '../lib/layout.svelte.js';
  import { MODES, MULTI_TABS, MultiEditForm } from '../lib/multi-edit-form.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { WATER_TYPES, waterTypeName } from '../lib/tools.js';
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

  const form = new MultiEditForm(ids);
  const n = ids.length;
  const many = t('multiDive.manyValues');
  const uid = Math.random().toString(36).slice(2, 9);
  let tab = $state('info');

  onMount(() => {
    form.load();
  });

  const waterOptions = $derived([
    ...(form.state?.salinity.mixed && !form.waterTouched ? [{ value: '__many', label: many }] : []),
    { value: '', label: t('edit.notSet') },
    ...WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) })),
  ]);

  /** @param {string} value */
  function waterChosen(value) {
    if (value === '__many') return;
    form.waterType = value;
    form.waterTouched = true;
  }

  const kitMixed = $derived(!form.kitTouched && form.kitMixed);
  const kitOptions = $derived([
    ...(kitMixed ? [{ value: '__many', label: many }] : [{ value: '', label: t('multiDive.kitNone') }]),
    ...gear.kits.map((kit) => ({ value: kit.id, label: `${kit.name} · ${kit.gearIds.length}` })),
  ]);

  /** @param {string} value */
  function kitChosen(value) {
    if (!value || value === '__many') return;
    form.kitId = value;
    form.kitTouched = true;
  }

  const modeOptions = MODES.map((m) => ({ value: m, label: t(`multiDive.modesShort.${m}`) }));

  async function save() {
    if (!form.state || form.busy || form.invalid) return;
    if (!form.changed) {
      leave();
      return;
    }
    form.busy = true;
    try {
      const { coreStep, restoreKit } = await form.apply(navigation.dive === null ? null : Number(navigation.dive));
      leave();
      if (coreStep) offerUndo(t('multiDive.edited', { n }), restoreKit ? async () => void (await restoreKit()) : undefined);
      else if (restoreKit) showSnackbar(t('multiDive.edited', { n }), { action: t('edit.undo'), timeout: 6000, onAction: () => restoreKit() });
    } catch (e) {
      console.error('Edit dives together', e);
      form.busy = false;
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('multiDive.editFailed'));
    }
  }
</script>

{#snippet chrome()}
  <Navbar title={t('multiDive.editTitle', { n })} subtitle={form.subtitle}>
    {#snippet left()}
      {#if ios}
        <Link onClick={leave}>{t('dialog.cancel')}</Link>
      {:else}
        <Link iconOnly onClick={leave}><Icon name="close" /><span class="bc-sr-only">{t('dialog.cancel')}</span></Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={form.busy || !form.state || form.invalid ? 'disabled' : ''}>{t('multiDive.save')}</Link>
    {/snippet}
  </Navbar>
{/snippet}

{#snippet content()}
  {#if form.failed}
    <div class="block"><p>{t('multiDive.loadFailed')}</p></div>
  {:else if form.state}
    {@const state = form.state}
    <div class="bc-multi-edit--tabs">
      <MultiEditTabs tabs={MULTI_TABS} {tab} idBase="bc-me-{uid}" onchange={(next) => (tab = next)} />
    </div>
    <div class="bc-multi-edit--content" role="tabpanel" id="bc-me-{uid}-panel-{tab}" aria-labelledby="bc-me-{uid}-tab-{tab}">
      {#if tab === 'info'}
        <!-- Site: chosen on « Choisir un site »; « Plusieurs valeurs » until the diver chooses. -->
        <div class="bc-multi-edit--field" class:bc-multi-edit--many={state.site.mixed && !form.siteTouched}>
          <ButtonField
            label={t('edit.site')}
            value={state.site.mixed && !form.siteTouched ? many : form.siteName || t('edit.noSite')}
            supporting={state.site.mixed && !form.siteTouched ? form.spreads.site : ''}
            onclick={() => chooseSite(f7router, (site) => ((form.siteName = site.name), (form.siteUuid = site.uuid), (form.siteTouched = true)))}
          />
          {#if form.siteTouched ? !!form.siteName : !!state.site.value && !state.site.mixed}
            <button type="button" class="bc-text-button bc-multi-edit--site-clear" onclick={() => ((form.siteName = ''), (form.siteUuid = 0), (form.siteTouched = true))}>{t('edit.siteClear')}</button>
          {/if}
        </div>

        <ChipsField label={t('edit.guides')} bind:values={form.guides} suggestions={form.known.guide} notes={form.chipNotes('guides')} />
        <ChipsField label={t('edit.buddies')} bind:values={form.buddies} suggestions={form.known.buddy} notes={form.chipNotes('buddies')} />
        <ChipsField label={t('edit.tags')} bind:values={form.tags} suggestions={form.known.tag} notes={form.chipNotes('tags')} />

        <div class="bc-multi-edit--field">
          <SelectField
            label={t('edit.waterType')}
            value={state.salinity.mixed && !form.waterTouched ? '__many' : form.waterType}
            options={waterOptions}
            onchange={waterChosen}
            supporting={state.salinity.mixed && !form.waterTouched ? form.spreads.water : ''}
          />
        </div>

        <div class="bc-multi-edit--stars" data-field="rating">
          <span class="bc-multi-edit--stars-label">{t('multiDive.rating')}</span>
          <StarsInput value={form.rating} label={t('multiDive.rating')} onchange={(v) => ((form.rating = v), (form.ratingTouched = true))} />
          {#if state.rating.mixed && !form.ratingTouched}<span class="bc-multi-edit--stars-many">{many}</span>{/if}
        </div>
        <div class="bc-multi-edit--stars" data-field="visibility">
          <span class="bc-multi-edit--stars-label">{t('multiDive.visibility')}</span>
          <StarsInput value={form.visibility} label={t('multiDive.visibility')} onchange={(v) => ((form.visibility = v), (form.visibilityTouched = true))} />
          {#if state.visibility.mixed && !form.visibilityTouched}<span class="bc-multi-edit--stars-many">{many}</span>{/if}
        </div>
      {:else if tab === 'equipment'}
        {#if form.kitAvailable}
          <div class="bc-multi-edit--field" class:bc-multi-edit--many={kitMixed}>
            <SelectField
              label={`${t('multiDive.kit')} · ${t('benthicPlus.chip')}`}
              value={kitMixed ? '__many' : form.kitId}
              options={kitOptions}
              onchange={kitChosen}
              supporting={kitMixed ? form.spreads.kit : t('multiDive.kitNote')}
            />
          </div>
        {/if}
        <!-- Suit and weights: a mixed value is shown as « Plusieurs valeurs »; a tap makes the field editable, empty. -->
        {#if state.suit.mixed && !form.suitTouched}
          <div class="bc-multi-edit--field bc-multi-edit--many">
            <ButtonField label={t('multiDive.suit')} value={many} supporting={form.spreads.suit} onclick={() => (form.suitTouched = true)} />
          </div>
        {:else}
          <ComboField label={t('multiDive.suit')} bind:value={form.suit} options={form.known.suit} />
        {/if}
        {#if state.weight.mixed && !form.weightTouched}
          <div class="bc-multi-edit--field bc-multi-edit--many">
            <ButtonField label={t('multiDive.weight')} value={many} supporting={form.spreads.weight} onclick={() => (form.weightTouched = true)} />
          </div>
        {:else}
          <TextField label={t('multiDive.weight')} bind:value={form.weightInput} inputmode="decimal" invalid={form.invalid} oninput={() => (form.weightTouched = true)} />
        {/if}
      {:else if tab === 'gas'}
        <div class="bc-multi-edit--mode">
          <span class="bc-multi-edit--stars-label">{t('multiDive.diveType')}</span>
          <DesktopSegments block ariaLabel={t('multiDive.diveType')} options={modeOptions} value={form.mode} onchange={(m) => ((form.mode = m), (form.modeTouched = true))} />
          {#if state.mode.mixed && !form.modeTouched}
            <p class="bc-multi-edit--note">{t('multiDive.modeMany', { spread: form.spreads.mode })}</p>
          {/if}
          <p class="bc-multi-edit--note">{t('multiDive.modeNote')}</p>
        </div>
      {:else}
        <TextField label={t('multiDive.appendNotes')} bind:value={form.appendNotes} multiline supporting={t('multiDive.appendNotesHint')} />
        <p class="bc-multi-edit--note bc-multi-edit--note-inset">{t('multiDive.appendNotesNote')}</p>
      {/if}
      <p class="bc-multi-edit--note bc-multi-edit--note-inset bc-multi-edit--footnote">{t('multiDive.footnotePhone', { done: t('multiDive.edited', { n }) })}</p>
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
    /* The tabs stay under the navigation bar while the fields scroll. */
    .bc-multi-edit--tabs {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--bc-surface);
    }

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

    .bc-multi-edit--stars,
    .bc-multi-edit--mode {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      margin: 8px 16px;
    }

    .bc-multi-edit--mode {
      display: block;
    }

    .bc-multi-edit--stars-label {
      min-width: 96px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-multi-edit--stars-many {
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-multi-edit--note {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-multi-edit--note-inset {
      margin: 12px 16px 0;
    }

    .bc-multi-edit--footnote {
      margin-top: 24px;
    }
  }
</style>
