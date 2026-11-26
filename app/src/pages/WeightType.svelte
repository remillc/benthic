<script>
  // @ts-check
  // Page of a weight type (Settings › Équipement › Types de lest): its name and its usual weight, the weight offered when
  // the type is added to a dive. A type the diver added is renamed or removed here; a type of Subsurface or of the
  // logbook's dives keeps its name (renaming it in every dive is not offered yet), and only its usual weight is the diver's.
  // The diver's types and usual weights are files of the account data (lib/weight-types.svelte.js), synced.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import LeaveGuard from '../components/LeaveGuard.svelte';
  import { isDirty } from '../lib/leave-guard.js';
  import { t } from '../lib/i18n.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { addWeightType, readWeightTypeRows, removeWeightType, saveWeightType } from '../lib/weight-types.svelte.js';
  import { weightPlaceName } from '../lib/desktop-detail.js';
  import { parseTyped, weightText } from '../lib/desktop-edit.js';
  import { formatWeight } from '../lib/format.js';
  import { ios } from '../lib/layout.svelte.js';

  /** @type {{ f7route: { query: { name?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();
  // svelte-ignore state_referenced_locally
  const original = f7route.query?.name ?? '';
  const editing = !!original;

  const G_PER_LB = 453.59237;
  const pounds = $derived(logbook.prefs.weight === 'lbs');
  const max = $derived(pounds ? 400 : 200);
  const unit = $derived(t(pounds ? 'units.pounds' : 'units.kilograms'));

  /** @type {import('../lib/weight-type-files.js').WeightTypeRow|null} */
  let type = $state(null);
  /** The weight the core last saw for this type, when the diver gave it none. */
  let lastUsedGrams = $state(0);
  let name = $state(original);
  let weight = $state('');
  let error = $state('');
  let saving = $state(false);

  const values = () => ({ name, weight });
  let opened = $state(/** @type {unknown} */ (editing ? null : values()));
  const dirty = () => opened !== null && isDirty(opened, values());
  let guard = /** @type {LeaveGuard|undefined} */ (undefined);

  onMount(async () => {
    if (!editing) return;
    try {
      type = (await readWeightTypeRows()).find((ty) => ty.name === original) ?? null;
      if (!type) return;
      if (type.fileId) weight = weightText(type.grams, logbook.prefs);
      else lastUsedGrams = type.grams;
    } catch (e) {
      console.error('Reading the weight type', e);
    }
    opened = values();
  });

  // Checked as the diver types.
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

  /** @param {unknown} e */
  function failure(e) {
    if (String(/** @type {any} */ (e)?.message ?? e).includes('NAME_IN_USE')) error = t('settings.weights.nameInUse');
    else {
      console.error('Saving the weight type', e);
      showSnackbar(t('settings.error'));
    }
  }

  const nameLocked = $derived(editing && !!type?.inLogbook);

  async function save() {
    const g = grams();
    if (g === null) return;
    const trimmed = name.trim();
    if (!nameLocked && !trimmed) {
      error = t('settings.weights.nameMissing');
      return;
    }
    saving = true;
    try {
      if (!editing || !type) await addWeightType({ name: trimmed, grams: g });
      else if (type.inLogbook && !weight.trim()) {
        // No usual weight: the type goes back to the weight last used.
        await removeWeightType(type);
      } else await saveWeightType(type, { name: trimmed, grams: g });
      f7router.back();
    } catch (e) {
      failure(e);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!type) return;
    try {
      await removeWeightType(type);
      f7router.back();
    } catch (e) {
      failure(e);
    }
  }
</script>

<Page class="bc-weight-type">
  <Navbar title={editing ? t('settings.weights.editTitle') : t('settings.weights.newTitle')}>
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
  <LeaveGuard bind:this={guard} noun="weightType" {dirty} {save} leave={() => f7router.back()} />

  <div class="bc-form-surface">
    {#if nameLocked}
      <TextField label={t('settings.weights.name')} value={weightPlaceName(original)} disabled supporting={t('settings.weights.fromLogbook')} />
    {:else}
      <TextField label={t('settings.weights.name')} bind:value={name} supporting={error || t('settings.weights.nameHelp')} invalid={!!error} />
    {/if}
    <TextField label={t('settings.weights.usual')} bind:value={weight} inputmode="decimal" invalid={!!weightLive.error}
      supporting={weightLive.error || (lastUsedGrams && !weight.trim() ? t('settings.weights.lastUsed', { weight: formatWeight(lastUsedGrams, logbook.prefs) }) : t('settings.weights.usualHelp'))}>
      {#snippet trailing()}<span class="bc-weight-type--unit">{unit}</span>{/snippet}
    </TextField>
  </div>

  {#if editing && type && !type.inLogbook}
    <div class="bc-weight-type--action">
      <button type="button" class={ios ? 'bc-weight-type--delete-ios' : 'bc-outlined-button bc-danger bc-weight-type--delete'} onclick={remove}>
        {#if !ios}<Icon name="delete" size={18} />{/if}
        {t('settings.weights.deleteType')}
      </button>
    </div>
  {/if}
</Page>

<style>
  @layer bc.components {
    .bc-weight-type--unit {
      padding-inline-end: 12px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-weight-type--action {
      margin: 16px 16px 0;
    }

    /* iPhone: a red row of a grouped list, as for a cylinder type. */
    .bc-weight-type--delete-ios {
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

    .bc-weight-type--delete {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-color: var(--bc-late);
      color: var(--bc-late-text);
    }
  }
</style>
