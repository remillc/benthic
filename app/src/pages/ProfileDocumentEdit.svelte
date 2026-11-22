<script>
  // @ts-check
  // « Nouvelle assurance », « Nouveau certificat médical », « Nouveau document » and their edits (task 2026-11-19-309,
  // docs/mockups/doc-assurance-nouvelle-android.dc.html). The files: the scan of the card (an insurance card is read on the
  // device and its fields proposed, to check) or a PDF; a medical certificate and another document take pages. Then the
  // fields of the kind, the dates in the date picker, « Me prévenir avant l'expiration » (2 semaines, 30 jours, 60 jours) and
  // the notes. Checked as the diver types. Sealed on the device, nothing is sent.
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import DateField from '../components/DateField.svelte';
  import ButtonGroup from '../components/ButtonGroup.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import DocumentThumb from '../components/DocumentThumb.svelte';
  import PhotoBusy from '../components/PhotoBusy.svelte';
  import CardPhotoDialog from '../components/CardPhotoDialog.svelte';
  import { services, changeProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { documentProblems, EXPIRY_LEAD_CHOICES } from '../lib/profile.js';
  import { scanCard, parseInsuranceText, parseMedicalText, parseOtherText, joinTexts } from '../lib/card-scan.js';
  import { toJpegBytes, scanJpegBytes, photoUrl } from '../lib/card-canvas.js';
  import { afterDocumentsChanged } from '../lib/document-notify.js';
  import { openFiles, revokeFiles } from '../lib/document-files.js';
  import { desktopApp } from '../lib/layout.svelte.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { settings } from '../lib/settings.svelte.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();
  const id = f7route.params.id ?? '';

  /** @type {'insurance'|'medical'|'other'} */
  let kind = $state(f7route.params.kind === 'medical' ? 'medical' : f7route.params.kind === 'other' ? 'other' : 'insurance');
  let insurer = $state('');
  let plan = $state('');
  let policyNumber = $state('');
  let emergencyPhone = $state('');
  let startsOn = $state('');
  let expiresOn = $state('');
  let issuedOn = $state('');
  let doctor = $state('');
  let title = $state('');
  let notes = $state('');
  /** @type {14|30|60} */
  let notifyDays = $state(/** @type {14|30|60} */ (settings.maintenanceLeadDays));
  let saving = $state(false);
  /** What the scan filled in, to mark it while the field still holds it. */
  let scanned = $state(false);
  /** The files, in order: a kept one has a `hash`, a new one `bytes`. @type {{ key: string, side: 'front'|'back'|'page', page?: number, hash?: string, bytes?: Uint8Array, mime: string, url: string, pdf: boolean }[]} */
  let files = $state([]);
  let keySeed = 0;
  /** @type {HTMLInputElement|undefined} */
  let pdfInput = $state();
  /** The desktop's photo dialog is asking for a file. */
  let photoDialog = $state(false);
  /** A picture is being read, shrunk and sealed: its place shows the progress indicator, and the document cannot be saved yet. */
  let busy = $state(false);

  onMount(async () => {
    await loadInventory();
    if (!id) return;
    const d = await services().profile.getCertification(id);
    if (!d || d.kind === 'certification') return;
    kind = d.kind;
    insurer = d.insurer;
    plan = d.plan;
    policyNumber = d.policyNumber;
    emergencyPhone = d.emergencyPhone;
    startsOn = d.startsOn;
    expiresOn = d.expiresOn;
    issuedOn = d.issuedOn;
    doctor = d.doctor;
    title = d.title;
    notes = d.notes;
    notifyDays = d.notifyDays;
    const opened = await openFiles(d);
    files = opened.map((f) => ({ key: `k${++keySeed}`, side: f.file.side, page: f.file.page, hash: f.file.hash, mime: f.file.mime, url: f.url, pdf: f.pdf }));
  });
  onDestroy(() => files.forEach((f) => URL.revokeObjectURL(f.url)));

  const values = $derived({ insurer, expiresOn, startsOn, issuedOn, title, emergencyPhone });
  const problems = $derived(documentProblems(kind, values));
  const live = {
    insurer: liveError(() => insurer, () => (problems.insurer ? t('docs.errors.required') : '')),
    title: liveError(() => title, () => (problems.title ? t('docs.errors.required') : '')),
    phone: liveError(() => emergencyPhone, () => (problems.emergencyPhone ? t('docs.insurance.phoneInvalid') : '')),
  };
  const canSave = $derived(!Object.keys(problems).length && !saving && !busy && !gear.readOnly);
  const year = new Date().getFullYear();
  const heading = $derived(id ? t(`docs.${kind}.edit`) : t(`docs.${kind}.new`));
  const images = $derived(files.filter((f) => !f.pdf));
  const pdfFiles = $derived(files.filter((f) => f.pdf));
  /** What the card would look like with the details entered: the preview at the top of an insurance. @type {import('../lib/profile.js').Certification} */
  const preview = $derived(/** @type {any} */ ({ kind, insurer, plan, policyNumber, emergencyPhone, title, doctor, notes, documents: [] }));
  const notifyOptions = EXPIRY_LEAD_CHOICES.map((n) => ({ value: String(n), label: n === 14 ? t('docs.notifyChoice.weeks2') : t('docs.notifyChoice.days', { n }) }));

  /** @param {string} message */
  const fail = (message) => showSnackbar(message);

  /** Adds an image (a scan, a page) from bytes. @param {Uint8Array} bytes @param {boolean} [replaceFront] */
  function addImage(bytes, replaceFront = false) {
    const url = photoUrl(bytes);
    if (replaceFront) {
      for (const f of files.filter((x) => !x.pdf)) URL.revokeObjectURL(f.url);
      files = [...files.filter((f) => f.pdf), { key: `k${++keySeed}`, side: 'front', bytes, mime: 'image/jpeg', url, pdf: false }];
      return;
    }
    const page = images.length + 1;
    files = [...files, { key: `k${++keySeed}`, side: 'page', page, bytes, mime: 'image/jpeg', url, pdf: false }];
  }

  /** The text read on each scan, in order: the pages of a certificate are read together, a new scan of an insurance card replaces the card. @type {string[]} */
  let scanTexts = [];
  /** What the scan proposed, per field, to mark it while the field still holds it. @type {Record<string, string>} */
  let readFrom = $state({});
  const mark = (/** @type {string} */ field, /** @type {string} */ value) => (readFrom[field] && readFrom[field] === value ? t('docs.readMark') : '');

  /** The scan of a card or of a page: the phone's scanner, else the image picker. The text read proposes the fields the diver has not typed. */
  async function scan() {
    if (desktopApp) {
      photoDialog = true;
      return;
    }
    busy = true;
    try {
      const result = await scanCard('front');
      if (!result) return;
      addImage(await scanJpegBytes(result.image), kind === 'insurance');
      scanTexts = kind === 'insurance' ? [result.text] : [...scanTexts, result.text];
      proposeFrom(joinTexts(...scanTexts));
    } catch {
      fail(t('docs.fileFailed'));
    } finally {
      busy = false;
    }
  }

  /** @param {string} text */
  function proposeFrom(text) {
    const today = new Date().toISOString().slice(0, 10);
    /** @type {Record<string, string>} */
    const found =
      kind === 'insurance' ? parseInsuranceText(text) : kind === 'medical' ? parseMedicalText(text, today) : parseOtherText(text);
    /** A field is proposed when it is empty or still holds an earlier proposal. @param {string} field @param {string} current @param {(v: string) => void} set */
    const put = (field, current, set) => {
      const value = found[field];
      if (!value || value === current) return false;
      if (current.trim() && !(readFrom[field] && readFrom[field] === current)) return false;
      readFrom[field] = value;
      set(value);
      return true;
    };
    let any = false;
    if (kind === 'insurance') {
      any = [put('insurer', insurer, (v) => (insurer = v)), put('plan', plan, (v) => (plan = v)), put('policyNumber', policyNumber, (v) => (policyNumber = v)), put('emergencyPhone', emergencyPhone, (v) => (emergencyPhone = v)), put('startsOn', startsOn, (v) => (startsOn = v)), put('expiresOn', expiresOn, (v) => (expiresOn = v))].some(Boolean);
    } else if (kind === 'medical') {
      any = [put('doctor', doctor, (v) => (doctor = v)), put('issuedOn', issuedOn, (v) => (issuedOn = v)), put('expiresOn', expiresOn, (v) => (expiresOn = v))].some(Boolean);
    } else {
      any = [put('title', title, (v) => (title = v)), put('expiresOn', expiresOn, (v) => (expiresOn = v))].some(Boolean);
    }
    if (any && kind === 'insurance') scanned = true;
  }

  /** @param {Blob} image */
  async function useDesktopPhoto(image) {
    photoDialog = false;
    busy = true;
    try {
      addImage(await toJpegBytes(image), kind === 'insurance');
    } catch {
      fail(t('docs.fileFailed'));
    } finally {
      busy = false;
    }
  }

  /** @param {Event} e */
  async function pickPdf(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      files = [...files, { key: `k${++keySeed}`, side: 'page', page: images.length + pdfFiles.length + 1, bytes, mime: 'application/pdf', url, pdf: true }];
    } catch {
      fail(t('docs.fileFailed'));
    }
  }

  /** @param {string} key */
  function removeFile(key) {
    const gone = files.find((f) => f.key === key);
    if (gone) URL.revokeObjectURL(gone.url);
    files = files.filter((f) => f.key !== key);
  }

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      let page = 0;
      await changeProfile((p) =>
        p.saveDocument({
          id: id || undefined,
          kind,
          insurer,
          plan,
          policyNumber,
          emergencyPhone,
          startsOn,
          expiresOn,
          issuedOn,
          doctor,
          title,
          notes,
          notifyDays,
          files: files.map((f) => ({ side: kind === 'insurance' ? 'front' : 'page', ...(kind === 'insurance' ? {} : { page: ++page }), ...(f.hash ? { hash: f.hash } : { bytes: f.bytes }), mime: f.mime })),
        }),
      );
      await afterDocumentsChanged();
      showSnackbar(t('docs.saved'));
      f7router.back();
    } catch {
      showSnackbar(t('docs.saveFailed'));
    } finally {
      saving = false;
    }
  }
</script>

{#snippet filesBlock()}
  {#if kind === 'insurance'}
    <div class="bc-doc-edit--card">
      <span class="bc-doc-edit--thumb"><DocumentThumb doc={preview} urls={images[0] ? [images[0].url] : []} width={150} />{#if busy}<PhotoBusy />{/if}</span>
      <span class="bc-doc-edit--card-texts">
        {#if images.length && scanned}<span class="bc-doc-edit--scanned">{t('docs.insurance.scanned')}</span>{/if}
        <span class="bc-doc-edit--buttons">
          <button type="button" class="bc-doc-edit--button" disabled={gear.readOnly || busy} onclick={scan}><Icon name="camera" size={20} />{images.length ? t('docs.insurance.scanAgain') : t('docs.insurance.scan')}</button>
          <button type="button" class="bc-doc-edit--button" disabled={gear.readOnly} onclick={() => pdfInput?.click()}><Icon name="document" size={20} />{t('docs.insurance.pdf')}</button>
        </span>
      </span>
    </div>
    {#each pdfFiles as f (f.key)}
      <div class="bc-doc-edit--pdf"><Icon name="document" size={20} /><span>{t('docs.insurance.fileKept')}</span><button type="button" onclick={() => removeFile(f.key)}>{t('docs.insurance.removeFile')}</button></div>
    {/each}
  {:else}
    <h2 class="bc-doc-edit--section">{t('docs.medical.pages')}</h2>
    <div class="bc-doc-edit--pages">
      {#each files as f, i (f.key)}
        <div class="bc-doc-edit--page">
          {#if f.pdf}<span class="bc-doc-edit--page-pdf"><Icon name="document" size={28} /></span>{:else}<img src={f.url} alt="" />{/if}
          <span class="bc-doc-edit--page-label">{f.pdf ? t('docs.sheet.pdfFile') : t('docs.medical.page', { n: images.indexOf(f) + 1 })}</span>
          <button type="button" class="bc-doc-edit--page-remove" onclick={() => removeFile(f.key)} aria-label={t('docs.medical.removePage', { n: i + 1 })}><Icon name="close" size={18} /></button>
        </div>
      {/each}
      {#if busy}<div class="bc-doc-edit--page bc-doc-edit--page-busy"><span class="bc-doc-edit--page-pdf"></span><PhotoBusy /></div>{/if}
    </div>
    <span class="bc-doc-edit--buttons">
      <button type="button" class="bc-doc-edit--button" disabled={gear.readOnly || busy} onclick={scan}><Icon name="camera" size={20} />{images.length ? t('docs.medical.addPage') : t('docs.medical.scanPage')}</button>
      <button type="button" class="bc-doc-edit--button" disabled={gear.readOnly} onclick={() => pdfInput?.click()}><Icon name="document" size={20} />{t('docs.insurance.pdf')}</button>
    </span>
  {/if}
  <input bind:this={pdfInput} class="bc-doc-edit--file" type="file" accept="application/pdf" tabindex="-1" aria-hidden="true" onchange={pickPdf} />
{/snippet}

{#snippet notify()}
  <div class="bc-doc-edit--notify">
    <span class="bc-doc-edit--notify-label" id="bc-doc-notify">{t('docs.insurance.notify')}</span>
    <ButtonGroup ariaLabelledby="bc-doc-notify" value={String(notifyDays)} onchange={(v) => v && (notifyDays = /** @type {14|30|60} */ (Number(v)))} options={notifyOptions} />
  </div>
{/snippet}

{#snippet body()}

  <ReadOnlyNotice />

  <div class="bc-doc-edit--fields">
    {@render filesBlock()}

    {#if kind === 'insurance'}
      <TextField label={t('docs.insurance.insurer')} bind:value={insurer} invalid={!!live.insurer.error} supporting={live.insurer.error || mark('insurer', insurer)} />
      <TextField label={t('docs.insurance.plan')} bind:value={plan} supporting={mark('plan', plan)} />
      <TextField label={t('docs.insurance.policy')} bind:value={policyNumber} supporting={mark('policyNumber', policyNumber)} />
      <TextField label={t('docs.insurance.phone')} bind:value={emergencyPhone} inputmode="numeric" invalid={!!live.phone.error} supporting={live.phone.error || mark('emergencyPhone', emergencyPhone) || t('docs.insurance.phoneHint')} />
      <DateField label={t('docs.insurance.startsOn')} bind:value={startsOn} minYear={year - 10} maxYear={year + 30} supporting={mark('startsOn', startsOn)} />
      <DateField label={t('docs.insurance.expiresOn')} bind:value={expiresOn} minYear={year - 10} maxYear={year + 30} supporting={problems.expiresOn === 'order' ? t('docs.errors.order') : mark('expiresOn', expiresOn)} />
      {@render notify()}
      <TextField label={t('docs.insurance.notes')} bind:value={notes} multiline supporting={t('docs.insurance.notesHint')} />
    {:else if kind === 'medical'}
      <TextField label={t('docs.medical.doctor')} bind:value={doctor} supporting={mark('doctor', doctor) || t('docs.medical.doctorHint')} />
      <DateField label={t('docs.medical.date')} bind:value={issuedOn} minYear={year - 10} maxYear={year} supporting={problems.issuedOn === 'future' ? t('docs.errors.future') : mark('issuedOn', issuedOn)} />
      <DateField label={t('docs.medical.expiresOn')} bind:value={expiresOn} minYear={year - 10} maxYear={year + 30} supporting={problems.expiresOn === 'order' ? t('docs.errors.order') : mark('expiresOn', expiresOn)} />
      {@render notify()}
      <TextField label={t('docs.medical.notes')} bind:value={notes} multiline supporting={t('docs.medical.notesHint')} />
    {:else}
      <TextField label={t('docs.other.name')} bind:value={title} invalid={!!live.title.error} supporting={live.title.error || mark('title', title) || t('docs.other.nameHint')} />
      <DateField label={t('docs.other.expiresOn')} bind:value={expiresOn} minYear={year - 10} maxYear={year + 30} supporting={mark('expiresOn', expiresOn)} />
      {#if expiresOn}{@render notify()}{/if}
      <TextField label={t('docs.other.notes')} bind:value={notes} multiline supporting={t('docs.other.notesHint')} />
    {/if}
  </div>
  <div class="bc-doc-edit--bottom"></div>
{/snippet}

<Page class="bc-doc-edit">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="bc-sr-only">{t('docs.close')}</span>
      </a>
    {/snippet}
    {#snippet title()}{heading}{/snippet}
    {#snippet right()}
      <button type="button" class="bc-doc-edit--save" disabled={!canSave} onclick={save}>{t('docs.save')}</button>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="certs" bar="dialog" size="l">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

{#if photoDialog}
  <CardPhotoDialog side="front" oncancel={() => (photoDialog = false)} onuse={useDesktopPhoto} />
{/if}

<style>
  @layer bc.components {
    :global(.bc-doc-edit .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-doc-edit--save {
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
      &:disabled {
        opacity: 0.38;
      }
    }

    .bc-doc-edit--fields {
      margin-top: 8px;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-doc-edit--thumb {
      position: relative;
      display: inline-flex;
      flex: none;
      border-radius: 8px;
      overflow: hidden;
    }

    .bc-doc-edit--card {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .bc-doc-edit--card-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-doc-edit--scanned {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-doc-edit--buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .bc-doc-edit--button {
      height: 40px;
      padding: 0 16px 0 12px;
      border: none;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--bc-tonal);
      color: var(--bc-on-secondary-container);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      &:disabled {
        opacity: 0.38;
      }
    }

    .bc-doc-edit--file {
      display: none;
    }

    .bc-doc-edit--pdf {
      padding: 8px 8px 8px 16px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bc-surface);
      font-size: 15px;
      & span {
        flex: 1;
      }
      & button {
        height: 40px;
        padding: 0 12px;
        border: none;
        background: none;
        color: var(--bc-secondary);
        font: inherit;
        font-weight: 500;
      }
    }

    .bc-doc-edit--section {
      margin: 4px 4px 0;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-doc-edit--pages {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
      gap: 12px;
    }

    .bc-doc-edit--page {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-doc-edit--page img,
    .bc-doc-edit--page-pdf {
      width: 100%;
      aspect-ratio: 3 / 4;
      border-radius: 12px;
      object-fit: cover;
      background: var(--bc-surface);
      display: grid;
      place-items: center;
      box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
    }

    .bc-doc-edit--page-remove {
      position: absolute;
      top: 6px;
      inset-inline-end: 6px;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-surface);
      color: var(--bc-text);
    }

    .bc-doc-edit--notify {
      margin: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-doc-edit--notify-label {
      padding: 0 4px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
    }

    .bc-doc-edit--bottom {
      height: 48px;
    }
  }
</style>
