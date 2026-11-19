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
  import { formatLongDate, formatStampDate } from '../lib/profile-format.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

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

<Page class="od-profile-info">
  <Navbar title={t('diverProfile.info.title')}>
    {#snippet left()}
      <BackLink label={t('gear.profile.title')} name={t('diverProfile.info.back')} />
    {/snippet}
    {#snippet right()}
      <a href="/profile/info/edit" class="link icon-only" aria-label={t('diverProfile.info.edit')}><Icon name="edit" /></a>
    {/snippet}
  </Navbar>

  <h2 class="od-profile-info--section">{t('diverProfile.info.you')}</h2>
  <div class="od-profile-info--card">
    <div class="od-profile-info--row">
      <span class="od-profile-info--label">{t('diverProfile.info.dob')}</span>
      <span class="od-profile-info--value" class:od-profile-info--empty={!info.dateOfBirth}>{formatLongDate(info.dateOfBirth) || t('diverProfile.info.empty')}</span>
    </div>
  </div>

  <h2 class="od-profile-info--section">{t('diverProfile.info.emergency')}</h2>
  <div class="od-profile-info--card">
    <div class="od-profile-info--row">
      <span class="od-profile-info--label">{t('diverProfile.info.nameRelation')}</span>
      <span class="od-profile-info--value" class:od-profile-info--empty={!contact}>{contact || t('diverProfile.info.empty')}</span>
    </div>
    <div class="od-profile-info--row">
      <span class="od-profile-info--label">{t('diverProfile.info.phone')}</span>
      <span class="od-profile-info--value" class:od-profile-info--empty={!phone}>{phone || t('diverProfile.info.empty')}</span>
    </div>
  </div>

  <h2 class="od-profile-info--section">{t('diverProfile.info.health')}</h2>
  <div class="od-profile-info--card">
    <div class="od-profile-info--row">
      <span class="od-profile-info--label">{t('diverProfile.info.blood')}</span>
      <span class="od-profile-info--line">
        {#if consent}
          <span class="od-profile-info--value" class:od-profile-info--empty={!blood}>{blood || t('diverProfile.info.empty')}</span>
          <span class="od-profile-info--tag"><Icon name="lock" size={14} />{t('diverProfile.info.onlyYou')}</span>
        {:else}
          <span class="od-profile-info--value od-profile-info--empty"><Icon name="lock" size={16} />{t('diverProfile.info.notKept')}</span>
          <button type="button" class="od-profile-info--allow" onclick={allow}>{t('diverProfile.info.allow')}</button>
        {/if}
      </span>
    </div>
  </div>

  <p class="od-profile-info--note">
    <Icon name="lock" size={18} />
    {#if consent}
      <span>
        {diver.consent.at ? t('diverProfile.info.lockNote', { date: formatStampDate(diver.consent.at) }) : t('diverProfile.info.lockNoteNoDate')}
        <button type="button" class="od-profile-info--withdraw" onclick={withdraw}>{t('diverProfile.info.withdraw')}</button>
      </span>
    {:else}
      <span>{t('diverProfile.info.deniedNote')}</span>
    {/if}
  </p>
</Page>

<style>
  @layer od.components {
    :global(.od-profile-info .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-profile-info--section {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-profile-info--card {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-profile-info--row {
      min-height: 64px;
      padding: 10px 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-profile-info--line {
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-profile-info--row + .od-profile-info--row {
      border-top: 1px solid var(--od-separator);
    }

    .od-profile-info--label {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-profile-info--value {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 17px;
      line-height: 24px;
    }

    .od-profile-info--empty {
      color: var(--od-text-2);
    }

    .od-profile-info--tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 28px;
      padding: 0 10px;
      border-radius: 14px;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
      font-size: 13px;
      font-weight: 500;
    }

    .od-profile-info--allow {
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-profile-info--note {
      margin: 16px 32px 24px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-profile-info--withdraw {
      display: inline;
      padding: 8px 0;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-weight: 600;
      text-decoration: underline;
    }
  }
</style>
