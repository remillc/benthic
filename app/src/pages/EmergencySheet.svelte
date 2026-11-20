<script>
  // @ts-check
  // « Fiche d’urgence » (OpenDives+, task 2026-11-19-311, docs/mockups/urgence-fiche-android.dc.html): the diver's name, birth
  // date and age, blood type, emergency contact (« Appeler Marc » opens the phone's dialer), diving insurance with its
  // emergency line, the medical certificate and, if asked, the highest certificate. Built from the profile kept on the
  // device, so it opens without a network. The header shares it (image or PDF) and chooses its content (pencil).
  import BackLink from '../components/BackLink.svelte';
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import DocumentChoiceSheet from '../components/DocumentChoiceSheet.svelte';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { buildSheet, sheetText, readInclude } from '../lib/emergency.js';
  import { shareEmergency } from '../lib/emergency-share.js';
  import { deviceStore } from '../lib/device-store.js';
  import { formatDate } from '../lib/format.js';
  import { todayIso } from '../lib/maintenance.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  let sharing = $state(false);

  onMount(loadProfile);

  const text = $derived(
    sheetText(
      buildSheet({ info: diver.info, docs: diver.certs, include: readInclude(deviceStore), today: todayIso() }),
      { t, date: formatDate, otherAgency: t('diverProfile.cert.agencyOther'), unknownBlood: t('emergency.unknownBlood') },
    ),
  );
  const hasBlood = $derived(!!text.blood);
  const shareOptions = $derived([
    { value: 'image', icon: 'image', title: t('emergency.share.image'), text: t('emergency.share.imageText') },
    { value: 'pdf', icon: 'document', title: t('emergency.share.pdf'), text: t('emergency.share.pdfText') },
  ]);

  /** @param {string} kind @param {string} id */
  const documentHref = (kind, id) => (kind === 'certificate' ? `/profile/certs/${id}` : `/profile/documents/${id}`);

  /** @param {string} how */
  async function share(how) {
    sharing = false;
    try {
      await shareEmergency(text, /** @type {'image'|'pdf'} */ (how));
    } catch (e) {
      if (!/cancel/i.test(String(/** @type {any} */ (e)?.message ?? ''))) showSnackbar(t('emergency.share.failed'));
    }
  }
</script>

{#snippet body()}
  <div class="bc-emergency">
    <div class="bc-emergency--hero">
      <div class="bc-emergency--who">
        <span class="bc-emergency--kicker">{t('emergency.diver')}</span>
        {#if text.name}
          <span class="bc-emergency--name">{text.name}</span>
        {:else}
          <span class="bc-emergency--name bc-emergency--name-empty">{t('emergency.noName')}</span>
        {/if}
        {#if text.birthLine}<span class="bc-emergency--birth">{text.birthLine}</span>{/if}
        {#if !text.name}<a href="/profile/info?edit=1" class="bc-emergency--fill">{t('emergency.noNameLink')}</a>{/if}
      </div>
      {#if hasBlood}
        <div class="bc-emergency--blood">
          <span class="bc-emergency--blood-label">{t('emergency.blood')}</span>
          <span class="bc-emergency--blood-value">{text.blood}</span>
        </div>
      {/if}
    </div>

    {#each text.blocks as b (b.kind)}
      <section class="bc-emergency--card bc-emergency--card-{b.kind}" aria-label={b.title}>
        <h2 class="bc-emergency--title">{b.title}</h2>
        {#if b.docId}
          <a href={documentHref(b.kind, b.docId)} class="bc-emergency--link">
            <span class="bc-emergency--texts">
              {#if b.name}<span class="bc-emergency--card-name">{b.name}</span>{:else}<span class="bc-emergency--card-name">{b.title}</span>{/if}
              {#if b.line}<span class="bc-emergency--line">{b.line}</span>{/if}
            </span>
            <span class="bc-emergency--chevron"><Icon name="chevron" size={20} /></span>
          </a>
        {:else}
          <span class="bc-emergency--texts">
            <span class="bc-emergency--card-name">{b.name}</span>
            {#if b.line}<span class="bc-emergency--line">{b.line}</span>{/if}
          </span>
        {/if}
        {#if b.call}
          <a href={b.call.tel} class="bc-emergency--call external"><Icon name="phone" size={20} weight={1.8} />{b.call.label}</a>
        {/if}
        {#if b.hotline}
          <div class="bc-emergency--hotline">
            <span class="bc-emergency--hotline-label">{b.hotline.label}</span>
            <a href={b.hotline.tel} class="bc-emergency--hotline-number external">{b.hotline.number}</a>
          </div>
        {/if}
      </section>
    {/each}
    {#if !text.blocks.length && !text.birthLine && !hasBlood}<p class="bc-emergency--none">{t('emergency.nothingYet')}</p>{/if}

    <p class="bc-emergency--offline">{t('emergency.offline')}</p>
  </div>
{/snippet}

<Page class="bc-emergency-page">
  <Navbar title={t('emergency.title')}>
    {#snippet left()}
      <BackLink label={t('gear.profile.title')} name={t('emergency.back')} />
    {/snippet}
    {#snippet right()}
      <button type="button" class="link icon-only bc-emergency--bar" aria-label={t('emergency.share.title')} onclick={() => (sharing = true)}><Icon name="share" /></button>
      <a href="/profile/emergency/content" class="link icon-only" aria-label={t('emergency.edit')}><Icon name="edit" /></a>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="info">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

<DocumentChoiceSheet
  opened={sharing}
  title={t('emergency.share.title')}
  lead={t('emergency.share.lead') + (hasBlood ? t('emergency.share.health') : '')}
  options={shareOptions}
  cancel={t('emergency.share.cancel')}
  onchoose={share}
  onclose={() => (sharing = false)}
/>

<style>
  @layer od.components {
    .bc-emergency {
      max-width: 720px;
      margin-inline: auto;
      padding: 8px 16px calc(24px + var(--bc-safe-bottom));
    }

    .bc-emergency--hero {
      border-radius: 28px;
      background: var(--bc-emergency);
      color: var(--bc-on-emergency);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .bc-emergency--who {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-emergency--kicker {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.8px;
      opacity: 0.9;
    }

    .bc-emergency--name {
      font-size: 26px;
      line-height: 32px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .bc-emergency--name-empty {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .bc-emergency--birth {
      font-size: 15px;
    }

    .bc-emergency--fill {
      margin-top: 8px;
      align-self: flex-start;
      color: inherit;
      font-weight: 600;
      text-decoration: underline;
    }

    .bc-emergency--blood {
      flex: none;
      width: 88px;
      height: 88px;
      border-radius: 24px;
      background: var(--bc-surface);
      color: var(--bc-emergency);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .bc-emergency--blood-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.4px;
    }

    .bc-emergency--blood-value {
      font-size: 34px;
      line-height: 40px;
      font-weight: 700;
    }

    .bc-emergency--card {
      margin-top: 12px;
      border-radius: 24px;
      background: var(--bc-surface);
      padding: 16px;
    }

    .bc-emergency--title {
      margin: 0 0 4px;
      font-size: 12px;
      line-height: 16px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--bc-text-2);
    }

    .bc-emergency--link {
      display: flex;
      align-items: center;
      gap: 12px;
      color: inherit;
      text-decoration: none;
      min-height: 48px;
    }

    .bc-emergency--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-emergency--card-name {
      font-size: 20px;
      line-height: 26px;
      font-weight: 600;
    }

    .bc-emergency--line {
      font-size: 15px;
      color: var(--bc-text-2);
    }

    .bc-emergency--chevron {
      color: var(--bc-text-2);
    }

    .bc-emergency--call {
      margin-top: 12px;
      height: 48px;
      padding: 0 20px;
      border-radius: 24px;
      background: var(--bc-emergency);
      color: var(--bc-on-emergency);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
    }

    .bc-emergency--hotline {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--bc-outline-variant, var(--bc-surface-container-high));
      display: flex;
      flex-direction: column;
    }

    .bc-emergency--hotline-label {
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-emergency--hotline-number {
      font-size: 17px;
      font-weight: 600;
      color: var(--bc-emergency);
      text-decoration: none;
    }

    .bc-emergency--none,
    .bc-emergency--offline {
      margin: 16px 8px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      text-align: center;
    }
  }
</style>
