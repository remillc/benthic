<script>
  // @ts-check
  // « Modifier le type de lest » / « Nouveau type de lest » on the desktop (task 2026-11-26-403, mock-up
  // bureau-reglages-equipement-lest): the dialog of the phone's weight type page (pages/WeightType.svelte), 560 px wide, as the
  // cylinder type's. Nom and Poids with the unit, the usage note, then « Supprimer ce type » (red, outlined) at the left of
  // the footer, « Annuler » and « Enregistrer ». A type no dive uses is deleted at once; one the dives use asks first (the
  // dives keep their weights).
  import Md3Dialog from './Md3Dialog.svelte';
  import TextField from './TextField.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatNumber, formatWeight } from '../lib/format.js';
  import { weightPlaceName } from '../lib/desktop-detail.js';
  import { parseTyped, weightText } from '../lib/desktop-edit.js';
  import { addWeightType, removeWeightType, saveWeightType } from '../lib/weight-types.svelte.js';

  /**
   * @type {{
   *   type: import('../lib/weight-type-files.js').WeightTypeRow|null,
   *   oncancel: () => void,
   *   ondone: () => void,
   * }}
   * type: the type to edit; null for a new one.
   */
  let { type, oncancel, ondone } = $props();

  // svelte-ignore state_referenced_locally
  const original = type?.name ?? '';
  // svelte-ignore state_referenced_locally
  const editing = !!type;
  const G_PER_LB = 453.59237;
  const pounds = $derived(logbook.prefs.weight === 'lbs');
  const max = $derived(pounds ? 400 : 200);
  const unit = $derived(t(pounds ? 'units.pounds' : 'units.kilograms'));

  // The name as shown (a built-in name is translated): left as it is, the type keeps the name it has in the dives.
  let name = $state(original ? weightPlaceName(original) : '');
  // svelte-ignore state_referenced_locally
  let weight = $state(type?.fileId ? weightText(type.grams, logbook.prefs) : '');
  /** The weight the core last saw for this type, when the diver gave it none. */
  // svelte-ignore state_referenced_locally
  const lastUsedGrams = type && !type.fileId ? type.grams : 0;
  let error = $state('');
  let saving = $state(false);

  const weightLive = liveError(() => weight, (text) => {
    if (!text.trim()) return '';
    const v = parseTyped(text);
    return v >= 0 && v <= max ? '' : t('settings.weights.weightInvalid', { max, unit });
  });
  $effect(() => {
    name;
    error = '';
  });

  /** The weight typed, in grams (0 when empty); null when invalid. */
  function grams() {
    if (!weight.trim()) return 0;
    const v = parseTyped(weight);
    if (!(v >= 0 && v <= max)) return null;
    return Math.round(pounds ? v * G_PER_LB : v * 1000);
  }

  /** « Utilisé dans 5 plongées. Le renommer renomme aussi ce lest dans ces plongées. Le poids est proposé quand on ajoute ce lest à une plongée. » */
  const usageNote = $derived.by(() => {
    if (!type) return '';
    const n = type.dives;
    const use = t(n === 0 ? 'settings.weights.usedInNoDive' : n === 1 ? 'settings.weights.usedInOneDive' : 'settings.weights.usedInDives', { n: formatNumber(n, 0) });
    return t('settings.weights.noteDesktop', { use });
  });

  /** @param {unknown} e */
  function failure(e) {
    if (String(/** @type {any} */ (e)?.message ?? e).includes('NAME_IN_USE')) error = t('settings.weights.nameInUse');
    else {
      console.error('Saving the weight type', e);
      showSnackbar(t('settings.error'));
    }
  }

  async function save() {
    if (saving) return;
    const g = grams();
    if (g === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      error = t('settings.weights.nameMissing');
      return;
    }
    saving = true;
    try {
      if (!type) await addWeightType({ name: trimmed, grams: g });
      else await saveWeightType(type, { name: trimmed === weightPlaceName(original) ? original : trimmed, grams: g });
      ondone();
    } catch (e) {
      failure(e);
      saving = false;
    }
  }

  async function removeNow() {
    if (!type) return;
    try {
      await removeWeightType(type);
      ondone();
    } catch (e) {
      failure(e);
    }
  }

  function remove() {
    if (!type) return;
    if (!type.dives) {
      removeNow();
      return;
    }
    confirmAction({ title: t('settings.weights.deleteTitle', { name: weightPlaceName(original) }), text: t('settings.weights.deleteUsed'), action: t('settings.weights.deleteAction'), danger: true, onConfirm: removeNow });
  }
</script>

<Md3Dialog title={editing ? t('settings.weights.editTitleIos') : t('settings.weights.newTitle')} class="bc-desktop-weight-type" {oncancel}>
  <form
    class="bc-desktop-weight-type--form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <TextField label={t('settings.weights.name')} bind:value={name} supporting={error || t('settings.weights.nameHelp')} invalid={!!error} />
    <TextField
      label={t('settings.weights.weight')}
      bind:value={weight}
      inputmode="decimal"
      invalid={!!weightLive.error}
      supporting={weightLive.error || (lastUsedGrams && !weight.trim() ? t('settings.weights.lastUsed', { weight: formatWeight(lastUsedGrams, logbook.prefs) }) : '')}
    >
      {#snippet trailing()}<span class="bc-desktop-weight-type--unit">{unit}</span>{/snippet}
    </TextField>
    {#if usageNote}<p class="bc-desktop-weight-type--note">{usageNote}</p>{/if}
    <button type="submit" class="bc-sr-only" tabindex="-1" aria-hidden="true"></button>
  </form>
  {#snippet actions()}
    {#if type}
      <button type="button" class="bc-md3-dialog--start bc-desktop-weight-type--delete" onclick={remove}>
        <Icon name="delete" size={18} />
        {t('settings.weights.deleteType')}
      </button>
    {/if}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" disabled={saving} onclick={save}>{t('edit.save')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-desktop-weight-type--form {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      --bc-field-margin: 0px;
    }

    .bc-desktop-weight-type--unit {
      padding-inline-end: 12px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-desktop-weight-type--note {
      margin: 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* The footer's outlined button: the red of « Supprimer ce type » of the cylinder types (--bc-late). */
    :global(.bc-md3-dialog--actions) button.bc-desktop-weight-type--delete {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
      border: var(--bc-outline-width) solid var(--bc-late);
      color: var(--bc-late-text);
    }
  }
</style>
