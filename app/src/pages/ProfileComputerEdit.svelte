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
  import { dateHint, readTypedDate, typedDate } from '../lib/format.js';
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import DcTile from '../components/DcTile.svelte';
  import ComboField from '../components/ComboField.svelte';
  import TextField from '../components/TextField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import RetirePieceDialog from '../components/RetirePieceDialog.svelte';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { gear, loadInventory, change, readPhoto } from '../lib/inventory.svelte.js';
  import { gearProblems } from '../lib/inventory.js';
  import { getCatalog } from '../lib/dc-images.js';
  import { brandModels } from '../lib/dc-model.js';
  import { photoToDataUrl } from '../lib/photo.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { profileWide } from '../lib/profile-frame.js';
  import { ios } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  const id = f7route.params.id ?? '';
  let brand = $state('');
  let model = $state('');
  let serial = $state('');
  let purchasedOn = $state('');
  /** The typed date as YYYY-MM-DD; the text itself when it is not a date, so that it is flagged. */
  const purchasedIso = $derived(purchasedOn.trim() ? (readTypedDate(purchasedOn) ?? purchasedOn) : '');
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
      purchasedOn = typedDate(g.purchasedOn ?? '');
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

  const wide = $derived(profileWide());
  const piece = $derived(gear.pieces.find((x) => x.id === id));
  /** A computer tied to dives in the logbook keeps its serial number: the download reads it. */
  const tied = $derived(!!piece?.computerModel);
  const name = $derived([brand, model].map((s) => s.trim()).filter(Boolean).join(' ') || piece?.name || '');
  const problems = $derived(gearProblems({ name, purchasedOn: purchasedIso }));
  const dateLive = liveError(
    () => purchasedOn,
    () => (problems.purchasedOn ? t('gear.pieceEdit.dateInvalid', { example: typedDate('2026-11-17') }) : ''),
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
          purchasedOn: purchasedIso,
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

  /** « Retirer de l'équipement » (task 2026-11-19-308): the piece keeps its history and its dives. @param {'sold'|'lost'|'worn'|undefined} reason */
  async function retire(reason) {
    confirmDelete = false;
    try {
      await change((inv) => inv.retireGear(id, reason));
      showSnackbar(t('gear.retire.done'));
      f7router.back('/profile/gear', { force: true });
    } catch {
      showSnackbar(t('gear.inventory.readOnlyRefused'));
    }
  }
</script>

{#snippet generic()}
  <span class="od-computer-edit--generic" aria-hidden="true"><Icon name="wristComputer" size={96} weight={1.4} /></span>
{/snippet}

<!-- The image: Android phone, a white 192 box around the 160 photo; iPhone 176; a wide screen 160. The diver's own
     photo wins over the catalog's (docs/architecture.md, section 12). -->
{#snippet picture()}
  {@const px = ios ? 176 : 160}
  <div class="od-computer-edit--picture" class:od-computer-edit--picture-box={!ios && !wide} role="img" aria-label={t('gear.computerEdit.imageLabel')}>
    <DcTile model={catalogModel} size={px} radius={16} photo={photoUrl} fallback={generic} />
  </div>
{/snippet}

{#snippet changeImage()}
  <button type="button" class="od-computer-edit--change" onclick={() => fileInput?.click()}>
    {#if !ios}<Icon name="camera" size={20} />{/if}{t('gear.computerEdit.changeImage')}
  </button>
  {#if photoUrl}
    <button type="button" class="od-computer-edit--remove-photo" onclick={removePhoto}>{t('gear.computerEdit.removeImage')}</button>
    <p class="od-computer-edit--photo-note">{t('gear.computerEdit.photoNote')}</p>
  {/if}
  <input bind:this={fileInput} class="od-computer-edit--file" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={pickPhoto} />
{/snippet}

{#snippet fields()}
  <ComboField label={t('gear.pieceEdit.brand')} bind:value={brand} options={lists.vendors} />
  <ComboField label={t('gear.pieceEdit.model')} bind:value={model} options={lists.modelsOf(brand)} />
  {#if tied}
    <TextField label={t('gear.pieceEdit.serial')} value={serial} disabled supporting={t('gear.pieceEdit.readFromDownload')} />
  {:else}
    <TextField label={t('gear.pieceEdit.serial')} bind:value={serial} supporting={t('gear.pieceNew.serialHintComputer')} />
  {/if}
  <TextField label={t('gear.pieceEdit.purchasedOn')} bind:value={purchasedOn} inputmode="numeric" invalid={!!dateLive.error} supporting={dateLive.error || dateHint()} />
  <div class="od-computer-edit--wide-note"><TextField label={t('gear.pieceEdit.note')} bind:value={note} supporting={t('gear.computerEdit.noteHint')} /></div>
{/snippet}

<!-- iPhone and iPad: grouped lists, label on the left, the value typed on the right (docs/mockups/ios-profil-piece-modifier.dc.html). -->
{#snippet iosFields()}
  <div class="od-computer-edit--group" role="list">
    <label class="od-computer-edit--ios-row"><span>{t('gear.pieceEdit.brand')}</span><input list="od-computer-edit-brands" bind:value={brand} autocomplete="off" autocapitalize="words" /></label>
    <label class="od-computer-edit--ios-row"><span>{t('gear.pieceEdit.model')}</span><input list="od-computer-edit-models" bind:value={model} autocomplete="off" autocapitalize="words" /></label>
  </div>
  <datalist id="od-computer-edit-brands">{#each lists.vendors as v (v)}<option value={v}></option>{/each}</datalist>
  <datalist id="od-computer-edit-models">{#each lists.modelsOf(brand) as m (m)}<option value={m}></option>{/each}</datalist>
  <p class="od-computer-edit--ios-footer">{t('gear.computerEdit.suggestHint')}</p>
  <div class="od-computer-edit--group" role="list">
    <label class="od-computer-edit--ios-row"><span>{t('gear.computerEdit.serialShort')}</span><input bind:value={serial} disabled={tied} /></label>
    <label class="od-computer-edit--ios-row"><span>{t('gear.pieceEdit.purchasedOn')}</span><input bind:value={purchasedOn} inputmode="numeric" placeholder={dateHint()} aria-invalid={dateLive.error ? 'true' : undefined} /></label>
    <label class="od-computer-edit--ios-row"><span>{t('gear.computerEdit.noteShort')}</span><input bind:value={note} placeholder={t('gear.computerEdit.optional')} /></label>
  </div>
  {#if dateLive.error}<p class="od-computer-edit--ios-footer od-computer-edit--ios-error">{dateLive.error}</p>{/if}
  {#if tied}<p class="od-computer-edit--ios-footer">{t('gear.pieceEdit.readFromDownload')}</p>{/if}
{/snippet}

{#snippet deleteButton()}
  <button type="button" class="od-computer-edit--delete-button" disabled={gear.readOnly} onclick={() => (confirmDelete = true)}>
    {#if !ios}<Icon name="archive" size={20} />{/if}{t('gear.retire.button')}
  </button>
{/snippet}

{#snippet body()}
  <ReadOnlyNotice />
  <h1 class="od-computer-edit--title">{t('gear.computerEdit.title')}</h1>

  {#if wide}
    <!-- Tablet and desktop: the dialog of « Nouvelle pièce »; the image on the left, the fields in two columns. -->
    <div class="od-computer-edit--wide">
      <div class="od-computer-edit--image">{@render picture()}{@render changeImage()}</div>
      {#if ios}
        <div class="od-computer-edit--ios-column">{@render iosFields()}</div>
      {:else}
        <div class="od-computer-edit--fields od-computer-edit--fields-wide">{@render fields()}</div>
      {/if}
    </div>
    <div class="od-computer-edit--delete od-computer-edit--delete-wide">{@render deleteButton()}</div>
  {:else}
    <div class="od-computer-edit--image">{@render picture()}{@render changeImage()}</div>
    {#if ios}
      <div class="od-computer-edit--ios-column">{@render iosFields()}</div>
      <div class="od-computer-edit--group od-computer-edit--group-delete">{@render deleteButton()}</div>
    {:else}
      <div class="od-computer-edit--fields">{@render fields()}</div>
      <div class="od-computer-edit--delete">{@render deleteButton()}</div>
    {/if}
  {/if}
  <div class="od-computer-edit--bottom"></div>
{/snippet}

<Page class="od-computer-edit{ios ? ' od-computer-edit--ios' : ''}">
  <Navbar>
    {#snippet left()}
      {#if ios}
        <a href="#close" class="link external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>{t('gear.retire.cancel')}</a>
      {:else}
        <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
          <Icon name="close" /><span class="od-sr-only">{t('gear.pieceEdit.close')}</span>
        </a>
      {/if}
    {/snippet}
    {#snippet right()}
      {#if ios}
        <button type="button" class="od-computer-edit--ios-ok" disabled={!canSave} onclick={save}>{t('gear.computerEdit.ok')}</button>
      {:else}
        <button type="button" class="od-computer-edit--save" disabled={!canSave} onclick={save}>{t('gear.pieceEdit.save')}</button>
      {/if}
    {/snippet}
  </Navbar>
  {#if wide}
    <ProfileFrame section="gear" list="gear" selected={id} bar="dialog" size="l">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

{#if confirmDelete && piece}
  <RetirePieceDialog name={piece.name} computer oncancel={() => (confirmDelete = false)} onconfirm={retire} />
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
      width: 160px;
      height: 160px;
      border-radius: 16px;
      overflow: hidden;
    }

    /* Android phone: the 160 photo on a white 192 box with 28 dp corners. */
    .od-computer-edit--picture-box {
      width: 192px;
      height: 192px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-photo-ground);
    }

    :global(.ios) .od-computer-edit--picture {
      width: 176px;
      height: 176px;
    }

    .od-computer-edit--generic {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-selected-container);
      color: var(--od-secondary);
    }

    :global(.ios) .od-computer-edit--change {
      height: 44px;
      padding: 0 12px;
      border: none;
      font-size: 17px;
      font-weight: 400;
    }

    .od-computer-edit--wide {
      margin: 8px 24px 0;
      display: flex;
      gap: 20px;
      align-items: flex-start;

      .od-computer-edit--image {
        margin: 0;
        flex: none;
        width: 160px;
      }
    }

    .od-computer-edit--fields-wide {
      margin: 0;
      flex: 1;
      min-width: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;

      .od-computer-edit--wide-note {
        grid-column: 1 / 3;
      }
    }

    .od-computer-edit--delete-wide {
      margin: 20px 24px 0;
      justify-content: flex-start;
    }

    /* Outlined, not red: retiring keeps the history (task 2026-11-19-308). */
    .od-computer-edit--delete-button {
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

    .od-computer-edit--delete-button:disabled {
      opacity: 0.38;
    }

    /* iPhone and iPad: grouped lists (10 pt corners, 44 pt rows, hairlines), footers in grey 13 pt. */
    .od-computer-edit--ios-column {
      margin: 8px 16px 0;
    }

    .od-computer-edit--group {
      margin-top: 16px;
      border-radius: 10px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-computer-edit--ios-column > .od-computer-edit--group:first-child {
      margin-top: 0;
    }

    .od-computer-edit--ios-row {
      min-height: 44px;
      padding: 6px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 17px;
      color: var(--od-text);

      > span {
        flex: none;
        width: 120px;
      }

      > input {
        flex: 1;
        min-width: 0;
        width: auto;
        height: 32px;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--od-text);
        font: inherit;
        text-align: start;
      }

      > input:disabled {
        color: var(--od-text-2);
      }

      > input::placeholder {
        color: var(--od-text-3, #C7C7CC);
      }

      + .od-computer-edit--ios-row {
        border-top: 0.5px solid var(--od-row-divider);
        margin-inline-start: 16px;
        padding-inline-start: 0;
      }
    }

    .od-computer-edit--ios-footer {
      margin: 6px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-computer-edit--ios-error {
      color: var(--od-alarm);
    }

    .od-computer-edit--ios-ok {
      width: auto;
      height: 44px;
      padding: 0 8px;
      border: none;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
    }

    .od-computer-edit--ios-ok:disabled {
      opacity: 0.38;
    }

    .od-computer-edit--group-delete {
      margin: 24px 16px 0;

      .od-computer-edit--delete-button {
        width: 100%;
        height: 44px;
        border-radius: 0;
        justify-content: center;
        font-size: 17px;
        font-weight: 400;
        border: none;
        color: var(--od-secondary);
      }
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

      button:disabled {
        opacity: 0.38;
      }
    }

    .od-computer-edit--bottom {
      height: calc(24px + var(--od-safe-bottom));
    }
  }
</style>
