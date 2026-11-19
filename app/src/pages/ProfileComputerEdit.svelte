<script>
  // @ts-check
  // « Modifier l’ordinateur de plongée » (task 2026-11-19-303, docs/mockups/profil-piece-modifier-android.dc.html):
  // edits one dive computer of the equipment inventory (OpenDives+). Opens from the pencil of the piece's page. The
  // type cannot change, so there is no type field; a large image (the diver's own photo, else the catalog photo of
  // the model, else the generic drawing) and « Changer d’image »; Marque and Modèle are text fields with
  // suggestions from libdivecomputer's names (any other text can be typed; changing the brand clears the model);
  // Numéro de série, Date d’achat, Notes and « Supprimer la pièce ». No maintenance reminder for a computer.
  // The diver’s photo belongs to this piece: it is kept in the inventory (account data, compressed), never added to
  // the shared catalog of computer images (docs/architecture.md, section 12).
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import DcTile from '../components/DcTile.svelte';
  import ComboField from '../components/ComboField.svelte';
  import TextField from '../components/TextField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import Md3Dialog from '../components/Md3Dialog.svelte';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { gear, loadInventory, change, readPhoto } from '../lib/inventory.svelte.js';
  import { gearProblems } from '../lib/inventory.js';
  import { getCatalog } from '../lib/dc-images.js';
  import { brandModels } from '../lib/dc-model.js';
  import { photoToDataUrl } from '../lib/photo.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { profileWide } from '../lib/profile-frame.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  const id = f7route.params.id ?? '';
  let brand = $state('');
  let model = $state('');
  let serial = $state('');
  let purchasedOn = $state('');
  let note = $state('');
  let saving = $state(false);
  let confirmDelete = $state(false);
  /** The diver's own photo: a data URL to show, and the file already kept in the inventory. */
  let photoUrl = $state('');
  let photoId = $state('');
  let photoChanged = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();
  /** The brand the model list follows; null until the piece is read, so loading does not clear the model. @type {string|null} */
  let followed = $state(null);
  let lists = $state(brandModels([], []));

  onMount(async () => {
    await loadInventory();
    const g = gear.pieces.find((x) => x.id === id);
    if (g) {
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
    followed = brand;
    const [bluetooth, catalog] = await Promise.all([
      OpenDivesCore.bluetoothModels().catch(() => []),
      getCatalog().catch(() => []),
    ]);
    lists = brandModels(bluetooth, catalog);
  });

  // Changing the brand clears the model: the model list follows the brand.
  $effect(() => {
    const now = brand;
    if (followed === null || now === followed) return;
    followed = now;
    model = '';
  });

  const piece = $derived(gear.pieces.find((x) => x.id === id));
  /** A computer tied to dives in the logbook keeps its serial number: the download reads it. */
  const tied = $derived(!!piece?.computerModel);
  const name = $derived([brand, model].map((s) => s.trim()).filter(Boolean).join(' ') || piece?.name || '');
  const problems = $derived(gearProblems({ name, purchasedOn }));
  const dateLive = liveError(
    () => purchasedOn,
    () => (problems.purchasedOn ? t('gear.pieceEdit.dateInvalid') : ''),
  );
  const canSave = $derived(!problems.name && !problems.purchasedOn && !saving && !gear.readOnly);
  /** The text the catalog is searched with: brand and model as typed. */
  const catalogModel = $derived([brand, model].map((s) => s.trim()).filter(Boolean).join(' ') || piece?.computerModel || '');

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

  async function save() {
    if (!canSave || !piece) return;
    saving = true;
    try {
      await change(async (inv) => {
        let nextPhoto = photoId;
        if (photoChanged) nextPhoto = photoUrl ? await inv.savePhoto(photoUrl) : '';
        return inv.saveGear({
          id,
          type: 'computer',
          name,
          brand,
          model,
          serial: tied ? piece.serial : serial,
          purchasedOn,
          note,
          photoId: nextPhoto || undefined,
        });
      });
      showSnackbar(t('gear.pieceEdit.saved'));
      f7router.back();
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'gear.inventory.saveFailed'));
    } finally {
      saving = false;
    }
  }

  async function remove() {
    confirmDelete = false;
    try {
      await change((inv) => inv.deleteGear(id));
      showSnackbar(t('gear.piece.deleted'));
      f7router.back('/profile/gear', { force: true });
    } catch {
      showSnackbar(t('gear.inventory.readOnlyRefused'));
    }
  }
</script>

{#snippet generic()}
  <span class="od-computer-edit--generic" aria-hidden="true"><Icon name="wristComputer" size={96} weight={1.4} /></span>
{/snippet}

{#snippet body()}
  <ReadOnlyNotice />
  <h1 class="od-computer-edit--title">{t('gear.computerEdit.title')}</h1>

  <div class="od-computer-edit--image">
    <div class="od-computer-edit--picture" role="img" aria-label={t('gear.computerEdit.imageLabel')}>
      <DcTile model={catalogModel} size={192} radius={28} photo={photoUrl} fallback={generic} />
    </div>
    <button type="button" class="od-computer-edit--change" onclick={() => fileInput?.click()}>
      <Icon name="camera" size={20} />{t('gear.computerEdit.changeImage')}
    </button>
    {#if photoUrl}
      <button type="button" class="od-computer-edit--remove-photo" onclick={removePhoto}>{t('gear.computerEdit.removeImage')}</button>
      <p class="od-computer-edit--photo-note">{t('gear.computerEdit.photoNote')}</p>
    {/if}
    <input bind:this={fileInput} class="od-computer-edit--file" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={pickPhoto} />
  </div>

  <div class="od-computer-edit--fields">
    <ComboField label={t('gear.pieceEdit.brand')} bind:value={brand} options={lists.vendors} />
    <ComboField label={t('gear.pieceEdit.model')} bind:value={model} options={lists.modelsOf(brand)} />
    {#if tied}
      <TextField label={t('gear.pieceEdit.serial')} value={serial} disabled supporting={t('gear.pieceEdit.readFromDownload')} />
    {:else}
      <TextField label={t('gear.pieceEdit.serial')} bind:value={serial} supporting={t('gear.pieceNew.serialHint')} />
    {/if}
    <TextField label={t('gear.pieceEdit.purchasedOn')} bind:value={purchasedOn} inputmode="numeric" invalid={!!dateLive.error} supporting={dateLive.error || t('gear.pieceEdit.purchasedOnHint')} />
    <TextField label={t('gear.pieceEdit.note')} bind:value={note} supporting={t('gear.computerEdit.noteHint')} />
  </div>

  <div class="od-computer-edit--delete">
    <button type="button" disabled={gear.readOnly} onclick={() => (confirmDelete = true)}>
      <Icon name="delete" size={20} />{t('gear.computerEdit.delete')}
    </button>
  </div>
  <div class="od-computer-edit--bottom"></div>
{/snippet}

<Page class="od-computer-edit">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="od-sr-only">{t('gear.pieceEdit.close')}</span>
      </a>
    {/snippet}
    {#snippet right()}
      <button type="button" class="od-computer-edit--save" disabled={!canSave} onclick={save}>{t('gear.pieceEdit.save')}</button>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="gear" list="gear" selected={id} bar="dialog" size="l">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

{#if confirmDelete && piece}
  <Md3Dialog title={t('gear.piece.deleteTitle')} text={t('gear.piece.deleteText', { name: piece.name })} role="alertdialog" oncancel={() => (confirmDelete = false)}>
    <span></span>
    {#snippet actions()}
      <button type="button" onclick={() => (confirmDelete = false)}>{t('gear.addSheet.cancel')}</button>
      <button type="button" onclick={remove}>{t('gear.piece.delete')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    :global(.od-computer-edit .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-computer-edit--save {
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

    .od-computer-edit--save:disabled {
      opacity: 0.38;
    }

    .od-computer-edit--title {
      margin: 4px 20px 0;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      text-wrap: balance;
      color: var(--od-text);
    }

    .od-computer-edit--image {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .od-computer-edit--picture {
      width: 192px;
      height: 192px;
      border-radius: 28px;
      overflow: hidden;
    }

    .od-computer-edit--generic {
      width: 192px;
      height: 192px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-selected-container);
      color: var(--od-secondary);
    }

    .od-computer-edit--change {
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

    .od-computer-edit--remove-photo {
      height: 40px;
      padding: 0 16px;
      border: none;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-computer-edit--photo-note {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      text-align: center;
    }

    .od-computer-edit--file {
      display: none;
    }

    .od-computer-edit--fields {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .od-computer-edit--delete {
      margin: 24px 16px 0;
      display: flex;
      justify-content: center;

      button {
        height: 48px;
        padding: 0 20px;
        border: none;
        border-radius: 24px;
        background: transparent;
        color: var(--od-alarm);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      button:disabled {
        opacity: 0.38;
      }
    }

    .od-computer-edit--bottom {
      height: calc(24px + var(--od-safe-bottom));
    }
  }
</style>
