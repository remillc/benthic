<script>
  // @ts-check
  // « Informations » of « Mon profil de plongeur » (task 2026-11-18-272, docs/mockups-release/profil-infos-android.dc.html
  // and profil-infos-sans-accord-android.dc.html): « Vous » (date of birth), « Contact d’urgence » (name and relationship,
  // phone with its country code) and « Santé » (blood group, « Vous seul »). The blood group is a health datum, kept
  // only with the diver's consent (task 2026-11-18-271): without it the row says « Non gardé » and has « Autoriser »,
  // which turns the consent on at once and opens the edit. The lock note shows the consent date and « Retirer l’accord ».
  import BackLink from '../components/BackLink.svelte';
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { diver, loadProfile, refreshConsent, changeProfile } from '../lib/profile.svelte.js';
  import { UNKNOWN_BLOOD } from '../lib/profile.js';
  import { formatInternational } from '../lib/phone-format.js';
  import { formatDate, formatStampDate } from '../lib/profile-format.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  onMount(async () => {
    await loadProfile();
    refreshConsent();
  });

  const info = $derived(diver.info);
  const consent = $derived(diver.consent.consent);
  const contact = $derived([info.emergency.name, info.emergency.relation].filter(Boolean).join(' · '));
  const phone = $derived(formatInternational(info.emergency.phone));
  const blood = $derived(info.bloodGroup === UNKNOWN_BLOOD ? t('diverProfile.info.unknown') : info.bloodGroup);

  async function allow() {
    try {
      await changeProfile((_p, c) => c.give());
      showSnackbar(t('diverProfile.info.allowed'));
      f7router.navigate('/profile/info/edit');
    } catch {
      showSnackbar(t('diverProfile.info.saveFailed'));
    }
  }

  function withdraw() {
    confirmAction({
      title: t('diverProfile.info.withdrawTitle'),
      text: t('diverProfile.info.withdrawText'),
      action: t('diverProfile.info.withdraw'),
      cancel: t('diverProfile.info.cancel'),
      onConfirm: async () => {
        try {
          await changeProfile((_p, c) => c.withdraw());
          showSnackbar(t('diverProfile.info.withdrawn'));
        } catch {
          showSnackbar(t('diverProfile.info.saveFailed'));
        }
      },
    });
  }
</script>

{#snippet body()}

  <h2 class="bc-profile-info--section">{t('diverProfile.info.you')}</h2>
  <div class="bc-profile-info--card">
    <div class="bc-profile-info--row bc-profile-info--row-icon">
      <span class="bc-profile-info--tile" aria-hidden="true"><Icon name="account" size={22} weight={1.8} /></span>
      <span class="bc-profile-info--texts">
        <span class="bc-profile-info--label">{t('diverProfile.info.fullName')}</span>
        <span class="bc-profile-info--value" class:bc-profile-info--empty={!info.fullName}>{info.fullName || t('diverProfile.info.empty')}</span>
      </span>
    </div>
    <div class="bc-profile-info--row">
      <span class="bc-profile-info--label">{t('diverProfile.info.dob')}</span>
      <span class="bc-profile-info--value" class:bc-profile-info--empty={!info.dateOfBirth}>{formatDate(info.dateOfBirth) || t('diverProfile.info.empty')}</span>
    </div>
  </div>

  <h2 class="bc-profile-info--section">{t('diverProfile.info.emergency')}</h2>
  <div class="bc-profile-info--card">
    <div class="bc-profile-info--row">
      <span class="bc-profile-info--label">{t('diverProfile.info.nameRelation')}</span>
      <span class="bc-profile-info--value" class:bc-profile-info--empty={!contact}>{contact || t('diverProfile.info.empty')}</span>
    </div>
    <div class="bc-profile-info--row">
      <span class="bc-profile-info--label">{t('diverProfile.info.phone')}</span>
      <span class="bc-profile-info--value" class:bc-profile-info--empty={!phone}>{phone || t('diverProfile.info.empty')}</span>
    </div>
  </div>

  <h2 class="bc-profile-info--section">{t('diverProfile.info.health')}</h2>
  <div class="bc-profile-info--card">
    <div class="bc-profile-info--row">
      <span class="bc-profile-info--label">{t('diverProfile.info.blood')}</span>
      <span class="bc-profile-info--line">
        {#if consent}
          <span class="bc-profile-info--value" class:bc-profile-info--empty={!blood}>{blood || t('diverProfile.info.empty')}</span>
          <span class="bc-profile-info--tag"><Icon name="lock" size={14} />{t('diverProfile.info.onlyYou')}</span>
        {:else}
          <span class="bc-profile-info--value bc-profile-info--empty"><Icon name="lock" size={16} />{t('diverProfile.info.notKept')}</span>
          <button type="button" class="bc-profile-info--allow" onclick={allow}>{t('diverProfile.info.allow')}</button>
        {/if}
      </span>
    </div>
  </div>

  <p class="bc-profile-info--note">
    <Icon name="lock" size={18} />
    {#if consent}
      <span>
        {diver.consent.at ? t('diverProfile.info.lockNote', { date: formatStampDate(diver.consent.at) }) : t('diverProfile.info.lockNoteNoDate')}
        <button type="button" class="bc-profile-info--withdraw" onclick={withdraw}>{t('diverProfile.info.withdraw')}</button>
      </span>
    {:else}
      <span>{t('diverProfile.info.deniedNote')}</span>
    {/if}
  </p>
{/snippet}

<Page class="bc-profile-info">
  <Navbar title={t('diverProfile.info.title')}>
    {#snippet left()}
      <BackLink label={t('gear.profile.title')} name={t('diverProfile.info.back')} />
    {/snippet}
    {#snippet right()}
      <a href="/profile/info/edit" class="link icon-only" aria-label={t('diverProfile.info.edit')}><Icon name="edit" /></a>
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
    :global(.bc-profile-info .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-profile-info--section {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-profile-info--card {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-profile-info--row.bc-profile-info--row-icon {
      min-height: 72px;
      flex-direction: row;
      align-items: center;
      gap: 16px;
    }

    .bc-profile-info--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-tile);
      color: var(--bc-text);
    }

    .bc-profile-info--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-profile-info--row {
      min-height: 64px;
      padding: 10px 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-profile-info--line {
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-profile-info--row + .bc-profile-info--row {
      border-top: 1px solid var(--bc-separator);
    }

    .bc-profile-info--label {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-profile-info--value {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 17px;
      line-height: 24px;
    }

    .bc-profile-info--empty {
      color: var(--bc-text-2);
    }

    .bc-profile-info--tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 28px;
      padding: 0 10px;
      border-radius: 14px;
      background: var(--bc-release-tile);
      color: var(--bc-release-tile-icon);
      font-size: 13px;
      font-weight: 500;
    }

    .bc-profile-info--allow {
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-profile-info--note {
      margin: 16px 32px 24px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-profile-info--withdraw {
      display: inline;
      padding: 8px 0;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-weight: 600;
      text-decoration: underline;
    }
  }
</style>
