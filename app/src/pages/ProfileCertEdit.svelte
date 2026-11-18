<script>
  // @ts-check
  // « Nouveau brevet » and « Modifier le brevet » (task 2026-11-18-272, docs/mockups-release/profil-brevet-nouveau-android.dc.html):
  // two photo slots (recto, verso), then Agence (a menu), Niveau (free text with the agency's levels as suggestions),
  // Numéro, Date and Moniteur (optional). The slots call `scanCard` (lib/card-scan.js): today the image picker, later the
  // phone's document scanner with text recognition; the text it returns proposes the agency, level and number, which the
  // diver checks. The photos stay on the device (sealed); nothing is sent. The fields are checked as the diver types.
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import DateField from '../components/DateField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import { services, changeProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { AGENCIES, LEVEL_SUGGESTIONS, certificationProblems } from '../lib/profile.js';
  import { scanCard, parseCardText } from '../lib/card-scan.js';
  import { toJpegBytes, photoUrl } from '../lib/card-canvas.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();
  const id = f7route.params.id ?? '';

  let agency = $state('');
  let agencyName = $state('');
  let level = $state('');
  let number = $state('');
  let issuedOn = $state('');
  let instructor = $state('');
  let saving = $state(false);
  /** What the scan filled in, to mark it « Lu sur la carte » while the field still holds it. */
  let readFrom = $state({ agency: '', level: '', number: '', issuedOn: '' });
  /** The photos: `bytes` is set when changed here (null: removed), `url` is what is shown. @type {Record<'front'|'back', { bytes?: Uint8Array|null, url: string }>} */
  let photos = $state({ front: { url: '' }, back: { url: '' } });

  onMount(async () => {
    await loadInventory();
    if (!id) return;
    const c = await services().profile.getCertification(id);
    if (!c) return;
    agency = c.agency;
    agencyName = c.agencyName;
    level = c.level;
    number = c.number;
    issuedOn = c.issuedOn;
    instructor = c.instructor;
    for (const d of c.documents) {
      const bytes = await services().profile.readPhoto(c.id, d.hash);
      if (bytes) photos[d.side] = { url: photoUrl(bytes) };
    }
  });
  onDestroy(() => Object.values(photos).forEach((p) => p.url && URL.revokeObjectURL(p.url)));

  const agencyOptions = AGENCIES.map((a) => ({ value: a.id, label: a.id === 'other' ? t('diverProfile.cert.agencyOther') : a.id }));
  const suggestions = $derived(LEVEL_SUGGESTIONS[agency] ?? []);
  const problems = $derived(certificationProblems({ agency, level, number, issuedOn }));
  const dateLive = liveError(
    () => issuedOn,
    () => (problems.issuedOn ? t('diverProfile.cert.dateFuture') : ''),
  );
  const mark = (/** @type {'agency'|'level'|'number'|'issuedOn'} */ field, /** @type {string} */ value) => (readFrom[field] && readFrom[field] === value ? t('diverProfile.cert.readMark') : '');
  const canSave = $derived(!Object.keys(problems).length && !(agency === 'other' && !agencyName.trim()) && !saving && !gear.readOnly);

  /** @param {'front'|'back'} side */
  async function pick(side) {
    try {
      const scanned = await scanCard(side);
      if (!scanned) return;
      const bytes = await toJpegBytes(scanned.image);
      if (photos[side].url) URL.revokeObjectURL(photos[side].url);
      photos[side] = { bytes, url: photoUrl(bytes) };
      // The text read from the card proposes what the diver has not typed yet.
      const found = parseCardText(scanned.text);
      if (found.agency && !agency) readFrom.agency = agency = found.agency;
      if (found.level && !level.trim()) readFrom.level = level = found.level;
      if (found.number && !number.trim()) readFrom.number = number = found.number;
      if (found.issuedOn && !issuedOn) readFrom.issuedOn = issuedOn = found.issuedOn;
    } catch {
      showSnackbar(t('diverProfile.cert.photoFailed'));
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
          agencyName,
          level,
          number,
          issuedOn,
          instructor,
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
  <div class="od-cert-edit--slot">
    {#if photos[side].url}
      <div class="od-cert-edit--slot-thumb"><img src={photos[side].url} alt="" /></div>
      <button type="button" class="od-cert-edit--slot-remove" onclick={() => remove(side)} aria-label={t('diverProfile.cert.photoRemove')}><Icon name="close" size={18} /></button>
      <span class="od-cert-edit--slot-caption">
        <span>{side === 'front' ? t('diverProfile.cert.sideFront') : t('diverProfile.cert.sideBack')}</span>
        <button type="button" class="od-cert-edit--slot-replace" onclick={() => pick(side)} disabled={gear.readOnly}>{t('diverProfile.cert.photoReplace')}</button>
      </span>
    {:else}
      <button type="button" class="od-cert-edit--slot-button" onclick={() => pick(side)} disabled={gear.readOnly}>
        <Icon name="camera" size={28} weight={1.6} />
        <span class="od-cert-edit--slot-label">{side === 'front' ? t('diverProfile.cert.photoFront') : t('diverProfile.cert.photoBack')}</span>
      </button>
    {/if}
  </div>
{/snippet}

<Page class="od-cert-edit">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="od-sr-only">{t('diverProfile.cert.close')}</span>
      </a>
    {/snippet}
    {#snippet title()}{id ? t('diverProfile.cert.edit') : t('diverProfile.cert.new')}{/snippet}
    {#snippet right()}
      <button type="button" class="od-cert-edit--save" disabled={!canSave} onclick={save}>{t('diverProfile.cert.save')}</button>
    {/snippet}
  </Navbar>

  <ReadOnlyNotice />

  <div class="od-cert-edit--slots">
    {@render slot('front')}
    {@render slot('back')}
  </div>
  <p class="od-cert-edit--hint">{t('diverProfile.cert.photoHint')}</p>

  <div class="od-cert-edit--fields">
    <SelectField label={t('diverProfile.cert.agency')} bind:value={agency} options={agencyOptions} supporting={mark('agency', agency)} />
    {#if agency === 'other'}
      <TextField label={t('diverProfile.cert.agencyName')} bind:value={agencyName} />
    {/if}
    <ComboField label={t('diverProfile.cert.level')} bind:value={level} options={suggestions} supporting={mark('level', level)} />
    <TextField label={t('diverProfile.cert.number')} bind:value={number} supporting={mark('number', number) || t('diverProfile.cert.numberHint')} />
    <DateField label={t('diverProfile.cert.date')} bind:value={issuedOn} placeholder={t('diverProfile.cert.dateHint')} maxYear={new Date().getFullYear()} supporting={dateLive.error || mark('issuedOn', issuedOn)} />
    <TextField label={t('diverProfile.cert.instructor')} bind:value={instructor} supporting={t('diverProfile.cert.instructorHint')} />
  </div>
  <div class="od-cert-edit--bottom"></div>
</Page>

<style>
  @layer od.components {
    :global(.od-cert-edit .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-cert-edit--save {
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

    .od-cert-edit--save:disabled {
      opacity: 0.38;
    }

    .od-cert-edit--slots {
      margin: 8px 16px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .od-cert-edit--slot {
      position: relative;
    }

    .od-cert-edit--slot-button {
      position: relative;
      width: 100%;
      aspect-ratio: 85.6 / 54;
      border: 1.5px dashed var(--od-release-field-border);
      border-radius: 16px;
      background: var(--od-surface);
      color: var(--od-text-2);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font: inherit;
    }

    .od-cert-edit--slot-thumb {
      aspect-ratio: 85.6 / 54;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
    }

    .od-cert-edit--slot-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .od-cert-edit--slot-caption {
      margin-top: 6px;
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: var(--od-text-2);
    }

    .od-cert-edit--slot-replace {
      padding: 0;
      border: none;
      background: none;
      color: var(--od-primary);
      font: inherit;
      font-weight: 600;
    }

    .od-cert-edit--slot-label {
      position: relative;
      font-size: 13px;
      line-height: 18px;
      font-weight: 500;
    }

    .od-cert-edit--slot-remove {
      position: absolute;
      top: 6px;
      inset-inline-end: 6px;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 16px;
      background: var(--od-surface);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-cert-edit--hint {
      margin: 8px 32px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-cert-edit--fields {
      margin-top: 16px;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-cert-edit--bottom {
      height: 48px;
    }
  }
</style>
