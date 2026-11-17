<script>
  // @ts-check
  // « Ajouter une pièce » and « Modifier la pièce » (task 2026-11-17-267): the form behind the extended button of
  // the inventory and the ✎ of a piece's sheet. The fields are checked as the diver types. A computer's serial
  // number and firmware are read at each download, so they are not typed.
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import { gear, loadInventory, change } from '../lib/inventory.svelte.js';
  import { GEAR_TYPES, gearProblems } from '../lib/inventory.js';
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
    }
  });

  const piece = $derived(gear.pieces.find((x) => x.id === id));
  const computer = $derived(type === 'computer');
  const typeOptions = $derived(GEAR_TYPES.map((value) => ({ value, label: t(`gear.inventory.type.${value}`) })));
  const problems = $derived(gearProblems({ name, purchasedOn }));
  const dateLive = liveError(
    () => purchasedOn,
    () => (problems.purchasedOn ? t('gear.pieceEdit.dateInvalid') : ''),
  );
  const canSave = $derived(!problems.name && !problems.purchasedOn && !saving && !gear.readOnly);

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      await change((inv) =>
        inv.saveGear({ id: id || undefined, type: /** @type {any} */ (type), name, brand, model, serial: computer && piece ? piece.serial : serial, purchasedOn, note }),
      );
      showSnackbar(t('gear.pieceEdit.saved'));
      f7router.back();
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

  <div class="od-piece-edit--fields">
    <SelectField label={t('gear.pieceEdit.type')} bind:value={type} options={typeOptions} disabled={!!piece?.computerModel} />
    <TextField label={t('gear.pieceEdit.name')} bind:value={name} />
    <TextField label={t('gear.pieceEdit.brand')} bind:value={brand} />
    <TextField label={t('gear.pieceEdit.model')} bind:value={model} />
    {#if computer}
      <p class="od-piece-edit--help">{t('gear.pieceEdit.readFromDownload')}</p>
    {:else}
      <TextField label={t('gear.pieceEdit.serial')} bind:value={serial} />
    {/if}
    <TextField label={t('gear.pieceEdit.purchasedOn')} bind:value={purchasedOn} inputmode="numeric" invalid={!!dateLive.error} supporting={dateLive.error || t('gear.pieceEdit.purchasedOnHint')} />
    <TextField label={t('gear.pieceEdit.note')} bind:value={note} supporting={t('gear.pieceEdit.noteHint')} />
  </div>
  <div class="od-piece-edit--bottom"></div>
</Page>

<style>
  @layer od.components {
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

    .od-piece-edit--fields {
      margin: 8px 0 0;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-piece-edit--help {
      margin: 0 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-piece-edit--bottom {
      height: 48px;
    }
  }
</style>
