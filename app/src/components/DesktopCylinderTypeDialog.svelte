<script>
  // @ts-check
  // « Modifier le type » / « Nouveau type » on the desktop (task 2026-11-19-287, mock-ups
  // bureau-reglages-equipement-type and -supprimer): the dialog of the phone's cylinder type page, 560 px wide.
  // Name, water volume and working pressure; for one of the diver's own types the explanation with the
  // count of dives, and « Supprimer ce type » (red, outlined) at the left of the footer, which asks first
  // (the phone's confirmation). A standard type has « Retirer ce type » instead (neutral).
  import { onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import TextField from './TextField.svelte';
  import Icon from './Icon.svelte';
  import { BenthicCore } from 'benthic-core';
  import { t } from '../lib/i18n.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { formatNumber, locale } from '../lib/format.js';
  import { logbook, renameCylinderType, previewCylinderTypeDeletion, deleteCylinderType } from '../lib/logbook.svelte.js';
  import { deletable, deletionSentences, sizeFields, typedSize, parseSizeNumber as parse } from '../lib/cylinder-types.js';
  import { keepCylinderLibrary } from '../lib/settings.svelte.js';

  /**
   * @type {{
   *   type: import('benthic-core').CylinderType|null,
   *   oncancel: () => void,
   *   ondone: () => void,
   * }}
   * type: the type to edit; null for a new one.
   */
  let { type, oncancel, ondone } = $props();

  // svelte-ignore state_referenced_locally
  const original = type?.name ?? '';
  const editing = !!type;
  const cuft = $derived(logbook.prefs.volume === 'cuft');
  const psi = $derived(logbook.prefs.pressure === 'psi');

  /** @param {number} value @param {number} decimals */
  const number = (value, decimals) => new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, useGrouping: false }).format(value);

  // svelte-ignore state_referenced_locally
  const start = type ? sizeFields(type, { cuft, psi }, number) : { volume: '', pressure: '' };
  let name = $state(original);
  let volume = $state(start.volume);
  let pressure = $state(start.pressure);
  let error = $state('');
  let saving = $state(false);
  /** What deleting the type does to the dives. @type {import('benthic-core').CylinderTypeDeletion|null} */
  let deletion = $state(null);

  onMount(async () => {
    if (type && deletable(type) && type.dives) deletion = await previewCylinderTypeDeletion(original).catch(() => null);
  });

  const volumeLive = liveError(() => volume, (text) => (parse(text) > 0 ? '' : t('settings.cylinders.volumeInvalid')));
  const pressureLive = liveError(() => pressure, (text) => (parse(text) >= 0 ? '' : t('settings.cylinders.pressureInvalid')));
  $effect(() => {
    name;
    error = '';
  });

  /** « Votre type, utilisé dans 12 plongées. … Le supprimer retire cette bouteille de ces 12 plongées. » */
  const explanation = $derived.by(() => {
    if (!type) return '';
    const n = type.dives;
    const use = t(n === 0 ? 'settings.cylinders.usedInNoDive' : n === 1 ? 'settings.cylinders.usedInOneDive' : 'settings.cylinders.usedInDives', { n: formatNumber(n, 0) });
    const note = t(type.standard ? 'settings.cylinders.noteStandard' : 'settings.cylinders.noteYours', { use });
    if (!deletable(type) || !n || !deletion) return note;
    return [
      note,
      deletion.removed ? t('settings.cylinders.deleteRemovedDialog', { n: deletion.removed }) : '',
      deletion.kept ? t('settings.cylinders.deleteKept', { n: deletion.kept }) : '',
    ]
      .filter(Boolean)
      .join(' ');
  });

  /** @param {unknown} e */
  function failure(e) {
    const code = String(/** @type {any} */ (e)?.message ?? e);
    if (code.includes('NAME_IN_USE')) {
      error = t('settings.cylinders.nameInUse');
    } else {
      console.error('Saving the cylinder type', e);
      showSnackbar(t('settings.error'));
    }
  }

  async function save() {
    if (saving) return;
    error = '';
    const trimmed = name.trim();
    if (!trimmed) {
      error = t('settings.cylinders.nameMissing');
      return;
    }
    const size = typedSize(volume, pressure, { cuft, psi });
    if ('invalid' in size) {
      error = t(size.invalid === 'pressure' ? 'settings.cylinders.pressureInvalid' : 'settings.cylinders.volumeInvalid');
      return;
    }
    saving = true;
    try {
      if (!type) {
        keepCylinderLibrary((await BenthicCore.cylinderTypes({ action: 'add', name: trimmed, ...size })).library);
      } else {
        let current = original;
        if (trimmed !== original) {
          await renameCylinderType(original, trimmed);
          current = trimmed;
        }
        if (size.ml !== type.ml || size.mbar !== type.mbar) keepCylinderLibrary((await BenthicCore.cylinderTypes({ action: 'size', name: current, ...size })).library);
      }
      ondone();
    } catch (e) {
      failure(e);
      saving = false;
    }
  }

  async function deleteNow() {
    try {
      await deleteCylinderType(original);
      ondone();
    } catch (e) {
      failure(e);
    }
  }

  async function deleteTheType() {
    if (!type) return;
    try {
      if (!type.dives) return await deleteNow();
      const counts = deletion ?? (await previewCylinderTypeDeletion(original));
      confirmAction({
        title: t('settings.cylinders.deleteTypeTitle', { name: original }),
        text: [...deletionSentences(counts), t('settings.cylinders.deleteIrreversible')].join(' '),
        action: t('settings.cylinders.deleteTypeAction'),
        danger: true,
        onConfirm: deleteNow,
      });
    } catch (e) {
      failure(e);
    }
  }

  function remove() {
    confirmAction({
      title: t('settings.cylinders.deleteTitle', { name: original }),
      text: t('settings.cylinders.deleteText'),
      action: t('settings.cylinders.deleteAction'),
      onConfirm: async () => {
        try {
          keepCylinderLibrary((await BenthicCore.cylinderTypes({ action: 'remove', name: original })).library);
          ondone();
        } catch (e) {
          failure(e);
        }
      },
    });
  }
</script>

<Md3Dialog title={editing ? t('settings.cylinders.editTitle') : t('settings.cylinders.newTitle')} class="bc-desktop-cylinder-type" {oncancel}>
  <form
    class="bc-desktop-cylinder-type--form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <TextField label={t('settings.cylinders.name')} bind:value={name} supporting={error || t('settings.cylinders.nameHelp')} invalid={!!error} />
    <div class="bc-desktop-cylinder-type--pair">
      <TextField label={t('settings.cylinders.volume')} bind:value={volume} inputmode="decimal" invalid={!!volumeLive.error} supporting={volumeLive.error}>
        {#snippet trailing()}<span class="bc-desktop-cylinder-type--unit">{t(cuft ? 'units.cubicFeet' : 'units.liters')}</span>{/snippet}
      </TextField>
      <TextField label={t('settings.cylinders.pressure')} bind:value={pressure} inputmode="decimal" invalid={!!pressureLive.error} supporting={pressureLive.error}>
        {#snippet trailing()}<span class="bc-desktop-cylinder-type--unit">{t(psi ? 'units.psi' : 'units.bar')}</span>{/snippet}
      </TextField>
    </div>
    <p class="bc-desktop-cylinder-type--note">{t(cuft ? 'settings.cylinders.volumeNoteCuft' : 'settings.cylinders.volumeNoteLitres')}</p>
    {#if explanation}<p class="bc-desktop-cylinder-type--note">{explanation}</p>{/if}
    <button type="submit" class="bc-sr-only" tabindex="-1" aria-hidden="true"></button>
  </form>
  {#snippet actions()}
    {#if type && deletable(type)}
      <button type="button" class="bc-md3-dialog--start bc-desktop-cylinder-type--delete" onclick={deleteTheType}>
        <Icon name="delete" size={18} />
        {t('settings.cylinders.deleteType')}
      </button>
    {:else if type?.library}
      <button type="button" class="bc-md3-dialog--start bc-desktop-cylinder-type--remove" onclick={remove}>{t('settings.cylinders.delete')}</button>
    {/if}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" disabled={saving} onclick={save}>{t('edit.save')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .bc-desktop-cylinder-type--form {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      --bc-field-margin: 0px;
    }

    .bc-desktop-cylinder-type--pair {
      display: flex;
      gap: 16px;

      & > :global(*) {
        flex: 1;
        min-width: 0;
      }
    }

    .bc-desktop-cylinder-type--unit {
      padding-inline-end: 12px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-desktop-cylinder-type--note {
      margin: 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* The footer's outlined buttons: the red of « Supprimer le compte » (--bc-late), or the neutral outline. */
    :global(.bc-md3-dialog--actions) button.bc-desktop-cylinder-type--delete,
    :global(.bc-md3-dialog--actions) button.bc-desktop-cylinder-type--remove {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
      border: var(--bc-outline-width) solid var(--bc-text-2);
      color: var(--bc-text);
    }
    :global(.bc-md3-dialog--actions) button.bc-desktop-cylinder-type--delete {
      border-color: var(--bc-late);
      color: var(--bc-late-text);
    }
  }
</style>
