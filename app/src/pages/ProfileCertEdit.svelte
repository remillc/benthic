<script>
  // @ts-check
  // « Nouveau brevet » and « Modifier le brevet » (task 2026-11-18-272, docs/mockups-release/profil-brevet-nouveau-android.dc.html):
  // two photo slots (recto, verso), then Agence and Niveau (free text with suggestions),
  // Numéro, Date and Moniteur (optional). The slots call `scanCard` (lib/card-scan.js): today the image picker, later the
  // phone's document scanner with text recognition; the text it returns proposes the agency, level and number, which the
  // diver checks. The photos stay on the device (sealed); nothing is sent. The fields are checked as the diver types.
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import DateField from '../components/DateField.svelte';
  import SwitchField from '../components/SwitchField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import { services, changeProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { LEVEL_SUGGESTIONS, certificationProblems } from '../lib/profile.js';
  import { certAgencyOptions, certAgencySelection, certAgencyText } from '../lib/cert-agencies.js';
  import { scanCard, parseCardText, joinTexts } from '../lib/card-scan.js';
  import { toJpegBytes, scanJpegBytes, photoUrl } from '../lib/card-canvas.js';
  import PhotoBusy from '../components/PhotoBusy.svelte';
  import CardPhotoDialog from '../components/CardPhotoDialog.svelte';
  import { desktopApp } from '../lib/layout.svelte.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { language, t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();
  const id = f7route.params.id ?? '';

  let agencyText = $state('');
  let originalAgency = $state({ agency: '', text: '' });
  let level = $state('');
  let number = $state('');
  let issuedOn = $state('');
  let instructor = $state('');
  /** « Brevet de moniteur »: its number is used when the diver confirms another diver's dive (task 2026-11-19-309). */
  let instructorCert = $state(false);
  let saving = $state(false);
  /** What the scan filled in, to mark it « Lu sur la carte » while the field still holds it. */
  let readFrom = $state({ agency: '', level: '', number: '', issuedOn: '', instructor: '' });
  /** The text read on each side, to read both together. */
  const cardTexts = { front: '', back: '' };
  /** The photos: `bytes` is set when changed here (null: removed), `url` is what is shown. @type {Record<'front'|'back', { bytes?: Uint8Array|null, url: string }>} */
  let photos = $state({ front: { url: '' }, back: { url: '' } });
  /** A picture is being read, shrunk and sealed: the slot shows its progress indicator and the card cannot be saved yet. */
  let busy = $state({ front: false, back: false });

  onMount(async () => {
    await loadInventory();
    if (!id) return;
    const c = await services().profile.getCertification(id);
    if (!c) return;
    agencyText = certAgencyText(c.agency, c.agencyName, agencyOptions);
    originalAgency = { agency: c.agency, text: agencyText };
    level = c.level;
    number = c.number;
    issuedOn = c.issuedOn;
    instructor = c.instructor;
    instructorCert = c.instructorCert;
    for (const d of c.documents) {
      const bytes = await services().profile.readPhoto(c.id, d.hash);
      if (bytes) photos[d.side] = { url: photoUrl(bytes) };
    }
  });
  onDestroy(() => Object.values(photos).forEach((p) => p.url && URL.revokeObjectURL(p.url)));

  const agencyOptions = certAgencyOptions(language);
  const selectedAgency = $derived(certAgencySelection(agencyText, agencyOptions, originalAgency));
  const agency = $derived(selectedAgency.agency);
  const suggestions = $derived(LEVEL_SUGGESTIONS[agency] ?? []);
  const problems = $derived(certificationProblems({ agency, level, number, issuedOn }));
  const dateLive = liveError(
    () => issuedOn,
    () => (problems.issuedOn ? t('diverProfile.cert.dateFuture') : ''),
  );
  const mark = (/** @type {'agency'|'level'|'number'|'issuedOn'|'instructor'} */ field, /** @type {string} */ value) => (readFrom[field] && readFrom[field] === value ? t('diverProfile.cert.readMark') : '');
  const canSave = $derived(!Object.keys(problems).length && !saving && !busy.front && !busy.back && !gear.readOnly);

  /** The side whose photo the desktop's dialog is asking for (a computer has no camera nor scanner). @type {'front'|'back'|null} */
  let photoDialog = $state(null);

  /** The straightened card from the desktop's dialog. @param {'front'|'back'} side @param {Blob} image */
  async function useDesktopPhoto(side, image) {
    photoDialog = null;
    busy[side] = true;
    try {
      const bytes = await toJpegBytes(image);
      if (photos[side].url) URL.revokeObjectURL(photos[side].url);
      photos[side] = { bytes, url: photoUrl(bytes) };
    } catch {
      showSnackbar(t('diverProfile.cert.photoFailed'));
    } finally {
      busy[side] = false;
    }
  }

  /** @param {'front'|'back'} side */
  async function pick(side) {
    if (desktopApp) {
      photoDialog = side;
      return;
    }
    busy[side] = true;
    try {
      const scanned = await scanCard(side);
      if (!scanned) return;
      // The picture shows at once, from the file as it came; the shrunk, sealed copy replaces it when ready.
      const before = photos[side].url;
      photos[side] = { ...photos[side], url: URL.createObjectURL(scanned.image) };
      if (before) URL.revokeObjectURL(before);
      const bytes = await scanJpegBytes(scanned.image);
      URL.revokeObjectURL(photos[side].url);
      photos[side] = { bytes, url: photoUrl(bytes) };
      // The text of both sides proposes what the diver has not typed: a field that still holds an earlier proposal may be replaced by a better one.
      cardTexts[side] = scanned.text;
      const found = parseCardText(joinTexts(cardTexts.front, cardTexts.back));
      /** @param {'agency'|'level'|'number'|'issuedOn'|'instructor'} field @param {string} current */
      const free = (field, current) => !current.trim() || (readFrom[field] !== '' && readFrom[field] === current);
      if (found.agency && free('agency', agencyText)) {
        agencyText = certAgencyText(found.agency, found.agencyName, agencyOptions);
        readFrom.agency = agencyText;
      }
      if (found.level && free('level', level)) readFrom.level = level = found.level;
      if (found.number && free('number', number)) readFrom.number = number = found.number;
      if (found.issuedOn && free('issuedOn', issuedOn)) readFrom.issuedOn = issuedOn = found.issuedOn;
      if (found.instructor && free('instructor', instructor)) readFrom.instructor = instructor = found.instructor;
    } catch {
      showSnackbar(t('diverProfile.cert.photoFailed'));
    } finally {
      busy[side] = false;
    }
  }

  /** @param {'front'|'back'} side */
  function remove(side) {
    if (photos[side].url) URL.revokeObjectURL(photos[side].url);
    photos[side] = { bytes: null, url: '' };
  }

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      await changeProfile((p) =>
        p.saveCertification({
          id: id || undefined,
          agency,
          agencyName: selectedAgency.agencyName,
          level,
          number,
          issuedOn,
          instructor,
          instructorCert,
          photos: { ...(photos.front.bytes !== undefined ? { front: photos.front.bytes } : {}), ...(photos.back.bytes !== undefined ? { back: photos.back.bytes } : {}) },
        }),
      );
      showSnackbar(t('diverProfile.cert.saved'));
      f7router.back();
    } catch {
      showSnackbar(t('diverProfile.cert.saveFailed'));
    } finally {
      saving = false;
    }
  }
</script>

{#snippet slot(/** @type {'front'|'back'} */ side)}
  <div class="bc-cert-edit--slot">
    {#if photos[side].url}
      <div class="bc-cert-edit--slot-thumb"><img src={photos[side].url} alt="" />{#if busy[side]}<PhotoBusy />{/if}</div>
      <button type="button" class="bc-cert-edit--slot-remove" onclick={() => remove(side)} aria-label={t('diverProfile.cert.photoRemove')}><Icon name="close" size={18} /></button>
      <span class="bc-cert-edit--slot-caption">
        <span>{side === 'front' ? t('diverProfile.cert.sideFront') : t('diverProfile.cert.sideBack')}</span>
        <button type="button" class="bc-cert-edit--slot-replace" onclick={() => pick(side)} disabled={gear.readOnly || busy[side]}>{t('diverProfile.cert.photoReplace')}</button>
      </span>
    {:else}
      <button type="button" class="bc-cert-edit--slot-button" onclick={() => pick(side)} disabled={gear.readOnly || busy[side]}>
        <Icon name="camera" size={28} weight={1.6} />
        <span class="bc-cert-edit--slot-label">{side === 'front' ? t('diverProfile.cert.photoFront') : t('diverProfile.cert.photoBack')}</span>
        {#if busy[side]}<PhotoBusy />{/if}
      </button>
    {/if}
  </div>
{/snippet}

{#snippet body()}

  <ReadOnlyNotice />

  <div class="bc-cert-edit--slots">
    {@render slot('front')}
    {@render slot('back')}
  </div>
  <p class="bc-cert-edit--hint">{t('diverProfile.cert.photoHint')}</p>

  <div class="bc-cert-edit--fields">
    <ComboField label={t('diverProfile.cert.agency')} bind:value={agencyText} options={agencyOptions.map((o) => o.label)} supporting={mark('agency', agencyText)} />
    <ComboField label={t('diverProfile.cert.level')} bind:value={level} options={suggestions} supporting={mark('level', level)} />
    <TextField label={t('diverProfile.cert.number')} bind:value={number} supporting={mark('number', number) || t('diverProfile.cert.numberHint')} />
    <DateField label={t('diverProfile.cert.date')} bind:value={issuedOn} maxYear={new Date().getFullYear()} supporting={dateLive.error || mark('issuedOn', issuedOn)} />
    <TextField label={t('diverProfile.cert.instructor')} bind:value={instructor} supporting={mark('instructor', instructor) || t('diverProfile.cert.instructorHint')} />
    <SwitchField label={t('diverProfile.cert.instructorCert')} bind:checked={instructorCert} supporting={t('diverProfile.cert.instructorCertText')} />
  </div>
  <div class="bc-cert-edit--bottom"></div>
{/snippet}

<Page class="bc-cert-edit">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="bc-sr-only">{t('diverProfile.cert.close')}</span>
      </a>
    {/snippet}
    {#snippet title()}{id ? t('diverProfile.cert.edit') : t('diverProfile.cert.new')}{/snippet}
    {#snippet right()}
      <button type="button" class="bc-cert-edit--save" disabled={!canSave} onclick={save}>{t('diverProfile.cert.save')}</button>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="certs" bar="dialog" size="l">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

{#if photoDialog}
  {@const side = photoDialog}
  <CardPhotoDialog {side} oncancel={() => (photoDialog = null)} onuse={(image) => useDesktopPhoto(side, image)} />
{/if}

<style>
  @layer od.components {
    :global(.bc-cert-edit .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-cert-edit--save {
      height: 40px;
      margin-inline-end: 8px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-cert-edit--save:disabled {
      opacity: 0.38;
    }

    .bc-cert-edit--slots {
      margin: 8px 16px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .bc-cert-edit--slot {
      position: relative;
    }

    .bc-cert-edit--slot-button {
      position: relative;
      width: 100%;
      aspect-ratio: 85.6 / 54;
      border: 1.5px dashed var(--bc-release-field-border);
      border-radius: 16px;
      background: var(--bc-surface);
      color: var(--bc-text-2);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font: inherit;
    }

    .bc-cert-edit--slot-thumb {
      position: relative;
      aspect-ratio: 85.6 / 54;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
    }

    .bc-cert-edit--slot-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .bc-cert-edit--slot-caption {
      margin-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-cert-edit--slot-replace {
      padding: 0;
      border: none;
      background: none;
      color: var(--bc-primary);
      font: inherit;
      font-weight: 600;
    }

    .bc-cert-edit--slot-label {
      position: relative;
      font-size: 13px;
      line-height: 18px;
      font-weight: 500;
    }

    .bc-cert-edit--slot-remove {
      position: absolute;
      top: 6px;
      inset-inline-end: 6px;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 16px;
      background: var(--bc-surface);
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-cert-edit--hint {
      margin: 8px 32px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* The switch sits on the margin of the text fields (16 dp page + 16 dp field). */
    .bc-cert-edit--fields > :global(.bc-switch-field) {
      margin-inline: 16px;
    }

    .bc-cert-edit--fields {
      margin-top: 16px;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-cert-edit--bottom {
      height: 48px;
    }
  }
</style>
