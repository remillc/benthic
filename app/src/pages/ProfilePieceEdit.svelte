<script>
  // @ts-check
  // « Nouvelle pièce » and « Modifier la pièce » (tasks 2026-11-17-267, 2026-11-18-273 and 2026-11-19-309,
  // docs/mockups/profil-piece-nouvelle-*-android.dc.html): « Type de pièce » as a grid of 16 tiles with the inventory's
  // icons (the chosen one blue with a check), then only the fields of the chosen type (lib/gear-fields.js,
  // docs/equipment-fields.md), « Date d'achat » and « Notes », and the card « Rappels d'entretien » with the reminders
  // suggested for the type. The type is the only required field. The fields are checked as the diver types. A
  // computer's serial number and firmware are read at each download, so they are not typed. The name of a piece is its
  // brand and model (else its type); a cylinder, a weight belt and « Autre » have a name of their own.
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import GearIcon from '../components/GearIcon.svelte';
  import TextField from '../components/TextField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import DateField from '../components/DateField.svelte';
  import ButtonGroup from '../components/ButtonGroup.svelte';
  import SwitchField from '../components/SwitchField.svelte';
  import DcTile from '../components/DcTile.svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { getCatalog } from '../lib/dc-images.js';
  import { brandModels } from '../lib/dc-model.js';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import RetirePieceDialog from '../components/RetirePieceDialog.svelte';
  import MaintenanceRuleSheet from '../components/MaintenanceRuleSheet.svelte';
  import { gear, loadInventory, change, readPhoto } from '../lib/inventory.svelte.js';
  import { GEAR_TYPES, gearProblems } from '../lib/inventory.js';
  import { SPECS, detailFields, isNamedByHand, derivedName, detailProblems, detailsToKeep, parseStampText, stampText } from '../lib/gear-fields.js';
  import { cylinderChoices } from '../lib/cylinder-choices.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { suggestionsFor, ownLeadDays } from '../lib/maintenance.js';
  import { settings } from '../lib/settings.svelte.js';
  import { ruleText, taskLabel } from '../lib/maintenance-text.js';
  import { afterReminderSaved } from '../lib/maintenance-notify.js';
  import { photoToDataUrl } from '../lib/photo.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';
  import { ios } from '../lib/layout.svelte.js';

  /** The colour of a type's icon square on a wide screen, the inventory's: blue, green, beige, purple, else grey. @type {Record<string, string>} */
  const TONES = { computer: 'blue', bcd: 'blue', regulator: 'green', suit: 'beige', undersuit: 'beige', cylinder: 'violet', mask: 'green', fins: 'green', scooter: 'blue', camera: 'blue', dsmb: 'beige', floatBuoy: 'beige', knife: 'violet' };

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  const id = f7route.params.id ?? '';
  let type = $state('regulator');
  let name = $state('');
  let brand = $state('');
  let model = $state('');
  let serial = $state('');
  let purchasedOn = $state('');
  let note = $state('');
  /** The fields of the type besides these (lib/gear-fields.js), as text; a switch is 'yes' or ''. @type {Record<string, string>} */
  let details = $state({});
  /** What is typed for the date stamped on a cylinder, « 03/22 ». */
  let stampTyped = $state('');
  /** The cylinder types of Réglages › Équipement, as the menu shows them. @type {{ value: string, label: string }[]} */
  let cylinderOptions = $state([]);
  let saving = $state(false);
  let confirmRetire = $state(false);
  /** The photo: a data URL to show, and the id of the file already kept (when editing). */
  let photoUrl = $state('');
  let photoId = $state('');
  let photoChanged = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();
  let ruleOpen = $state(false);
  /** The reminder set in the card (a new piece only), saved with the piece. @type {{ task: import('../lib/maintenance.js').Task, months: number|null, dives: number|null, notifyDays: 14|30|60, warnInDive: boolean }|null} */
  let reminder = $state(null);

  /** Brands and models for a dive computer (libdivecomputer's names; any other text can be typed). */
  let lists = $state(brandModels([], []));
  onMount(async () => {
    Promise.all([OpenDivesCore.bluetoothModels().catch(() => []), getCatalog().catch(() => [])]).then(([bluetooth, catalog]) => (lists = brandModels(bluetooth, catalog)));
    cylinderChoices(logbook.prefs, false)
      .then((choices) => (cylinderOptions = choices.map((c) => ({ value: c.value, label: [c.label, c.example].filter(Boolean).join(' · ') }))))
      .catch(() => {});
    await loadInventory();
    const g = gear.pieces.find((x) => x.id === id);
    if (g) {
      details = { ...(g.details ?? {}) };
      stampTyped = stampText(details.lastHydro ?? '');
      type = g.type;
      name = g.name;
      brand = g.brand ?? '';
      model = g.model ?? '';
      serial = g.serial ?? '';
      purchasedOn = g.purchasedOn ?? '';
      note = g.note ?? '';
      if (g.photoId) {
        photoId = g.photoId;
        photoUrl = await readPhoto(g.photoId);
      }
    }
  });

  const piece = $derived(gear.pieces.find((x) => x.id === id));
  const computer = $derived(type === 'computer');
  const spec = $derived(SPECS[/** @type {import('../lib/inventory.js').GearType} */ (type)] ?? SPECS.other);
  const fields = $derived(detailFields(/** @type {any} */ (type)));
  /** The name field is shown for the types the diver names (cylinder, weight belt, « Autre »); the others are named from brand and model. */
  const namedByHand = $derived(isNamedByHand(/** @type {any} */ (type)));
  /** The menu of the types on a phone, in the order of the grid. */
  const typeOptions = GEAR_TYPES.map((value) => ({ value, label: t(`gear.pieceNew.tile.${value}`) }));
  /** The computer's catalog name from what is typed, for its photo. */
  const catalogModel = $derived([brand, model].map((s) => s.trim()).filter(Boolean).join(' '));
  const typeLabel = $derived(t(`gear.pieceNew.tile.${type}`));
  /** The type is the only required field: a piece with nothing typed is named by its type. */
  const effectiveName = $derived(
    namedByHand ? name.trim() || (type === 'other' ? (details.typeName ?? '').trim() : '') || typeLabel : derivedName({ brand, model }, (piece && piece.type === type && piece.name) || typeLabel),
  );
  const problems = $derived(gearProblems({ name: effectiveName, purchasedOn }));
  const detailWrong = $derived(detailProblems(/** @type {any} */ (type), details, { stampText: stampTyped }));
  /** The message of a wrong field, shown once the diver has paused or left it (lib/live-validation.svelte.js). */
  const detailLive = {
    lastInspection: liveError(() => details.lastInspection ?? '', () => (detailWrong.lastInspection ? t('gear.pieceEdit.dateInvalid') : '')),
    lastHydro: liveError(() => stampTyped, () => (detailWrong.lastHydro ? t('gear.fieldError.stamp') : '')),
    secondStages: liveError(() => details.secondStages ?? '', () => (detailWrong.secondStages ? t('gear.fieldError.number') : '')),
    lumens: liveError(() => details.lumens ?? '', () => (detailWrong.lumens ? t('gear.fieldError.number') : '')),
  };
  const dateLive = liveError(
    () => purchasedOn,
    () => (problems.purchasedOn ? t('gear.pieceEdit.dateInvalid') : ''),
  );
  const canSave = $derived(!problems.name && !problems.purchasedOn && !Object.keys(detailWrong).length && !saving && !gear.readOnly);
  const suggestions = $derived(suggestionsFor(type, details));
  const suggestion = $derived(suggestions[0]);
  const suggestedRule = $derived(suggestion ? { intervalMonths: suggestion.months ?? null, intervalDives: suggestion.dives ?? null } : null);
  /** Every field of the type has a text to bind to. */
  $effect.pre(() => {
    for (const f of [...fields.before, ...fields.after]) if (details[f.key] === undefined) details[f.key] = '';
  });
  /** A reminder chosen for another type, or another kind of suit, does not carry over. */
  $effect(() => {
    void type;
    void details.suitType;
    reminder = null;
  });
  /** The line of the reminders card: the type's own wording for a cylinder and a drysuit, else the generic one with the rule. */
  const suggestionLine = $derived(
    type === 'cylinder'
      ? t('maintenance.reminderCard.suggestCylinder')
      : type === 'suit' && details.suitType === 'dry'
        ? t('maintenance.reminderCard.suggestDrysuit')
        : suggestedRule
          ? t(`maintenance.reminderCard.suggest.${type}`, { rule: ruleText(suggestedRule).replace(/^./, (c) => c.toLocaleLowerCase()) })
          : t('maintenance.reminderCard.noSuggestion'),
  );
  const showReminderCard = $derived(!id && !computer);
  /** @param {string} key @param {string} value */
  const setDetail = (key, value) => (details = { ...details, [key]: value });

  /** @param {Event} e */
  async function pickPhoto(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      photoUrl = await photoToDataUrl(file);
      photoChanged = true;
    } catch {
      showSnackbar(t('gear.pieceNew.photoFailed'));
    }
  }

  function removePhoto() {
    photoUrl = '';
    photoId = '';
    photoChanged = true;
  }

  /** @param {{ months: number|null, dives: number|null, notifyDays: 14|30|60, warnInDive: boolean }} rule */
  function setReminder(rule) {
    reminder = { task: suggestion?.task ?? 'service', months: rule.months, dives: rule.dives, notifyDays: rule.notifyDays, warnInDive: rule.warnInDive };
    ruleOpen = false;
  }

  /** « Retirer de l'équipement » (task 2026-11-19-308): the piece keeps its history and its dives. @param {'sold'|'lost'|'worn'|undefined} reason */
  async function retire(reason) {
    confirmRetire = false;
    try {
      await change((inv) => inv.retireGear(id, reason));
      showSnackbar(t('gear.retire.done'));
      f7router.back('/profile/gear', { force: true });
    } catch {
      showSnackbar(t('gear.inventory.readOnlyRefused'));
    }
  }

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      const hydroOn = type === 'cylinder' ? (parseStampText(stampTyped) ?? '') : '';
      const kept = detailsToKeep(/** @type {any} */ (type), { ...details, lastHydro: hydroOn }, piece?.details ?? {});
      const saved = await change(async (inv) => {
        let nextPhoto = spec.photo ? photoId : '';
        if (spec.photo && photoChanged) nextPhoto = photoUrl ? await inv.savePhoto(photoUrl) : '';
        const g = await inv.saveGear({
          id: id || undefined,
          type: /** @type {any} */ (type),
          name: effectiveName,
          brand: spec.brand ? brand : '',
          model: spec.brand ? model : '',
          serial: computer && piece?.computerModel ? piece.serial : spec.serial ? serial : '',
          purchasedOn,
          note,
          details: kept,
          photoId: nextPhoto || undefined,
        });
        if (!id && reminder && !computer) {
          // The first reminder is the one the diver set; the type's other suggestions (a cylinder's hydrostatic test) follow with their usual rule.
          const [first, ...rest] = suggestions;
          await inv.saveMaintenance({ gearId: g.id, task: reminder.task, intervalMonths: reminder.months, intervalDives: reminder.dives, notifyDays: ownLeadDays(reminder.notifyDays, settings.maintenanceLeadDays), warnInDive: reminder.warnInDive });
          for (const s of rest) {
            if (s.task === first?.task) continue;
            await inv.saveMaintenance({ gearId: g.id, task: s.task, intervalMonths: s.months ?? null, intervalDives: s.dives ?? null, notifyDays: ownLeadDays(reminder.notifyDays, settings.maintenanceLeadDays), warnInDive: reminder.warnInDive });
          }
        }
        // A cylinder's last visual inspection and hydrostatic test enter the maintenance history, from which the next due dates count.
        if (type === 'cylinder') {
          for (const [task, kind, date] of /** @type {const} */ ([['inspection', 'inspection', kept.lastInspection], ['hydrostatic', 'other', kept.lastHydro]])) {
            if (!date) continue;
            const known = (await inv.listMaintenance()).find((m) => m.gearId === g.id && m.task === task);
            if (known?.history?.some((h) => h.doneOn === date)) continue;
            await inv.noteMaintenance({ gearId: g.id, task }, { kind, doneOn: date });
          }
        }
        return g;
      });
      showSnackbar(t('gear.pieceEdit.saved'));
      f7router.back();
      if (!id && reminder && !computer && saved) afterReminderSaved();
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'gear.inventory.saveFailed'));
    } finally {
      saving = false;
    }
  }
</script>

{#snippet typeIcon(/** @type {string} */ value)}
  <GearIcon type={/** @type {any} */ (value)} size={24} />
{/snippet}

<!-- No photo for the model: the type's own drawing, large (task 2026-11-19-310). -->
{#snippet pictureIcon()}
  <span class="od-piece-edit--generic" aria-hidden="true"><GearIcon {type} {name} size={96} /></span>
{/snippet}

{#snippet detail(/** @type {import('../lib/gear-fields.js').DetailField} */ f)}
  {#if f.kind === 'text'}
    <TextField label={t(`gear.field.${f.key}`)} bind:value={details[f.key]} supporting={f.hint ? t(`gear.fieldHint.${f.key}`) : ''} />
  {:else if f.kind === 'number'}
    <TextField
      label={t(`gear.field.${f.key}`)}
      bind:value={details[f.key]}
      inputmode="numeric"
      invalid={!!detailLive[/** @type {'secondStages'|'lumens'} */ (f.key)]?.error}
      supporting={detailLive[/** @type {'secondStages'|'lumens'} */ (f.key)]?.error || (f.hint ? t(`gear.fieldHint.${f.key}`) : '')}
    />
  {:else if f.kind === 'segments'}
    <div class="od-piece-edit--segments">
      <span class="od-piece-edit--segments-label" id={`od-piece-${f.key}`}>{t(`gear.field.${f.key}`)}</span>
      <ButtonGroup
        ariaLabelledby={`od-piece-${f.key}`}
        value={details[f.key] ?? ''}
        onchange={(v) => setDetail(f.key, v)}
        clearable
        options={(f.options ?? []).map((o) => ({ value: o, label: t(`gear.fieldOption.${f.key}.${o}`) }))}
      />
    </div>
  {:else if f.kind === 'select'}
    <SelectField
      label={t(`gear.field.${f.key}`)}
      value={details[f.key] ?? ''}
      onchange={(v) => setDetail(f.key, v)}
      clearLabel={t('gear.fieldOption.none')}
      options={(f.options ?? []).map((o) => ({ value: o, label: t(`gear.fieldOption.${f.key}.${o}`) }))}
    />
  {:else if f.kind === 'switch'}
    <SwitchField label={t(`gear.field.${f.key}`)} checked={details[f.key] === 'yes'} onchange={(v) => setDetail(f.key, v ? 'yes' : '')} supporting={f.hint ? t(`gear.fieldHint.${f.key}`) : ''} />
  {:else if f.kind === 'date'}
    <DateField label={t(`gear.field.${f.key}`)} bind:value={details[f.key]} placeholder={t('gear.fieldHint.datePlaceholder')} maxYear={new Date().getFullYear()} supporting={detailLive.lastInspection.error} />
  {:else if f.kind === 'stamp'}
    <TextField
      label={t(`gear.field.${f.key}`)}
      bind:value={stampTyped}
      inputmode="numeric"
      invalid={!!detailLive.lastHydro.error}
      supporting={detailLive.lastHydro.error || t(`gear.fieldHint.${f.key}`)}
    />
  {:else if f.kind === 'cylinderType'}
    <SelectField
      label={t('gear.field.cylinderType')}
      value={details.cylinderType ?? ''}
      onchange={(v) => setDetail('cylinderType', v)}
      options={cylinderOptions}
      clearLabel={t('gear.fieldOption.none')}
      supporting={t('gear.fieldHint.cylinderType')}
    />
  {/if}
{/snippet}

{#snippet body()}

  <ReadOnlyNotice />

  {#if profileWide()}
  <h2 class="od-piece-edit--title" id="od-piece-type">{t('gear.pieceNew.typeTitle')}</h2>
    <div class="od-piece-edit--tiles" class:od-piece-edit--compact={profileWide()} role="radiogroup" aria-labelledby="od-piece-type">
      {#each GEAR_TYPES as value (value)}
        {@const on = type === value}
        <button
          type="button"
          role="radio"
          aria-checked={on}
          class="od-piece-edit--tile"
          class:od-piece-edit--tile-on={on}
          disabled={!!piece?.computerModel && value !== type}
          onclick={() => (type = value)}
        >
          {#if on}<span class="od-piece-edit--check" aria-hidden="true"><Icon name="check" size={14} weight={3} /></span>{/if}
          <span class="od-piece-edit--tile-icon od-piece-edit--tone-{TONES[value] ?? 'grey'}"><GearIcon type={value} size={profileWide() ? 22 : 26} /></span>
          <span class="od-piece-edit--tile-name">{t(`gear.pieceNew.tile.${value}`)}</span>
        </button>
      {/each}
    </div>
  
{:else}
    <!-- Phone: one filled field that opens a menu with the 16 types (task 2026-11-19-310); the iPhone uses the system list. -->
    <div class="od-piece-edit--type-field">
      <SelectField label={t('gear.pieceNew.typeTitle')} bind:value={type} options={typeOptions} disabled={!!piece?.computerModel} icon={typeIcon} />
    </div>
  {/if}

  {#if spec.photo}
    <div class="od-piece-edit--image">
      <div class="od-piece-edit--picture" data-testid="piece-picture" class:od-piece-edit--picture-box={!ios && !profileWide()} role="img" aria-label={t('gear.computerEdit.imageLabel')}>
        <DcTile model={computer ? catalogModel : ''} size={ios ? 176 : 160} radius={16} photo={photoUrl} fallback={pictureIcon} />
      </div>
      <button type="button" class="od-piece-edit--change" onclick={() => fileInput?.click()}>
        {#if !ios}<Icon name="camera" size={20} />{/if}{t('gear.computerEdit.changeImage')}
      </button>
      {#if photoUrl}
        <button type="button" class="od-piece-edit--photo-remove" onclick={removePhoto}>{t('gear.computerEdit.removeImage')}</button>
        <p class="od-piece-edit--photo-note">{t('gear.computerEdit.photoNote')}</p>
      {/if}
      <input bind:this={fileInput} class="od-piece-edit--file" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={pickPhoto} />
    </div>
  {/if}

  <div class="od-piece-edit--fields">
    {#if type === 'other'}
      {#each fields.before as f (f.key)}{@render detail(f)}{/each}
    {/if}
    {#if namedByHand}
      <TextField label={type === 'other' ? t('gear.pieceNew.otherName') : t('gear.pieceEdit.name')} bind:value={name} supporting={type === 'cylinder' ? t('gear.pieceNew.cylinderNameHint') : ''} />
    {/if}

    {#if type !== 'other'}
      {#each fields.before as f (f.key)}{@render detail(f)}{/each}
    {/if}

    {#if spec.brand}
      {#if computer}
        <ComboField label={t('gear.pieceEdit.brand')} bind:value={brand} options={lists.vendors} />
      {:else}
        <TextField label={t('gear.pieceEdit.brand')} bind:value={brand} />
      {/if}
      <div class="od-piece-edit--model">
        <div class="od-piece-edit--model-field">
          {#if computer}
            <ComboField label={t('gear.pieceEdit.model')} bind:value={model} options={lists.modelsOf(brand)} />
          {:else}
            <TextField label={t('gear.pieceEdit.model')} bind:value={model} />
          {/if}
        </div>
      </div>
    {/if}
    {#if computer && piece?.computerModel}
      <p class="od-piece-edit--help">{t('gear.pieceEdit.readFromDownload')}</p>
    {:else if spec.serial}
      {#if computer}
        <TextField label={t('gear.pieceEdit.serial')} bind:value={serial} supporting={t('gear.pieceNew.serialHintComputer')} />
      {:else if spec.serialHint}
        <TextField label={type === 'suit' ? t('gear.pieceEdit.serialOptional') : t('gear.pieceEdit.serial')} bind:value={serial} supporting={t(`gear.pieceNew.serialHint_${spec.serialHint}`)} />
      {:else}
        <TextField label={t('gear.pieceEdit.serial')} bind:value={serial} supporting={t('gear.pieceNew.serialHint')} />
      {/if}
    {/if}

    {#each fields.after as f (f.key)}{@render detail(f)}{/each}

    <TextField label={t('gear.pieceEdit.purchasedOn')} bind:value={purchasedOn} inputmode="numeric" invalid={!!dateLive.error} supporting={dateLive.error || t('gear.pieceEdit.purchasedOnHint')} />
    <TextField label={t('gear.pieceEdit.note')} bind:value={note} supporting={computer ? t('gear.computerEdit.noteHint') : t('gear.pieceEdit.noteHint')} />

    {#if showReminderCard}
      <div class="od-piece-edit--reminder">
        <span class="od-piece-edit--reminder-icon"><Icon name="clock" size={22} /></span>
        <span class="od-piece-edit--reminder-texts">
          <span class="od-piece-edit--reminder-title">{t('maintenance.reminderCard.title')}</span>
          <span class="od-piece-edit--reminder-line">
            {#if reminder}
              {taskLabel({ task: reminder.task })} · {ruleText({ intervalMonths: reminder.months, intervalDives: reminder.dives })}
            {:else}
              {suggestionLine}
            {/if}
          </span>
        </span>
        <button type="button" class="od-piece-edit--reminder-button" disabled={gear.readOnly} onclick={() => (ruleOpen = true)}>
          {reminder ? t('maintenance.reminderCard.edit') : t('maintenance.reminderCard.add')}
        </button>
      </div>
    {/if}
    {#if id}
      <button type="button" class="od-piece-edit--retire" disabled={gear.readOnly} onclick={() => (confirmRetire = true)}><Icon name="archive" size={20} />{t('gear.retire.button')}</button>
    {/if}
  </div>
  <div class="od-piece-edit--bottom"></div>
{/snippet}

<Page class="od-piece-edit">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="od-sr-only">{t('gear.pieceEdit.close')}</span>
      </a>
    {/snippet}
    {#snippet title()}{id ? t('gear.pieceEdit.editTitle') : t('gear.pieceEdit.addTitle')}{/snippet}
    {#snippet right()}
      <button type="button" class="od-piece-edit--save" disabled={!canSave} onclick={save}>{t('gear.pieceEdit.save')}</button>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="gear" list="gear" selected={id} bar="dialog" size="l">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

{#if confirmRetire && id}
  <RetirePieceDialog name={effectiveName || name} computer={computer} oncancel={() => (confirmRetire = false)} onconfirm={retire} />
{/if}

<MaintenanceRuleSheet
  opened={ruleOpen}
  name={effectiveName || t(`gear.pieceNew.tile.${type}`)}
  initial={{
    months: reminder ? reminder.months : (suggestion?.months ?? 24),
    dives: reminder ? reminder.dives : (suggestion?.dives ?? null),
    notifyDays: reminder?.notifyDays ?? settings.maintenanceLeadDays,
    warnInDive: reminder?.warnInDive ?? true,
  }}
  removable={!!reminder}
  onclose={() => (ruleOpen = false)}
  onsave={setReminder}
  onremove={() => {
    reminder = null;
    ruleOpen = false;
  }}
/>

<style>
  @layer od.components {
    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.od-piece-edit .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-piece-edit--save {
      height: 40px;
      margin-inline-end: 8px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-piece-edit--save:disabled {
      opacity: 0.38;
    }

    .od-piece-edit--title {
      margin: 16px 20px 8px;
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-piece-edit--tiles {
      margin: 0 16px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .od-piece-edit--tile {
      position: relative;
      width: auto;
      min-height: 80px;
      padding: 10px 6px;
      border: var(--od-outline-width) solid var(--od-outline);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 13px;
      line-height: 16px;
      text-align: center;
    }

    .od-piece-edit--tile-on {
      border-color: transparent;
      background: var(--od-selected-container);
      color: var(--od-on-selected-container, var(--od-text));
    }

    /* Tablet and desktop (task 2026-11-18-277): a regular grid of 3 × 3 compact buttons, 56 px high, the icon in a coloured square. */
    .od-piece-edit--compact .od-piece-edit--tile {
      min-height: 56px;
      padding: 0 12px;
      border-radius: 12px;
      flex-direction: row;
      justify-content: flex-start;
      gap: 12px;
      font-size: 15px;
      font-weight: 500;
      text-align: start;
    }
    .od-piece-edit--compact .od-piece-edit--tile-on {
      border-color: var(--od-secondary);
    }
    .od-piece-edit--compact .od-piece-edit--check {
      position: static;
      margin-inline-start: auto;
      order: 3;
    }
    .od-piece-edit--compact .od-piece-edit--tile-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--od-background);
    }
    .od-piece-edit--compact .od-piece-edit--tone-blue { background: var(--od-release-tile); }
    .od-piece-edit--compact .od-piece-edit--tone-green { background: var(--od-tile-green); }
    .od-piece-edit--compact .od-piece-edit--tone-beige { background: var(--od-tile-beige); }
    .od-piece-edit--compact .od-piece-edit--tone-violet { background: var(--od-tile-violet); }
    .od-piece-edit--tile-icon { display: contents; }
    .od-piece-edit--compact .od-piece-edit--tile-icon { display: grid; }

    .od-piece-edit--tile:disabled {
      opacity: 0.38;
    }

    .od-piece-edit--check {
      position: absolute;
      top: 6px;
      inset-inline-end: 6px;
      width: 20px;
      height: 20px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
    }

    .od-piece-edit--fields {
      margin: 16px 0 0;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-piece-edit--type-field {
      --od-field-margin: 16px;
    }

    /* The model's photo, large, with « Changer d’image » under it (as « Modifier l’ordinateur de plongée »): Android phone a
       white 192 box around the 160 photo, iPhone 176, a wide screen 160. */
    .od-piece-edit--image {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .od-piece-edit--picture {
      width: 160px;
      height: 160px;
      border-radius: 16px;
      overflow: hidden;
    }

    .od-piece-edit--picture-box {
      width: 192px;
      height: 192px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-photo-ground);
    }

    :global(.ios) .od-piece-edit--picture {
      width: 176px;
      height: 176px;
    }

    .od-piece-edit--generic {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-selected-container);
      color: var(--od-secondary);
    }

    .od-piece-edit--change {
      width: auto;
      height: 48px;
      padding: 0 20px;
      border: 1px solid var(--od-outline);
      border-radius: 24px;
      background: transparent;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    :global(.ios) .od-piece-edit--change {
      height: 44px;
      padding: 0 12px;
      border: none;
      font-size: 17px;
      font-weight: 400;
    }

    .od-piece-edit--photo-note {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      text-align: center;
    }

    .od-piece-edit--model {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-piece-edit--model-field {
      flex: 1;
      min-width: 0;
    }

    .od-piece-edit--photo-remove {
      width: auto;
      height: 40px;
      padding: 0 16px;
      border: none;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-piece-edit--file {
      display: none;
    }

    /* The segmented buttons and the switches sit on the same margin as the text fields (16 dp page + 16 dp field). */
    .od-piece-edit--segments,
    .od-piece-edit--fields > :global(.od-switch-field) {
      margin-inline: 16px;
    }

    .od-piece-edit--segments {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .od-piece-edit--segments-label {
      padding: 0 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-piece-edit--help {
      margin: 0 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-piece-edit--reminder {
      margin-top: 8px;
      padding: 12px 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--od-surface);
    }

    .od-piece-edit--reminder-icon {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-piece-edit--reminder-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-piece-edit--reminder-title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .od-piece-edit--reminder-line {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-piece-edit--reminder-button {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: var(--od-tonal);
      color: var(--od-on-secondary-container);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-piece-edit--reminder-button:disabled {
      opacity: 0.38;
    }

    .od-piece-edit--retire {
      margin-top: 16px;
      width: auto;
      align-self: flex-start;
      height: 48px;
      padding: 0 20px;
      border: 1px solid var(--od-outline);
      border-radius: 24px;
      background: transparent;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .od-piece-edit--retire:disabled {
      opacity: 0.38;
    }

    .od-piece-edit--bottom {
      height: 48px;
    }
  }
</style>
