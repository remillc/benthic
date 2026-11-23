<script>
  // @ts-check
  // Page of a cylinder type (spec, section 4, "Cylinder types sub-screen"), one for every type (task 2026-11-23-373):
  // name, volume and working pressure, the note with the dive count, and « Supprimer ce type ». A new type shows the
  // « Tailles courantes » chips. Renaming a type some dive uses also renames the cylinders of that type in the logbook
  // (one undoable step); changing a size never changes existing dives. Deleting a type also takes its cylinders out of
  // the dives that use them, except where a dive depends on one (task 285). The added types are files of the account
  // data (lib/cylinder-type-library.svelte.js).

  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import LeaveGuard from '../components/LeaveGuard.svelte';
  import { isDirty } from '../lib/leave-guard.js';
  import { t } from '../lib/i18n.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { logbook, previewCylinderTypeDeletion } from '../lib/logbook.svelte.js';
  import { deletable, deletionSentences, sizeFields, sizeErrorKey, typedSize as readSize, parseSizeNumber as parse } from '../lib/cylinder-types.js';
  import { addCylinderType, saveCylinderType, deleteType, readTypeRows, readDefaultSizes } from '../lib/cylinder-type-library.svelte.js';
  import { commonSizes } from '../lib/cylinder-type-files.js';
  import CylinderSizeChips from '../components/CylinderSizeChips.svelte';
  import { confirmAction, confirmActionSheet } from '../lib/dialogs.js';
  import { ios } from '../lib/layout.svelte.js';
  import { formatNumber, locale } from '../lib/format.js';

  /** @type {{ f7route: { query: { name?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  // svelte-ignore state_referenced_locally
  const original = f7route.query?.name ?? '';
  const editing = !!original;

  /** @type {import('../lib/cylinder-type-files.js').TypeRow|null} */
  let type = $state(null);
  /** The core's default table: the source of the « Tailles courantes ». @type {{ name: string, ml: number, mbar: number, imperial: boolean }[]} */
  let defaults = $state([]);
  let name = $state(original);
  let volume = $state('');
  let pressure = $state('');
  let error = $state('');
  let saving = $state(false);
  /** What deleting the type does to the dives, read once the type is open. @type {import('benthic-core').CylinderTypeDeletion|null} */
  let deletion = $state(null);

  const cuft = $derived(logbook.prefs.volume === 'cuft');
  const psi = $derived(logbook.prefs.pressure === 'psi');

  /** @param {number} value @param {number} decimals */
  const number = (value, decimals) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, useGrouping: false }).format(value);

  // Leaving with changes asks first (components/LeaveGuard.svelte): the fields as
  // filled at opening (a type being edited: once it is read), against now.
  const values = () => ({ name, volume, pressure });
  let opened = $state(/** @type {unknown} */ (editing ? null : values()));
  const dirty = () => opened !== null && isDirty(opened, values());
  let guard = /** @type {LeaveGuard|undefined} */ (undefined);

  onMount(async () => {
    if (!editing) {
      defaults = await readDefaultSizes().catch(() => []);
      return;
    }
    try {
      type = (await readTypeRows()).find((ty) => ty.name === original) ?? null;
      if (!type) return;
      if (deletable(type) && type.dives) deletion = await previewCylinderTypeDeletion(original).catch(() => null);
      ({ volume, pressure } = sizeFields(type, { cuft, psi }, number));
    } catch (e) {
      console.error('Reading the cylinder type', e);
    }
    opened = values();
  });

  // The size is checked as the diver types (forms are validated live): each field says what
  // is wrong with its own value; the name's errors (missing, already used) come at « Enregistrer ».
  const volumeLive = liveError(() => volume, (text) => (parse(text) > 0 ? '' : t('settings.cylinders.volumeInvalid')));
  const pressureLive = liveError(() => pressure, (text) => (parse(text) >= 0 ? '' : t('settings.cylinders.pressureInvalid')));
  // An error about the name leaves when the name changes.
  $effect(() => {
    name;
    error = '';
  });

  /** The size typed, in ml and mbar; null with `error` set when invalid. */
  function typedSize() {
    const size = readSize(volume, pressure, { cuft, psi });
    if ('invalid' in size) {
      error = t(sizeErrorKey(size.invalid));
      return null;
    }
    return size;
  }

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
    error = '';
    const trimmed = name.trim();
    if (!trimmed) {
      error = t('settings.cylinders.nameMissing');
      return;
    }
    // A type being renamed keeps its size when the size fields were not touched (a type read from a dive may have no
    // working pressure, which cubic feet cannot show).
    const sizeUntouched = editing && type && opened !== null && volume === /** @type {any} */ (opened).volume && pressure === /** @type {any} */ (opened).pressure;
    const size = sizeUntouched && type ? { ml: type.ml, mbar: type.mbar } : typedSize();
    if (!size) return;
    saving = true;
    try {
      if (!editing || !type) await addCylinderType({ name: trimmed, ...size });
      else await saveCylinderType(type, { name: trimmed, ...size });
      f7router.back();
    } catch (e) {
      failure(e);
    } finally {
      saving = false;
    }
  }

  /** « Utilisé dans 3 plongées. » and what a change does. */
  const usageNote = $derived.by(() => {
    if (!type) return '';
    const n = type.dives;
    const use = t(n === 0 ? 'settings.cylinders.usedInNoDive' : n === 1 ? 'settings.cylinders.usedInOneDive' : 'settings.cylinders.usedInDives', { n: formatNumber(n, 0) });
    return t('settings.cylinders.note', { use: use.charAt(0).toLocaleUpperCase(locale) + use.slice(1) });
  });

  /** The chips of a new type: the unit system's common sizes. */
  const sizes = $derived(commonSizes(defaults, cuft));

  /** A common size fills the name, the volume and the pressure. @param {{ name: string, ml: number, mbar: number }} size */
  function pick(size) {
    name = size.name;
    ({ volume, pressure } = sizeFields(size, { cuft, psi }, number));
  }

  const deleteNote = $derived(!type || !type.dives ? t('settings.cylinders.deleteTypeNone') : deletion ? deletionSentences(deletion).join(' ') : '');

  async function deleteTheType() {
    if (!type) return;
    try {
      if (!type.dives) {
        await deleteNow();
        return;
      }
      const counts = deletion ?? (await previewCylinderTypeDeletion(original));
      if (ios) {
        // iPhone: an action sheet, « Supprimer « ALU 3L » » in red (task 289).
        confirmActionSheet({
          text: [...deletionSentences(counts), t('settings.cylinders.deleteIrreversible')].join(' '),
          action: t('settings.cylinders.deleteTypeSheet', { name: original }),
          onConfirm: deleteNow,
        });
        return;
      }
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

  async function deleteNow() {
    if (!type) return;
    try {
      await deleteType(type);
      f7router.back();
    } catch (e) {
      failure(e);
    }
  }
</script>

<Page class="bc-cylinder-type">
  <Navbar title={editing ? t('settings.cylinders.editTitle') : t('settings.cylinders.newTitle')}>
    {#snippet left()}
      {#if ios}
        <Link onClick={() => guard?.attempt()}>{t('dialog.cancel')}</Link>
      {:else}
        <Link iconOnly onClick={() => guard?.attempt()}>
          <Icon name="close" />
          <span class="bc-sr-only">{t('plan.chooseClose')}</span>
        </Link>
      {/if}
    {/snippet}
    {#snippet right()}
      <Link onClick={save} class={saving ? 'disabled' : ''}>{t(ios ? 'dialog.ok' : 'edit.save')}</Link>
    {/snippet}
  </Navbar>
  <LeaveGuard bind:this={guard} noun="cylinderType" {dirty} {save} leave={() => f7router.back()} />

  <div class="bc-form-surface">
    <TextField label={t('settings.cylinders.name')} bind:value={name} supporting={error || t('settings.cylinders.nameHelp')} invalid={!!error} />
    <div class="bc-cylinder-type--pair">
      <TextField label={t('settings.cylinders.volume')} bind:value={volume} inputmode="decimal" invalid={!!volumeLive.error} supporting={volumeLive.error}>
        {#snippet trailing()}<span class="bc-cylinder-type--unit">{t(cuft ? 'units.cubicFeet' : 'units.liters')}</span>{/snippet}
      </TextField>
      <TextField label={t('settings.cylinders.pressure')} bind:value={pressure} inputmode="decimal" invalid={!!pressureLive.error} supporting={pressureLive.error}>
        {#snippet trailing()}<span class="bc-cylinder-type--unit">{t(psi ? 'units.psi' : 'units.bar')}</span>{/snippet}
      </TextField>
    </div>
  </div>
  <p class="bc-cylinder-type--note bc-cylinder-type--first">{t(cuft ? 'settings.cylinders.volumeNoteCuft' : 'settings.cylinders.volumeNoteLitres')}</p>
  {#if !editing}<CylinderSizeChips {sizes} onpick={pick} />{/if}
  {#if usageNote}<p class="bc-cylinder-type--note">{usageNote}</p>{/if}

  {#if editing && type}
    {#if deletable(type)}
      <div class="bc-cylinder-type--action">
        <button type="button" class={ios ? 'bc-cylinder-type--delete-ios' : 'bc-outlined-button bc-danger bc-cylinder-type--delete'} onclick={deleteTheType}>
          {#if !ios}<Icon name="delete" size={18} />{/if}
          {t('settings.cylinders.deleteType')}
        </button>
        {#if deleteNote}<p class="bc-cylinder-type--delete-note">{deleteNote}</p>{/if}
      </div>
    {:else}
      <p class="bc-cylinder-type--note">{t('settings.cylinders.fromLogbook')}</p>
    {/if}
  {/if}
</Page>

<style>
  @layer bc.components {
    .bc-cylinder-type--pair {
      display: flex;
      gap: 16px;

      & > :global(*) {
        flex: 1;
        min-width: 0;
      }
    }

    .bc-cylinder-type--unit {
      padding-inline-end: 12px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    /* The button and the line under it start on the page margin, 16 dp, like the fields (Material 3). */
    .bc-cylinder-type--action {
      margin: 16px 16px 0;
    }

    /* The red of « Supprimer le compte » (--bc-late), not the alarm red. */
    /* iPhone: a red row of a grouped list (ios-reglages2-bouteille-vos-modifier.dc.html). */
    .bc-cylinder-type--delete-ios {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      border: none;
      border-radius: 10px;
      background: var(--bc-surface);
      color: var(--bc-alarm);
      font: inherit;
      font-size: 17px;
    }

    .bc-cylinder-type--delete {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-color: var(--bc-late);
      color: var(--bc-late-text);
    }

    .bc-cylinder-type--delete-note {
      margin: 6px 0 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }

    .bc-cylinder-type--note.bc-cylinder-type--first {
      margin-top: 4px;
      font-size: 12px;
      line-height: 16px;
    }

    .bc-cylinder-type--note {
      margin: 20px 16px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }
  }
</style>
