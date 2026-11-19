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
  import { diver, loadProfile, refreshConsent } from '../lib/profile.svelte.js';
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

  onMount(async () => {
    await loadProfile();
    refreshConsent();
  });

  const text = $derived(
    sheetText(
      buildSheet({ info: diver.info, docs: diver.certs, include: readInclude(deviceStore), consent: diver.consent.consent, today: todayIso() }),
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
  <div class="od-emergency">
    <div class="od-emergency--hero">
      <div class="od-emergency--who">
        <span class="od-emergency--kicker">{t('emergency.diver')}</span>
        {#if text.name}
          <span class="od-emergency--name">{text.name}</span>
        {:else}
          <span class="od-emergency--name od-emergency--name-empty">{t('emergency.noName')}</span>
        {/if}
        {#if text.birthLine}<span class="od-emergency--birth">{text.birthLine}</span>{/if}
        {#if !text.name}<a href="/profile/info/edit" class="od-emergency--fill">{t('emergency.noNameLink')}</a>{/if}
      </div>
      {#if hasBlood}
        <div class="od-emergency--blood">
          <span class="od-emergency--blood-label">{t('emergency.blood')}</span>
          <span class="od-emergency--blood-value">{text.blood}</span>
        </div>
      {/if}
    </div>

    {#each text.blocks as b (b.kind)}
      <section class="od-emergency--card od-emergency--card-{b.kind}" aria-label={b.title}>
        <h2 class="od-emergency--title">{b.title}</h2>
        {#if b.docId}
          <a href={documentHref(b.kind, b.docId)} class="od-emergency--link">
            <span class="od-emergency--texts">
              {#if b.name}<span class="od-emergency--card-name">{b.name}</span>{:else}<span class="od-emergency--card-name">{b.title}</span>{/if}
              {#if b.line}<span class="od-emergency--line">{b.line}</span>{/if}
            </span>
            <span class="od-emergency--chevron"><Icon name="chevron" size={20} /></span>
          </a>
        {:else}
          <span class="od-emergency--texts">
            <span class="od-emergency--card-name">{b.name}</span>
            {#if b.line}<span class="od-emergency--line">{b.line}</span>{/if}
          </span>
        {/if}
        {#if b.call}
          <a href={b.call.tel} class="od-emergency--call external"><Icon name="phone" size={20} weight={1.8} />{b.call.label}</a>
        {/if}
        {#if b.hotline}
          <div class="od-emergency--hotline">
            <span class="od-emergency--hotline-label">{b.hotline.label}</span>
            <a href={b.hotline.tel} class="od-emergency--hotline-number external">{b.hotline.number}</a>
          </div>
        {/if}
      </section>
    {/each}
    {#if !text.blocks.length && !text.birthLine && !hasBlood}<p class="od-emergency--none">{t('emergency.nothingYet')}</p>{/if}

    <p class="od-emergency--offline">{t('emergency.offline')}</p>
  </div>
{/snippet}

<Page class="od-emergency-page">
  <Navbar title={t('emergency.title')}>
    {#snippet left()}
      <BackLink label={t('gear.profile.title')} name={t('emergency.back')} />
    {/snippet}
    {#snippet right()}
      <button type="button" class="link icon-only od-emergency--bar" aria-label={t('emergency.share.title')} onclick={() => (sharing = true)}><Icon name="share" /></button>
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
    .od-emergency {
      max-width: 720px;
      margin-inline: auto;
      padding: 8px 16px calc(24px + var(--od-safe-bottom));
    }

    .od-emergency--hero {
      border-radius: 28px;
      background: var(--od-emergency);
      color: var(--od-on-emergency);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .od-emergency--who {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-emergency--kicker {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.8px;
      opacity: 0.9;
    }

    .od-emergency--name {
      font-size: 26px;
      line-height: 32px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .od-emergency--name-empty {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .od-emergency--birth {
      font-size: 15px;
    }

    .od-emergency--fill {
      margin-top: 8px;
      align-self: flex-start;
      color: inherit;
      font-weight: 600;
      text-decoration: underline;
    }

    .od-emergency--blood {
      flex: none;
      width: 88px;
      height: 88px;
      border-radius: 24px;
      background: var(--od-surface);
      color: var(--od-emergency);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .od-emergency--blood-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.4px;
    }

    .od-emergency--blood-value {
      font-size: 34px;
      line-height: 40px;
      font-weight: 700;
    }

    .od-emergency--card {
      margin-top: 12px;
      border-radius: 24px;
      background: var(--od-surface);
      padding: 16px;
    }

    .od-emergency--title {
      margin: 0 0 4px;
      font-size: 12px;
      line-height: 16px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--od-text-2);
    }

    .od-emergency--link {
      display: flex;
      align-items: center;
      gap: 12px;
      color: inherit;
      text-decoration: none;
      min-height: 48px;
    }

    .od-emergency--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-emergency--card-name {
      font-size: 20px;
      line-height: 26px;
      font-weight: 600;
    }

    .od-emergency--line {
      font-size: 15px;
      color: var(--od-text-2);
    }

    .od-emergency--chevron {
      color: var(--od-text-2);
    }

    .od-emergency--call {
      margin-top: 12px;
      height: 48px;
      padding: 0 20px;
      border-radius: 24px;
      background: var(--od-emergency);
      color: var(--od-on-emergency);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
    }

    .od-emergency--hotline {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--od-outline-variant, var(--od-surface-container-high));
      display: flex;
      flex-direction: column;
    }

    .od-emergency--hotline-label {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-emergency--hotline-number {
      font-size: 17px;
      font-weight: 600;
      color: var(--od-emergency);
      text-decoration: none;
    }

    .od-emergency--none,
    .od-emergency--offline {
      margin: 16px 8px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      text-align: center;
    }
  }
</style>
