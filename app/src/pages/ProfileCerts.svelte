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
  <button type="button" class="bc-docs--row" onclick={() => open(doc)}>
    <DocumentThumb {doc} urls={thumbs[doc.id] ?? []} />
    <span class="bc-docs--texts">
      <span class="bc-docs--kind bc-docs--tone-{cardTone(doc)}">{kindLabel(doc)}</span>
      <span class="bc-docs--title">{documentTitle(doc)}</span>
      <span class="bc-docs--line">{documentLine(doc, formatDate, today)}</span>
      {#if doc.kind !== 'certification' && status.state !== 'none'}
        <span class="bc-docs--badge bc-docs--badge-{status.state}">{badgeText(status)}</span>
      {/if}
    </span>
    <span class="bc-docs--chevron"><Icon name="chevron" size={20} /></span>
  </button>
{/snippet}

{#snippet section(/** @type {string} */ key, /** @type {import('../lib/profile.js').Certification[]} */ docs)}
  {#if docs.length}
    <h2 class="bc-docs--heading">{t(`docs.sections.${key}`)}</h2>
    <div class="bc-docs--list">
      {#each docs as doc (doc.id)}{@render row(doc)}{/each}
    </div>
  {/if}
{/snippet}

{#snippet body()}
  <div class="bc-docs--content">
  <ReadOnlyNotice />

  {#if diver.ready && !diver.certs.length}
    <div class="bc-docs--empty">
      <span class="bc-docs--empty-icon"><Icon name="idCard" size={32} weight={1.6} /></span>
      <p class="bc-docs--empty-title">{t('docs.empty')}</p>
      <p class="bc-docs--empty-text">{t('docs.emptyText')}</p>
    </div>
  {:else}
    {@render section('certs', groups.certs)}
    {@render section('health', groups.health)}
    {@render section('others', groups.others)}
    {#if groups.expired.length}
      <button type="button" class="bc-docs--expired" aria-expanded={expiredOpen} onclick={() => (expiredOpen = !expiredOpen)}>
        <span class="bc-docs--expired-label">{t('docs.sections.expired')}</span>
        <span class="bc-docs--expired-count">{groups.expired.length}</span>
        <span class="bc-docs--expired-chevron" class:bc-docs--expired-open={expiredOpen}><Icon name="chevron" size={20} /></span>
      </button>
      {#if expiredOpen}
        <div class="bc-docs--list bc-docs--list-expired">
          {#each groups.expired as doc (doc.id)}{@render row(doc)}{/each}
        </div>
      {/if}
    {/if}
    <div class="bc-docs--bottom"></div>
  {/if}
  </div>
{/snippet}

<Page class="bc-docs">
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
    <div class="fab fab-right-bottom fab-extended bc-fab-add bc-docs--fab" style:display={gear.readOnly ? 'none' : null}>
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
    :global(.bc-docs .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-docs--content {
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .bc-docs--heading {
      margin: 16px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-docs--list {
      margin: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-docs--row {
      position: relative;
      width: 100%;
      padding: 12px 40px 12px 14px;
      border: none;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: inherit;
      text-align: start;
    }

    .bc-docs--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-docs--kind {
      font-size: 11px;
      line-height: 14px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--bc-text-2);
    }

    .bc-docs--tone-blue { color: var(--bc-plus-blue-icon); }
    .bc-docs--tone-green { color: var(--bc-plus-green-icon); }
    .bc-docs--tone-amber { color: var(--bc-plus-amber-icon); }
    .bc-docs--tone-violet { color: var(--bc-plus-violet-icon); }
    .bc-docs--tone-red { color: var(--bc-maintenance-icon); }

    .bc-docs--title {
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .bc-docs--line {
      font-size: 12.5px;
      line-height: 17px;
      color: var(--bc-text-2);
    }

    .bc-docs--badge {
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

    .bc-docs--badge-valid { background: var(--bc-plus-green); color: var(--bc-plus-green-icon); }
    .bc-docs--badge-soon { background: var(--bc-plus-amber); color: var(--bc-plus-amber-icon); }
    .bc-docs--badge-expired { background: var(--bc-alarm-tint); color: var(--bc-alarm); }

    .bc-docs--chevron {
      position: absolute;
      inset-inline-end: 14px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-docs--expired {
      width: calc(100% - 32px);
      margin: 16px 16px 0;
      min-height: 48px;
      padding: 0 16px;
      border: none;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bc-surface-2);
      color: var(--bc-text-2);
      font: inherit;
      font-size: 15px;
      font-weight: 600;
    }

    .bc-docs--expired-label {
      flex: 1;
      text-align: start;
    }

    .bc-docs--expired-chevron {
      display: flex;
      transform: rotate(90deg);
    }

    .bc-docs--expired-open {
      transform: rotate(-90deg);
    }

    .bc-docs--list-expired {
      margin-top: 8px;
    }

    .bc-docs--empty {
      flex: 1;
      min-height: 200px;
      box-sizing: border-box;
      padding: 24px 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 8px;
    }

    .bc-docs--empty-icon {
      width: 64px;
      height: 64px;
      border-radius: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-tile-violet);
    }

    .bc-docs--empty-title {
      margin: 8px 0 0;
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }

    .bc-docs--empty-text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-docs--fab {
      --f7-fab-bg-color: var(--bc-primary-action);
      --f7-fab-text-color: var(--bc-on-primary-action);
    }

    :global(.md) .bc-docs--fab > a {
      box-sizing: border-box;
      gap: 8px;
      padding-inline: 16px;
    }

    :global(.md) .bc-docs--fab > a i {
      position: static;
      transform: none;
      display: flex;
    }

    :global(.md) .bc-docs--fab .fab-text {
      padding: 0;
    }

    .bc-docs--bottom {
      height: 96px;
    }
  }
</style>
