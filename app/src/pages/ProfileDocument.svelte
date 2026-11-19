<script>
  // @ts-check
  // The sheet of an insurance, a medical certificate or another document (task 2026-11-19-309, docs/mockups/doc-medical-android.dc.html
  // and doc-partager-android.dc.html): the document's name and what it is, the expiry banner (« Expire dans 20 jours », the
  // date and when the reminder came), each page with a centred button that opens it full screen, the details, and in the top
  // bar Partager (images, one per page, or one PDF), Modifier and Supprimer. The files are sealed on the device.
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import DocumentThumb from '../components/DocumentThumb.svelte';
  import DocumentChoiceSheet from '../components/DocumentChoiceSheet.svelte';
  import DocumentFullScreen from '../components/DocumentFullScreen.svelte';
  import { services, loadProfile } from '../lib/profile.svelte.js';
  import { changeProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { openFiles, revokeFiles } from '../lib/document-files.js';
  import { shareDocument } from '../lib/document-share.js';
  import { afterDocumentsChanged } from '../lib/document-notify.js';
  import { expiryState, cardTone } from '../lib/documents.js';
  import { badgeText, documentTitle, kindLabel, bannerLine } from '../lib/documents-text.js';
  import { todayIso } from '../lib/maintenance.js';
  import { formatLongDate } from '../lib/profile-format.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();
  const id = f7route.params.id ?? '';

  /** @type {import('../lib/profile.js').Certification|null} */
  let doc = $state(null);
  let missing = $state(false);
  /** @type {import('../lib/document-files.js').OpenFile[]} */
  let files = $state([]);
  let sharing = $state(false);
  /** The image shown full screen: its index among the images, or -1. */
  let full = $state(-1);
  const today = todayIso();

  onMount(async () => {
    await loadInventory();
    const d = await services().profile.getCertification(id);
    if (!d || d.kind === 'certification') {
      missing = !d;
      if (d) f7router.navigate(`/profile/certs/${id}`, { reloadCurrent: true });
      return;
    }
    doc = d;
    files = await openFiles(d);
  });
  onDestroy(() => revokeFiles(files));

  const images = $derived(files.filter((f) => !f.pdf));
  const pdfs = $derived(files.filter((f) => f.pdf));
  const status = $derived(doc ? expiryState(doc.expiresOn, today) : { state: 'none', days: 0 });
  const pageLabel = (/** @type {import('../lib/document-files.js').OpenFile} */ f, /** @type {number} */ i) => (f.file.side === 'front' ? t('diverProfile.cert.recto') : f.file.side === 'back' ? t('diverProfile.cert.verso') : t('docs.medical.page', { n: f.file.page ?? i + 1 }));
  const subtitle = $derived(
    !doc ? '' : doc.kind === 'medical' ? [doc.doctor, images.length ? t('docs.medical.pagesCount', { n: images.length }) : ''].filter(Boolean).join(' · ') : doc.kind === 'insurance' ? doc.policyNumber && t('docs.insurance.policyLine', { number: doc.policyNumber }) : doc.notes,
  );

  /** The details, in order; a row without a value is left out. */
  const allRows = $derived(
    !doc
      ? []
      : doc.kind === 'insurance'
        ? [
            { label: t('docs.sheet.insurer'), value: doc.insurer },
            { label: t('docs.sheet.plan'), value: doc.plan },
            { label: t('docs.sheet.policy'), value: doc.policyNumber },
            { label: t('docs.sheet.phone'), value: doc.emergencyPhone, tel: true },
            { label: t('docs.sheet.startsOn'), value: doc.startsOn ? formatLongDate(doc.startsOn) : '' },
            { label: t('docs.sheet.expiresOn'), value: doc.expiresOn ? formatLongDate(doc.expiresOn) : '' },
            { label: t('docs.sheet.reminder'), value: doc.expiresOn ? t('docs.medical.reminderValue', { n: doc.notifyDays }) : '' },
            { label: t('docs.sheet.notes'), value: doc.notes },
          ]
        : doc.kind === 'medical'
          ? [
              { label: t('docs.medical.doctor'), value: doc.doctor },
              { label: t('docs.medical.date'), value: doc.issuedOn ? formatLongDate(doc.issuedOn) : '' },
              { label: t('docs.medical.expiresOn'), value: doc.expiresOn ? formatLongDate(doc.expiresOn) : '' },
              { label: t('docs.sheet.reminder'), value: doc.expiresOn ? t('docs.medical.reminderValue', { n: doc.notifyDays }) : '' },
              { label: t('docs.sheet.notes'), value: doc.notes },
            ]
          : [
              { label: t('docs.sheet.expiresOn'), value: doc.expiresOn ? formatLongDate(doc.expiresOn) : '' },
              { label: t('docs.sheet.reminder'), value: doc.expiresOn ? t('docs.medical.reminderValue', { n: doc.notifyDays }) : '' },
              { label: t('docs.sheet.notes'), value: doc.notes },
            ],
  );
  const rows = $derived(allRows.filter((r) => r.value));

  const shareOptions = $derived([
    { value: 'images', icon: 'image', title: t('docs.share.images'), text: t('docs.share.imagesText') },
    { value: 'pdf', icon: 'document', title: t('docs.share.pdf'), text: t('docs.share.pdfText') },
  ]);

  /** @param {string} how */
  async function share(how) {
    sharing = false;
    if (!doc) return;
    try {
      await shareDocument({ title: documentTitle(doc), images, pdfs }, /** @type {'images'|'pdf'} */ (how));
    } catch (e) {
      if (/** @type {any} */ (e)?.message !== 'Share canceled' && !/cancel/i.test(String(/** @type {any} */ (e)?.message ?? ''))) showSnackbar(t('docs.share.failed'));
    }
  }

  /** @param {MouseEvent} e */
  function more(e) {
    openPopupMenu(/** @type {HTMLElement} */ (e.currentTarget), [{ label: t('docs.delete.menu'), danger: true, disabled: gear.readOnly, onclick: remove }], t('diverProfile.cert.menu'));
  }

  function remove() {
    confirmAction({
      title: t('docs.delete.title'),
      text: t('docs.delete.text'),
      action: t('docs.delete.action'),
      cancel: t('docs.delete.cancel'),
      onConfirm: async () => {
        try {
          await changeProfile((p) => p.deleteCertification(id));
          afterDocumentsChanged();
          showSnackbar(t('docs.delete.done'));
          f7router.back();
        } catch {
          showSnackbar(t('docs.saveFailed'));
        }
      },
    });
  }
</script>

{#snippet body()}

  <ReadOnlyNotice />

  {#if missing}
    <p class="od-doc--missing">{t('docs.notFound')}</p>
  {:else if doc}
    <div class="od-doc--head">
      {#if doc.kind === 'insurance'}
        <DocumentThumb {doc} urls={images.map((f) => f.url)} width={168} />
      {/if}
      <span class="od-doc--head-texts">
        <span class="od-doc--kind od-doc--tone-{cardTone(doc)}">{kindLabel(doc)}</span>
        <span class="od-doc--title">{documentTitle(doc)}</span>
        {#if subtitle}<span class="od-doc--subtitle">{subtitle}</span>{/if}
      </span>
    </div>

    {#if status.state !== 'none'}
      <div class="od-doc--banner od-doc--banner-{status.state}" role="status">
        <Icon name={status.state === 'expired' ? 'warning' : 'clock'} size={22} />
        <span class="od-doc--banner-texts">
          <span class="od-doc--banner-title">{badgeText(status)}</span>
          <span class="od-doc--banner-line">{bannerLine(doc, formatLongDate, today)}</span>
        </span>
      </div>
    {/if}

    {#if images.length && doc.kind !== 'insurance'}
      <div class="od-doc--pages">
        {#each images as f, i (f.file.hash)}
          <figure class="od-doc--page">
            <figcaption>{pageLabel(f, i)}</figcaption>
            <img src={f.url} alt={pageLabel(f, i)} />
            <button type="button" class="od-doc--full" onclick={() => (full = i)} aria-label={t('docs.sheet.pageFull', { n: f.file.page ?? i + 1 })}><Icon name="fullscreen" size={20} />{t('docs.sheet.fullscreen')}</button>
          </figure>
        {/each}
      </div>
    {:else if images.length}
      <div class="od-doc--pages">
        <figure class="od-doc--page">
          <img src={images[0].url} alt={pageLabel(images[0], 0)} />
          <button type="button" class="od-doc--full" onclick={() => (full = 0)}><Icon name="fullscreen" size={20} />{t('docs.sheet.fullscreen')}</button>
        </figure>
      </div>
    {/if}
    {#each pdfs as f (f.file.hash)}
      <div class="od-doc--pdf"><Icon name="document" size={22} /><span>{t('docs.sheet.pdfFile')}</span><button type="button" onclick={() => shareDocument({ title: documentTitle(/** @type {any} */ (doc)), images: [], pdfs: [f] }, 'pdf').catch(() => showSnackbar(t('docs.share.failed')))}>{t('docs.sheet.openPdf')}</button></div>
    {/each}

    {#if rows.length}
      <h2 class="od-doc--section">{t('docs.sheet.details')}</h2>
      <div class="od-doc--card">
        {#each rows as row (row.label)}
          <div class="od-doc--row">
            <span class="od-doc--label">{row.label}</span>
            {#if row.tel}<a class="od-doc--value external" href={`tel:${row.value.replace(/[^+\d]/g, '')}`}>{row.value}</a>{:else}<span class="od-doc--value">{row.value}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
  <div class="od-doc--bottom"></div>
{/snippet}

<Page class="od-doc">
  <Navbar>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('docs.back')}</span>
      </Link>
    {/snippet}
    {#snippet title()}{doc ? kindLabel(doc) : ''}{/snippet}
    {#snippet right()}
      <button type="button" class="link icon-only od-doc--bar" disabled={!files.length} onclick={() => (sharing = true)} aria-label={t('docs.share.menu')}><Icon name="share" /></button>
      <a href={`/profile/documents/${id}/edit`} class="link icon-only" aria-label={t('diverProfile.cert.edit')}><Icon name="edit" /></a>
      <button type="button" class="link icon-only od-doc--bar" onclick={more} aria-label={t('diverProfile.cert.menu')}><Icon name="more" /></button>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="certs">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

<DocumentChoiceSheet opened={sharing} title={t('docs.share.title')} lead={t('docs.share.text')} options={shareOptions} cancel={t('docs.share.cancel')} onchoose={share} onclose={() => (sharing = false)} />

{#if full >= 0 && doc}
  <DocumentFullScreen
    images={images.map((f, i) => ({ url: f.url, label: pageLabel(f, i) }))}
    start={full}
    title={documentTitle(doc)}
    line={subtitle}
    onclose={() => (full = -1)}
  />
{/if}

<style>
  @layer od.components {
    :global(.od-doc .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-doc--bar {
      border: none;
      background: none;
      color: inherit;
    }

    .od-doc--bar:disabled {
      opacity: 0.38;
    }

    .od-doc--head {
      margin: 8px 20px 0;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .od-doc--head-texts {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-doc--kind {
      font-size: 12px;
      line-height: 16px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--od-text-2);
    }

    .od-doc--tone-blue { color: var(--od-plus-blue-icon); }
    .od-doc--tone-green { color: var(--od-plus-green-icon); }
    .od-doc--tone-amber { color: var(--od-plus-amber-icon); }
    .od-doc--tone-violet { color: var(--od-plus-violet-icon); }
    .od-doc--tone-red { color: var(--od-maintenance-icon); }

    .od-doc--title {
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }

    .od-doc--subtitle {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-doc--banner {
      margin: 16px 16px 0;
      padding: 12px 16px;
      border-radius: 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .od-doc--banner-valid { background: var(--od-plus-green); color: var(--od-plus-green-icon); }
    .od-doc--banner-soon { background: var(--od-plus-amber); color: var(--od-plus-amber-icon); }
    .od-doc--banner-expired { background: var(--od-alarm-tint); color: var(--od-alarm); }

    .od-doc--banner-texts {
      display: flex;
      flex-direction: column;
    }

    .od-doc--banner-title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-doc--banner-line {
      font-size: 13px;
      line-height: 18px;
    }

    .od-doc--pages {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .od-doc--page {
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .od-doc--page figcaption {
      align-self: flex-start;
      padding: 0 4px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-doc--page img {
      width: 100%;
      max-height: 420px;
      border-radius: 16px;
      object-fit: contain;
      background: var(--od-surface);
    }

    .od-doc--full {
      height: 40px;
      padding: 0 20px 0 14px;
      border: none;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--od-tonal);
      color: var(--od-on-secondary-container);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-doc--pdf {
      margin: 12px 16px 0;
      padding: 8px 8px 8px 16px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--od-surface);
      font-size: 16px;
    }

    .od-doc--pdf span {
      flex: 1;
    }

    .od-doc--pdf button {
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: var(--od-tonal);
      color: var(--od-on-secondary-container);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-doc--section {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-doc--card {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-doc--row {
      padding: 10px 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-doc--row + .od-doc--row {
      border-top: 1px solid var(--od-separator);
    }

    .od-doc--label {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-doc--value {
      font-size: 17px;
      line-height: 24px;
      color: var(--od-text);
    }

    .od-doc--missing {
      margin: 32px;
      text-align: center;
      color: var(--od-text-2);
    }

    .od-doc--bottom {
      height: 48px;
    }
  }
</style>
