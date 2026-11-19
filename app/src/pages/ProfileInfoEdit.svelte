<script>
  // @ts-check
  // « Modifier les informations » (task 2026-11-18-272, docs/mockups-release/profil-infos-modifier-android.dc.html): the
  // date of birth, the emergency contact (name and relationship, « Indicatif » and « Téléphone » side by side, the number
  // formats itself for the country as it is typed) and the blood group (a menu: « Inconnu », O−, O+, A−, A+, B−, B+, AB−,
  // AB+). The fields are checked as the diver types. Without the consent the blood group is not editable.
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import DateField from '../components/DateField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import { diver, loadProfile, changeProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { BLOOD_GROUPS, UNKNOWN_BLOOD, infoProblems, ConsentRequiredError } from '../lib/profile.js';
  import { COUNTRIES, countryLabel, formatNational } from '../lib/phone-format.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  let dateOfBirth = $state('');
  let nameRelation = $state('');
  let country = $state('CA');
  let number = $state('');
  let blood = $state('');
  let saving = $state(false);

  onMount(async () => {
    await Promise.all([loadProfile(), loadInventory()]);
    const i = diver.info;
    dateOfBirth = i.dateOfBirth;
    nameRelation = [i.emergency.name, i.emergency.relation].filter(Boolean).join(' · ');
    country = i.emergency.phone.country;
    number = formatNational(i.emergency.phone.number, country);
    blood = i.bloodGroup;
  });

  // The number formats itself for the chosen country as it is typed.
  $effect(() => {
    const formatted = formatNational(number, country);
    if (formatted !== number) number = formatted;
  });

  const consent = $derived(diver.consent.consent);
  const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: countryLabel(c.code) }));
  const bloodOptions = $derived([{ value: UNKNOWN_BLOOD, label: t('diverProfile.info.unknown') }, ...BLOOD_GROUPS.map((g) => ({ value: g, label: g }))]);

  /** « Marc Tremblay · conjoint »: the name, then the relationship after the first « · ». @param {string} text */
  function splitContact(text) {
    const at = text.indexOf('·');
    return at < 0 ? { name: text.trim(), relation: '' } : { name: text.slice(0, at).trim(), relation: text.slice(at + 1).trim() };
  }

  const draft = $derived({ dateOfBirth, emergency: { ...splitContact(nameRelation), phone: { country, number } }, bloodGroup: consent ? blood : '' });
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
    } catch (e) {
      showSnackbar(t(e instanceof ConsentRequiredError ? 'diverProfile.info.bloodDenied' : 'diverProfile.info.saveFailed'));
    } finally {
      saving = false;
    }
  }
</script>

{#snippet body()}

  <ReadOnlyNotice />

  <h2 class="od-profile-edit--section">{t('diverProfile.info.you')}</h2>
  <div class="od-profile-edit--fields">
    <DateField label={t('diverProfile.info.dob')} bind:value={dateOfBirth} placeholder={t('diverProfile.info.dobHint')} supporting={dobLive.error} />
  </div>

  <h2 class="od-profile-edit--section">{t('diverProfile.info.emergency')}</h2>
  <div class="od-profile-edit--fields">
    <TextField label={t('diverProfile.info.nameRelationLabel')} bind:value={nameRelation} supporting={t('diverProfile.info.nameRelationHint')} />
    <div class="od-profile-edit--phone">
      <div class="od-profile-edit--country"><SelectField label={t('diverProfile.info.countryCode')} bind:value={country} options={countryOptions} /></div>
      <div class="od-profile-edit--number">
        <TextField label={t('diverProfile.info.phone')} bind:value={number} inputmode="numeric" autocomplete="tel-national" invalid={!!phoneLive.error} supporting={phoneLive.error || t('diverProfile.info.phoneHint')} />
      </div>
    </div>
  </div>

  <h2 class="od-profile-edit--section">{t('diverProfile.info.health')}</h2>
  <div class="od-profile-edit--fields">
    <SelectField label={t('diverProfile.info.blood')} bind:value={blood} options={bloodOptions} disabled={!consent} supporting={consent ? t('diverProfile.info.bloodHint') : t('diverProfile.info.bloodDenied')} />
  </div>
  <div class="od-profile-edit--bottom"></div>
{/snippet}

<Page class="od-profile-edit">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="od-sr-only">{t('diverProfile.info.close')}</span>
      </a>
    {/snippet}
    {#snippet title()}{t('diverProfile.info.title')}{/snippet}
    {#snippet right()}
      <button type="button" class="od-profile-edit--save" disabled={!canSave} onclick={save}>{t('diverProfile.info.save')}</button>
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
    :global(.od-profile-edit .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-profile-edit--save {
      height: 40px;
      margin-inline-end: 8px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-profile-edit--save:disabled {
      opacity: 0.38;
    }

    .od-profile-edit--section {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-profile-edit--fields {
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-profile-edit--phone {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .od-profile-edit--country {
      flex: 0 0 132px;
    }

    .od-profile-edit--number {
      flex: 1;
      min-width: 0;
    }

    .od-profile-edit--bottom {
      height: 48px;
    }
  }
</style>
