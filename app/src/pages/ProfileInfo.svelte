<script>
  // @ts-check
  // « Informations » of « Mon profil de plongeur » (task 2026-11-18-272, docs/mockups-release/profil-infos-android.dc.html
  // and profil-infos-sans-accord-android.dc.html): « Vous » (date of birth), « Contact d’urgence » (name and relationship,
  // phone with its country code) and « Santé » (blood group, « Vous seul »). The pencil edits in place (todo #119): the
  // sections turn into fields and the bar offers « Enregistrer »; the system Back leaves the editing without saving
  // (lib/back-button.js sends od-cancel). `?edit=1` opens the page already editing (the emergency sheet uses it).
  import BackLink from '../components/BackLink.svelte';
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import DateField from '../components/DateField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { diver, loadProfile, changeProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { BLOOD_GROUPS, UNKNOWN_BLOOD, infoProblems } from '../lib/profile.js';
  import { COUNTRIES, countryLabel, formatNational, formatInternational } from '../lib/phone-format.js';
  import { formatDate } from '../lib/profile-format.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { profileWide } from '../lib/profile-frame.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route?: any }} */
  let { f7route } = $props();

  let editing = $state(false);
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
    if (f7route?.query?.edit) startEdit();
  });

  function startEdit() {
    const i = diver.info;
    fullName = i.fullName;
    dateOfBirth = i.dateOfBirth;
    contactName = i.emergency.name;
    relation = i.emergency.relation;
    country = i.emergency.phone.country;
    number = formatNational(i.emergency.phone.number, country);
    blood = i.bloodGroup;
    editing = true;
  }

  function cancelEdit() {
    editing = false;
  }

  /** The system Back (lib/back-button.js) asks the page to stop editing. @param {HTMLElement} node */
  function cancelable(node) {
    node.addEventListener('od-cancel', cancelEdit);
    return { destroy: () => node.removeEventListener('od-cancel', cancelEdit) };
  }

  // The number formats itself for the chosen country as it is typed.
  $effect(() => {
    if (!editing) return;
    const formatted = formatNational(number, country);
    if (formatted !== number) number = formatted;
  });

  const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: countryLabel(c.code) }));
  const bloodOptions = $derived([{ value: UNKNOWN_BLOOD, label: t('diverProfile.info.unknown') }, ...BLOOD_GROUPS.map((g) => ({ value: g, label: g }))]);
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
      editing = false;
    } catch {
      showSnackbar(t('diverProfile.info.saveFailed'));
    } finally {
      saving = false;
    }
  }

  const info = $derived(diver.info);
  const contact = $derived([info.emergency.name, info.emergency.relation].filter(Boolean).join(' · '));
  const phone = $derived(formatInternational(info.emergency.phone));
  const bloodLabel = $derived(info.bloodGroup === UNKNOWN_BLOOD ? t('diverProfile.info.unknown') : info.bloodGroup);
</script>

{#snippet body()}
  {#if editing}
    <div class="bc-profile-info--editing" use:cancelable>
      <ReadOnlyNotice />

      <h2 class="bc-profile-info--section">{t('diverProfile.info.you')}</h2>
      <div class="bc-profile-info--fields">
        <TextField label={t('diverProfile.info.fullNameLabel')} bind:value={fullName} supporting={t('diverProfile.info.fullNameHint')} autocomplete="name" />
        <div class="bc-profile-info--birth"><DateField label={t('diverProfile.info.dob')} bind:value={dateOfBirth} supporting={dobLive.error} /></div>
      </div>

      <h2 class="bc-profile-info--section">{t('diverProfile.info.emergency')}</h2>
      <div class="bc-profile-info--fields">
        <TextField label={t('diverProfile.info.contactNameLabel')} bind:value={contactName} supporting={t('diverProfile.info.contactNameHint')} autocomplete="off" />
        <div class="bc-profile-info--relation"><ComboField label={t('diverProfile.info.relationLabel')} bind:value={relation} options={relationOptions} supporting={t('diverProfile.info.relationHint')} /></div>
        <div class="bc-profile-info--phone">
          <div class="bc-profile-info--country"><SelectField label={t('diverProfile.info.countryCode')} bind:value={country} options={countryOptions} /></div>
          <div class="bc-profile-info--number">
            <TextField label={t('diverProfile.info.phone')} bind:value={number} inputmode="numeric" autocomplete="tel-national" invalid={!!phoneLive.error} supporting={phoneLive.error || t('diverProfile.info.phoneHint')} />
          </div>
        </div>
      </div>

      <h2 class="bc-profile-info--section">{t('diverProfile.info.health')}</h2>
      <div class="bc-profile-info--fields">
        <SelectField label={t('diverProfile.info.blood')} bind:value={blood} options={bloodOptions} clearLabel={t('diverProfile.info.clearBlood')} supporting={t('diverProfile.info.bloodHint')} />
      </div>
      <div class="bc-profile-info--bottom"></div>
    </div>
  {:else}
    <h2 class="bc-profile-info--section">{t('diverProfile.info.you')}</h2>
    <div class="bc-profile-info--card">
      <div class="bc-profile-info--row bc-profile-info--row-icon">
        <span class="bc-profile-info--tile" aria-hidden="true"><Icon name="account" size={22} weight={1.8} /></span>
        <span class="bc-profile-info--texts">
          <span class="bc-profile-info--label">{t('diverProfile.info.fullName')}</span>
          {#if info.fullName}<span class="bc-profile-info--value">{info.fullName}</span>{/if}
        </span>
      </div>
      <div class="bc-profile-info--row">
        <span class="bc-profile-info--label">{t('diverProfile.info.dob')}</span>
        {#if info.dateOfBirth}<span class="bc-profile-info--value">{formatDate(info.dateOfBirth)}</span>{/if}
      </div>
    </div>

    <h2 class="bc-profile-info--section">{t('diverProfile.info.emergency')}</h2>
    <div class="bc-profile-info--card">
      <div class="bc-profile-info--row">
        <span class="bc-profile-info--label">{t('diverProfile.info.nameRelation')}</span>
        {#if contact}<span class="bc-profile-info--value">{contact}</span>{/if}
      </div>
      <div class="bc-profile-info--row">
        <span class="bc-profile-info--label">{t('diverProfile.info.phone')}</span>
        {#if phone}<span class="bc-profile-info--value">{phone}</span>{/if}
      </div>
    </div>

    <h2 class="bc-profile-info--section">{t('diverProfile.info.health')}</h2>
    <div class="bc-profile-info--card">
      <div class="bc-profile-info--row">
        <span class="bc-profile-info--label">{t('diverProfile.info.blood')}</span>
        {#if bloodLabel}
          <span class="bc-profile-info--line">
            <span class="bc-profile-info--value">{bloodLabel}</span>
            <span class="bc-profile-info--tag"><Icon name="lock" size={14} />{t('diverProfile.info.onlyYou')}</span>
          </span>
        {/if}
      </div>
    </div>

    <p class="bc-profile-info--note">
      <Icon name="lock" size={18} />
      <span>{t('diverProfile.info.lockNoteNoDate')}</span>
    </p>
  {/if}
{/snippet}

<Page class="bc-profile-info">
  <Navbar title={t('diverProfile.info.title')}>
    {#snippet left()}
      {#if editing}
        <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), cancelEdit())}>
          <Icon name="close" /><span class="bc-sr-only">{t('diverProfile.info.close')}</span>
        </a>
      {:else}
        <BackLink label={t('gear.profile.title')} name={t('diverProfile.info.back')} />
      {/if}
    {/snippet}
    {#snippet right()}
      {#if editing}
        <button type="button" class="bc-profile-info--save" disabled={!canSave} onclick={save}>{t('diverProfile.info.save')}</button>
      {:else}
        <a href="#edit" class="link icon-only external bc-profile-info--edit-button" role="button" aria-label={t('diverProfile.info.edit')} onclick={(e) => (e.preventDefault(), startEdit())}><Icon name="edit" /></a>
      {/if}
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

    .bc-profile-info--note {
      margin: 16px 32px 24px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-profile-info--save {
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

    .bc-profile-info--save:disabled {
      opacity: 0.38;
    }

    .bc-profile-info--fields {
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-profile-info--birth {
      width: min(100%, 224px);
    }

    .bc-profile-info--relation {
      width: min(100%, 272px);
    }

    .bc-profile-info--phone {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .bc-profile-info--country {
      flex: 0 0 132px;
    }

    .bc-profile-info--number {
      flex: 0 1 200px;
      min-width: 0;
    }

    .bc-profile-info--bottom {
      height: 48px;
    }
  }
</style>
