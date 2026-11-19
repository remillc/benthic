<script>
  // @ts-check
  // « Contenu de la fiche » (OpenDives+, task 2026-11-19-311, docs/mockups/urgence-contenu-android.dc.html): one switch for
  // each item of the emergency sheet; the name is always shown. The choices stay on this device (lib/device-store.js).
  import BackLink from '../components/BackLink.svelte';
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import SwitchField from '../components/SwitchField.svelte';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';
  import { diver, loadProfile, refreshConsent } from '../lib/profile.svelte.js';
  import { ITEMS, buildSheet, readInclude, writeInclude, latestCertificate } from '../lib/emergency.js';
  import { agencyLabel } from '../lib/documents.js';
  import { deviceStore } from '../lib/device-store.js';
  import { formatDate } from '../lib/format.js';
  import { todayIso } from '../lib/maintenance.js';
  import { t } from '../lib/i18n.js';

  let include = $state(readInclude(deviceStore));

  onMount(async () => {
    await loadProfile();
    refreshConsent();
  });

  const consent = $derived(diver.consent.consent);
  // What each switch would show now, from everything on: the line under its name.
  const all = $derived(buildSheet({ info: diver.info, docs: diver.certs, include: Object.fromEntries(ITEMS.map((k) => [k, true])), consent: true, today: todayIso() }));
  const cert = $derived(latestCertificate(diver.certs));

  /** @param {(typeof ITEMS)[number]} key */
  function line(key) {
    const c = all.contact;
    switch (key) {
      case 'birth':
        return t('emergency.content.birthText');
      case 'blood':
        return consent ? t('emergency.content.bloodText') : t('emergency.content.bloodDenied');
      case 'contact':
        return c ? [c.name, c.relation].filter(Boolean).join(' · ') || c.phone : t('emergency.nothingYet');
      case 'insurance':
        return all.insurance ? t('emergency.content.insuranceText', { name: all.insurance.insurer }) : t('emergency.nothingYet');
      case 'medical':
        return all.medical ? t('emergency.content.medicalText', { date: formatDate(all.medical.expiresOn) }) : t('emergency.nothingYet');
      default:
        return cert ? [agencyLabel(cert, t('diverProfile.cert.agencyOther')), cert.level].filter(Boolean).join(' ') : t('emergency.nothingYet');
    }
  }

  /** @param {(typeof ITEMS)[number]} key */
  const save = (key) => (checked) => {
    include = { ...include, [key]: checked };
    writeInclude(deviceStore, include);
  };
</script>

{#snippet body()}
  <p class="od-emergency-content--lead">{t('emergency.content.lead')}</p>
  <div class="od-emergency-content--card">
    {#each ITEMS as key (key)}
      <SwitchField
        label={t(`emergency.content.${key}`)}
        supporting={line(key)}
        bind:checked={include[key]}
        disabled={key === 'blood' && !consent}
        onchange={save(key)}
      />
    {/each}
  </div>
{/snippet}

<Page class="od-emergency-content-page">
  <Navbar title={t('emergency.content.title')}>
    {#snippet left()}
      <BackLink label={t('emergency.title')} name={t('emergency.content.back')} />
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="info">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

<style>
  @layer od.components {
    :global(.od-emergency-content-page .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-emergency-content--lead {
      margin: 12px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-emergency-content--card {
      margin: 0 16px;
      padding: 4px 16px;
      border-radius: 20px;
      background: var(--od-surface);
    }
  }
</style>
