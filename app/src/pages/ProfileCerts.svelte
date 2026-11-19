<script>
  // @ts-check
  // « Brevets et documents » (tasks 2026-11-18-272 and 2026-11-19-309, docs/mockups/doc-liste-android.dc.html): the
  // sections Brevets, Assurance et santé and Autres documents, a folded « Expirés » section, a reproduction of each card
  // from the diver's photo or scan (without one, drawn from the details entered), a badge for the expiry (« Expire dans
  // 20 jours », « Dans 4 mois »), and the extended button « Ajouter » which offers Brevet, Assurance plongée, Certificat
  // médical, Autre document. Read from the sealed working copy on the device.
  import BackLink from '../components/BackLink.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import DocumentThumb from '../components/DocumentThumb.svelte';
  import DocumentChoiceSheet from '../components/DocumentChoiceSheet.svelte';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { groupDocuments, expiryState, cardTone } from '../lib/documents.js';
  import { badgeText, documentTitle, documentLine, kindLabel } from '../lib/documents-text.js';
  import { openFiles, revokeFiles } from '../lib/document-files.js';
  import { documentPath } from '../lib/document-notify.js';
  import { todayIso } from '../lib/maintenance.js';
  import { formatDate } from '../lib/profile-format.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  onMount(() => Promise.all([loadProfile(), loadInventory()]));

  const today = todayIso();
  const groups = $derived(groupDocuments(diver.certs, today));
  let expiredOpen = $state(false);
  let choosing = $state(false);

  /** The first images of each document, for the reproductions: the photo of a card, the first two pages of a certificate. @type {Record<string, string[]>} */
  let thumbs = $state({});
  /** @type {import('../lib/document-files.js').OpenFile[]} */
  let opened = [];
  let loadedFor = '';
  $effect(() => {
    const key = diver.certs.map((d) => `${d.id}:${d.updatedAt}`).join('|');
    if (key === loadedFor) return;
    loadedFor = key;
    const docs = [...diver.certs];
    (async () => {
      const next = /** @type {Record<string, string[]>} */ ({});
      const keep = [];
      for (const doc of docs) {
        const files = (await openFiles(doc, { max: doc.kind === 'medical' ? 2 : 1 })).filter((f) => !f.pdf);
        keep.push(...files);
        next[doc.id] = files.map((f) => f.url);
      }
      revokeFiles(opened);
      opened = keep;
      thumbs = next;
    })();
  });
  onDestroy(() => revokeFiles(opened));

  /** @param {import('../lib/profile.js').Certification} doc */
  const open = (doc) => f7.views.current.router.navigate(documentPath(doc.kind, doc.id));

  /** @param {string} kind */
  function choose(kind) {
    choosing = false;
    f7.views.current.router.navigate(kind === 'certification' ? '/profile/certs/new' : `/profile/documents/new/${kind}`);
  }

  const options = $derived(
    /** @type {const} */ (['certification', 'insurance', 'medical', 'other']).map((kind) => ({
      value: kind,
      icon: kind === 'certification' ? 'idCard' : kind === 'insurance' ? 'lock' : kind === 'medical' ? 'plus' : 'document',
      title: t(`docs.choose.${kind}.title`),
      text: t(`docs.choose.${kind}.text`),
    })),
  );
</script>

{#snippet row(/** @type {import('../lib/profile.js').Certification} */ doc)}
  {@const status = expiryState(doc.expiresOn, today)}
  <button type="button" class="od-docs--row" onclick={() => open(doc)}>
    <DocumentThumb {doc} urls={thumbs[doc.id] ?? []} />
    <span class="od-docs--texts">
      <span class="od-docs--kind od-docs--tone-{cardTone(doc)}">{kindLabel(doc)}</span>
      <span class="od-docs--title">{documentTitle(doc)}</span>
      <span class="od-docs--line">{documentLine(doc, formatDate, today)}</span>
      {#if doc.kind !== 'certification' && status.state !== 'none'}
        <span class="od-docs--badge od-docs--badge-{status.state}">{badgeText(status)}</span>
      {/if}
    </span>
    <span class="od-docs--chevron"><Icon name="chevron" size={20} /></span>
  </button>
{/snippet}

{#snippet section(/** @type {string} */ key, /** @type {import('../lib/profile.js').Certification[]} */ docs)}
  {#if docs.length}
    <h2 class="od-docs--heading">{t(`docs.sections.${key}`)}</h2>
    <div class="od-docs--list">
      {#each docs as doc (doc.id)}{@render row(doc)}{/each}
    </div>
  {/if}
{/snippet}

{#snippet body()}

  <ReadOnlyNotice />

  {#if profileWide() && !gear.readOnly}
    <div class="od-docs--wide-bar"><button type="button" class="od-docs--add" onclick={() => (choosing = true)}><Icon name="plus" size={20} />{t('docs.add')}</button></div>
  {/if}

  {#if diver.ready && !diver.certs.length}
    <div class="od-docs--empty">
      <span class="od-docs--empty-icon"><Icon name="idCard" size={32} weight={1.6} /></span>
      <p class="od-docs--empty-title">{t('docs.empty')}</p>
      <p class="od-docs--empty-text">{t('docs.emptyText')}</p>
    </div>
  {:else}
    {@render section('certs', groups.certs)}
    {@render section('health', groups.health)}
    {@render section('others', groups.others)}
    {#if groups.expired.length}
      <button type="button" class="od-docs--expired" aria-expanded={expiredOpen} onclick={() => (expiredOpen = !expiredOpen)}>
        <span class="od-docs--expired-label">{t('docs.sections.expired')}</span>
        <span class="od-docs--expired-count">{groups.expired.length}</span>
        <span class="od-docs--expired-chevron" class:od-docs--expired-open={expiredOpen}><Icon name="chevron" size={20} /></span>
      </button>
      {#if expiredOpen}
        <div class="od-docs--list od-docs--list-expired">
          {#each groups.expired as doc (doc.id)}{@render row(doc)}{/each}
        </div>
      {/if}
    {/if}
  {/if}

  <p class="od-docs--note"><Icon name="info" size={18} /><span>{t('docs.note')}</span></p>
  <div class="od-docs--bottom"></div>
{/snippet}

<Page class="od-docs">
  <Navbar title={t('docs.title')}>
    {#snippet left()}
      <BackLink label={t('gear.profile.title')} name={t('docs.back')} />
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="certs">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
  {#snippet fixedContent()}
    <div class="fab fab-right-bottom fab-extended od-fab-add" style:display={gear.readOnly || profileWide() ? 'none' : null}>
      <a href="#add" class="external" role="button" onclick={(e) => (e.preventDefault(), (choosing = true))}>
        <i class="icon"><Icon name="plus" /></i>
        <div class="fab-text">{t('docs.add')}</div>
      </a>
    </div>
  {/snippet}
</Page>

<DocumentChoiceSheet opened={choosing} title={t('docs.choose.title')} {options} onchoose={choose} onclose={() => (choosing = false)} />

<style>
  @layer od.components {
    :global(.od-docs .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-docs--heading {
      margin: 16px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-docs--list {
      margin: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .od-docs--row {
      position: relative;
      width: 100%;
      padding: 12px 40px 12px 14px;
      border: none;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--od-surface);
      color: var(--od-text);
      font: inherit;
      text-align: start;
    }

    .od-docs--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-docs--kind {
      font-size: 11px;
      line-height: 14px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--od-text-2);
    }

    .od-docs--tone-blue { color: var(--od-plus-blue-icon); }
    .od-docs--tone-green { color: var(--od-plus-green-icon); }
    .od-docs--tone-amber { color: var(--od-plus-amber-icon); }
    .od-docs--tone-violet { color: var(--od-plus-violet-icon); }
    .od-docs--tone-red { color: var(--od-maintenance-icon); }

    .od-docs--title {
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .od-docs--line {
      font-size: 12.5px;
      line-height: 17px;
      color: var(--od-text-2);
    }

    .od-docs--badge {
      align-self: flex-start;
      margin-top: 4px;
      height: 24px;
      padding: 0 10px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }

    .od-docs--badge-valid { background: var(--od-plus-green); color: var(--od-plus-green-icon); }
    .od-docs--badge-soon { background: var(--od-plus-amber); color: var(--od-plus-amber-icon); }
    .od-docs--badge-expired { background: var(--od-alarm-tint); color: var(--od-alarm); }

    .od-docs--chevron {
      position: absolute;
      inset-inline-end: 14px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      color: var(--od-text-2);
    }

    .od-docs--expired {
      width: calc(100% - 32px);
      margin: 16px 16px 0;
      min-height: 48px;
      padding: 0 16px;
      border: none;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--od-surface-2);
      color: var(--od-text-2);
      font: inherit;
      font-size: 15px;
      font-weight: 600;
    }

    .od-docs--expired-label {
      flex: 1;
      text-align: start;
    }

    .od-docs--expired-chevron {
      display: flex;
      transform: rotate(90deg);
    }

    .od-docs--expired-open {
      transform: rotate(-90deg);
    }

    .od-docs--list-expired {
      margin-top: 8px;
    }

    .od-docs--wide-bar {
      margin: 16px 16px 0;
      display: flex;
      justify-content: flex-end;
    }

    .od-docs--add {
      height: 40px;
      padding: 0 20px 0 14px;
      border: none;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-docs--empty {
      margin: 48px 32px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
    }

    .od-docs--empty-icon {
      width: 64px;
      height: 64px;
      border-radius: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-tile-violet);
    }

    .od-docs--empty-title {
      margin: 8px 0 0;
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }

    .od-docs--empty-text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-docs--note {
      margin: 16px 32px 0;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-docs--bottom {
      height: 96px;
    }
  }
</style>
