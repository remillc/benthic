<script>
  // @ts-check
  // « Modifier les informations » (task 2026-11-18-272, docs/mockups-release/profil-infos-modifier-android.dc.html): the
  // date of birth, the emergency contact (name and relationship, « Indicatif » and « Téléphone » side by side, the number
  // formats itself for the country as it is typed) and the blood group (a menu: « Inconnu », O−, O+, A−, A+, B−, B+, AB−,
  // AB+). The fields are checked as the diver types.
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import DateField from '../components/DateField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import { diver, loadProfile, changeProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { BLOOD_GROUPS, UNKNOWN_BLOOD, infoProblems } from '../lib/profile.js';
  import { COUNTRIES, countryLabel, formatNational } from '../lib/phone-format.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  let fullName = $state('');
  let dateOfBirth = $state('');
  let contactName = $state('');
  let relation = $state('');
  let country = $state('CA');
  let number = $state('');
  let blood = $state('');
  let saving = $state(false);

  onMount(async () => {
    await Promise.all([loadProfile(), loadInventory()]);
    const i = diver.info;
    fullName = i.fullName;
    dateOfBirth = i.dateOfBirth;
    contactName = i.emergency.name;
    relation = i.emergency.relation;
    country = i.emergency.phone.country;
    number = formatNational(i.emergency.phone.number, country);
    blood = i.bloodGroup;
  });

  // The number formats itself for the chosen country as it is typed.
  $effect(() => {
    const formatted = formatNational(number, country);
    if (formatted !== number) number = formatted;
  });

  const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: countryLabel(c.code) }));
  const bloodOptions = $derived([{ value: '', label: t('diverProfile.info.empty') }, { value: UNKNOWN_BLOOD, label: t('diverProfile.info.unknown') }, ...BLOOD_GROUPS.map((g) => ({ value: g, label: g }))]);

  /** The usual relationships; « Lien » also takes any other text. */
  const relationOptions = $derived(['spouse', 'parent', 'child', 'friend', 'sibling'].map((k) => t(`diverProfile.info.relations.${k}`)));

  const draft = $derived({ fullName, dateOfBirth, emergency: { name: contactName.trim(), relation: relation.trim(), phone: { country, number } }, bloodGroup: blood });
  const problems = $derived(infoProblems(draft));
  const dobLive = liveError(
    () => dateOfBirth,
    () => (problems.dateOfBirth ? t('diverProfile.info.dobFuture') : ''),
  );
  const phoneLive = liveError(
    () => number,
    () => (problems.phone ? t('diverProfile.info.phoneIncomplete') : ''),
  );
  const canSave = $derived(!Object.keys(problems).length && !saving && !gear.readOnly);

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      await changeProfile((p) => p.saveInfo(draft));
      showSnackbar(t('diverProfile.info.saved'));
      f7router.back();
    } catch {
      showSnackbar(t('diverProfile.info.saveFailed'));
    } finally {
      saving = false;
    }
  }
</script>

{#snippet body()}

  <ReadOnlyNotice />

  <h2 class="bc-profile-edit--section">{t('diverProfile.info.you')}</h2>
  <div class="bc-profile-edit--fields">
    <TextField label={t('diverProfile.info.fullNameLabel')} bind:value={fullName} supporting={t('diverProfile.info.fullNameHint')} autocomplete="name" />
    <div class="bc-profile-edit--birth"><DateField label={t('diverProfile.info.dob')} bind:value={dateOfBirth} supporting={dobLive.error} /></div>
  </div>

  <h2 class="bc-profile-edit--section">{t('diverProfile.info.emergency')}</h2>
  <div class="bc-profile-edit--fields">
    <TextField label={t('diverProfile.info.contactNameLabel')} bind:value={contactName} supporting={t('diverProfile.info.contactNameHint')} autocomplete="off" />
    <div class="bc-profile-edit--relation"><ComboField label={t('diverProfile.info.relationLabel')} bind:value={relation} options={relationOptions} supporting={t('diverProfile.info.relationHint')} /></div>
    <div class="bc-profile-edit--phone">
      <div class="bc-profile-edit--country"><SelectField label={t('diverProfile.info.countryCode')} bind:value={country} options={countryOptions} /></div>
      <div class="bc-profile-edit--number">
        <TextField label={t('diverProfile.info.phone')} bind:value={number} inputmode="numeric" autocomplete="tel-national" invalid={!!phoneLive.error} supporting={phoneLive.error || t('diverProfile.info.phoneHint')} />
      </div>
    </div>
  </div>

  <h2 class="bc-profile-edit--section">{t('diverProfile.info.health')}</h2>
  <div class="bc-profile-edit--fields">
    <SelectField label={t('diverProfile.info.blood')} bind:value={blood} options={bloodOptions} clearLabel={t('diverProfile.info.clearBlood')} supporting={t('diverProfile.info.bloodHint')} />
  </div>
  <div class="bc-profile-edit--bottom"></div>
{/snippet}

<Page class="bc-profile-edit">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="bc-sr-only">{t('diverProfile.info.close')}</span>
      </a>
    {/snippet}
    {#snippet title()}{t('diverProfile.info.title')}{/snippet}
    {#snippet right()}
      <button type="button" class="bc-profile-edit--save" disabled={!canSave} onclick={save}>{t('diverProfile.info.save')}</button>
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
    :global(.bc-profile-edit .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-profile-edit--save {
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
    }

    .bc-profile-edit--save:disabled {
      opacity: 0.38;
    }

    .bc-profile-edit--section {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-profile-edit--fields {
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-profile-edit--birth {
      width: min(100%, 224px);
    }

    .bc-profile-edit--relation {
      width: min(100%, 272px);
    }

    .bc-profile-edit--phone {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .bc-profile-edit--country {
      flex: 0 0 132px;
    }

    .bc-profile-edit--number {
      flex: 0 1 200px;
      min-width: 0;
    }

    .bc-profile-edit--bottom {
      height: 48px;
    }
  }
</style>
