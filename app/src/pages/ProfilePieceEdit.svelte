<script>
  // @ts-check
  // « Nouvelle pièce » and « Modifier la pièce » (tasks 2026-11-17-267 and 2026-11-18-273,
  // docs/mockups-release/profil-piece-nouvelle-android.dc.html): « Type de pièce » as a grid of 3 × 3 tiles with the
  // inventory's icons (the chosen one blue with a check; « Autre » takes a free name), a photo, then Marque, Modèle,
  // Numéro de série, Date d'achat and Notes, and the card « Rappel d'entretien » with the reminder suggested for the
  // type. The fields are checked as the diver types. A computer's serial number and firmware are read at each
  // download, so they are not typed. The name of a new piece is its brand and model; « Autre » has its own.
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import GearIcon from '../components/GearIcon.svelte';
  import TextField from '../components/TextField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import MaintenanceRuleSheet from '../components/MaintenanceRuleSheet.svelte';
  import { gear, loadInventory, change, readPhoto } from '../lib/inventory.svelte.js';
  import { GEAR_TYPES, gearProblems } from '../lib/inventory.js';
  import { suggestionsFor } from '../lib/maintenance.js';
  import { ruleText, taskLabel } from '../lib/maintenance-text.js';
  import { afterReminderSaved } from '../lib/maintenance-notify.js';
  import { photoToDataUrl } from '../lib/photo.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

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
  let saving = $state(false);
  /** The photo: a data URL to show, and the id of the file already kept (when editing). */
  let photoUrl = $state('');
  let photoId = $state('');
  let photoChanged = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();
  let ruleOpen = $state(false);
  /** The reminder set in the card (a new piece only), saved with the piece. @type {{ task: import('../lib/maintenance.js').Task, months: number|null, dives: number|null, notifyDays: 7|30|60, warnInDive: boolean }|null} */
  let reminder = $state(null);

  onMount(async () => {
    await loadInventory();
    const g = gear.pieces.find((x) => x.id === id);
    if (g) {
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
  /** The name field is shown for « Autre » and when editing; a new piece is named from its brand and model. */
  const namedByHand = $derived(type === 'other' || !!id);
  const effectiveName = $derived(namedByHand ? name : [brand, model].map((s) => s.trim()).filter(Boolean).join(' '));
  const problems = $derived(gearProblems({ name: effectiveName, purchasedOn }));
  const dateLive = liveError(
    () => purchasedOn,
    () => (problems.purchasedOn ? t('gear.pieceEdit.dateInvalid') : ''),
  );
  const canSave = $derived(!problems.name && !problems.purchasedOn && !saving && !gear.readOnly);
  const suggestion = $derived(suggestionsFor(type)[0]);
  const suggestedRule = $derived(suggestion ? { intervalMonths: suggestion.months ?? null, intervalDives: suggestion.dives ?? null } : null);

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

  /** @param {{ months: number|null, dives: number|null, notifyDays: 7|30|60, warnInDive: boolean }} rule */
  function setReminder(rule) {
    reminder = { task: suggestion?.task ?? 'service', months: rule.months, dives: rule.dives, notifyDays: rule.notifyDays, warnInDive: rule.warnInDive };
    ruleOpen = false;
  }

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      const saved = await change(async (inv) => {
        let nextPhoto = photoId;
        if (photoChanged) nextPhoto = photoUrl ? await inv.savePhoto(photoUrl) : '';
        const g = await inv.saveGear({
          id: id || undefined,
          type: /** @type {any} */ (type),
          name: effectiveName,
          brand,
          model,
          serial: computer && piece ? piece.serial : serial,
          purchasedOn,
          note,
          photoId: nextPhoto || undefined,
        });
        if (!id && reminder) {
          await inv.saveMaintenance({ gearId: g.id, task: reminder.task, intervalMonths: reminder.months, intervalDives: reminder.dives, notifyDays: reminder.notifyDays, warnInDive: reminder.warnInDive });
        }
        return g;
      });
      showSnackbar(t('gear.pieceEdit.saved'));
      f7router.back();
      if (!id && reminder && saved) afterReminderSaved();
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'gear.inventory.saveFailed'));
    } finally {
      saving = false;
    }
  }
</script>

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

  <ReadOnlyNotice />

  <h2 class="od-piece-edit--title" id="od-piece-type">{t('gear.pieceNew.typeTitle')}</h2>
  <div class="od-piece-edit--tiles" role="radiogroup" aria-labelledby="od-piece-type">
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
        <GearIcon type={value} size={26} />
        <span>{t(`gear.pieceNew.tile.${value}`)}</span>
      </button>
    {/each}
  </div>

  <div class="od-piece-edit--fields">
    {#if namedByHand}
      <TextField label={type === 'other' ? t('gear.pieceNew.otherName') : t('gear.pieceEdit.name')} bind:value={name} />
    {/if}

    <div class="od-piece-edit--photo">
      {#if photoUrl}
        <img src={photoUrl} alt="" class="od-piece-edit--photo-image" />
      {/if}
      <button type="button" class="od-piece-edit--photo-button" onclick={() => fileInput?.click()}>
        <Icon name="camera" size={20} />{photoUrl ? t('gear.pieceNew.photoChange') : t('gear.pieceNew.photoAdd')}
      </button>
      {#if photoUrl}
        <button type="button" class="od-piece-edit--photo-remove" onclick={removePhoto}>{t('gear.pieceNew.photoRemove')}</button>
      {/if}
      <input bind:this={fileInput} class="od-piece-edit--file" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={pickPhoto} />
    </div>

    <TextField label={t('gear.pieceEdit.brand')} bind:value={brand} />
    <TextField label={t('gear.pieceEdit.model')} bind:value={model} />
    {#if computer}
      <p class="od-piece-edit--help">{t('gear.pieceEdit.readFromDownload')}</p>
    {:else}
      <TextField label={t('gear.pieceEdit.serial')} bind:value={serial} supporting={t('gear.pieceNew.serialHint')} />
    {/if}
    <TextField label={t('gear.pieceEdit.purchasedOn')} bind:value={purchasedOn} inputmode="numeric" invalid={!!dateLive.error} supporting={dateLive.error || t('gear.pieceEdit.purchasedOnHint')} />
    <TextField label={t('gear.pieceEdit.note')} bind:value={note} supporting={t('gear.pieceEdit.noteHint')} />

    {#if !id}
      <div class="od-piece-edit--reminder">
        <span class="od-piece-edit--reminder-icon"><Icon name="clock" size={22} /></span>
        <span class="od-piece-edit--reminder-texts">
          <span class="od-piece-edit--reminder-title">{t('maintenance.reminderCard.title')}</span>
          <span class="od-piece-edit--reminder-line">
            {#if reminder}
              {taskLabel({ task: reminder.task })} · {ruleText({ intervalMonths: reminder.months, intervalDives: reminder.dives })}
            {:else if suggestedRule}
              {t(`maintenance.reminderCard.suggest.${type}`, { rule: ruleText(suggestedRule).replace(/^./, (c) => c.toLocaleLowerCase()) })}
            {:else}
              {t('maintenance.reminderCard.noSuggestion')}
            {/if}
          </span>
        </span>
        <button type="button" class="od-piece-edit--reminder-button" disabled={gear.readOnly} onclick={() => (ruleOpen = true)}>
          {reminder ? t('maintenance.reminderCard.edit') : t('maintenance.reminderCard.add')}
        </button>
      </div>
    {/if}
  </div>
  <div class="od-piece-edit--bottom"></div>
</Page>

<MaintenanceRuleSheet
  opened={ruleOpen}
  name={effectiveName || t(`gear.pieceNew.tile.${type}`)}
  initial={{
    months: reminder ? reminder.months : (suggestion?.months ?? 24),
    dives: reminder ? reminder.dives : (suggestion?.dives ?? null),
    notifyDays: reminder?.notifyDays ?? 30,
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

    .od-piece-edit--photo {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .od-piece-edit--photo-image {
      width: 72px;
      height: 72px;
      border-radius: 16px;
      object-fit: cover;
    }

    .od-piece-edit--photo-button,
    .od-piece-edit--photo-remove {
      width: auto;
      height: 40px;
      padding: 0 16px 0 12px;
      border: none;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--od-tonal);
      color: var(--od-on-secondary-container);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-piece-edit--photo-remove {
      padding: 0 12px;
      background: none;
      color: var(--od-secondary);
    }

    .od-piece-edit--file {
      display: none;
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

    .od-piece-edit--bottom {
      height: 48px;
    }
  }
</style>
