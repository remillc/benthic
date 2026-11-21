<script>
  // @ts-check
  // « Mon profil de plongeur » (task 2026-11-17-267, docs/mockups-release/profil-plongeur-android.dc.html): the
  // diver's initial, name, number of dives and the OpenDives+ chip, then three entries: « Équipement », « Brevets » and
  // « Informations » (task 2026-11-18-272).
  import BackLink from '../components/BackLink.svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import BenthicPlusChip from '../components/BenthicPlusChip.svelte';
  import { gear, loadInventory, visibleGear, overdueBadge, hasActiveMaintenance } from '../lib/inventory.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { t } from '../lib/i18n.js';
  import { documentsLine } from '../lib/documents-text.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';
  import { desktopApp, layout } from '../lib/layout.svelte.js';

  const name = $derived(diver.info.fullName || logbook.email || t('gear.profile.defaultName'));
  const initial = $derived(name.trim().charAt(0).toLocaleUpperCase());
  const total = $derived(logbook.dives.length);
  const since = $derived(logbook.dives.reduce((year, d) => Math.min(year, Number(d.date.slice(0, 4)) || year), 9999));
  const divesLine = $derived(total ? t('gear.profile.divesSince', { n: total, year: String(since) }) : t('gear.profile.noDive'));
  const certsLine = $derived(documentsLine(diver.certs));
  const overdue = $derived(overdueBadge());
  const equipmentLine = $derived(
    gear.ready && visibleGear().length ? `${t('gear.inventory.pieces', { n: visibleGear().length })} · ${t('gear.inventory.kitCount', { n: gear.kits.length })}` : t('gear.profile.noPiece'),
  );
</script>

{#snippet body()}

  <div class="bc-profile--hero">
    <span class="bc-profile--initial" aria-hidden="true">{initial}</span>
    <span class="bc-profile--who">
      <span class="bc-profile--name">{name}</span>
      <span class="bc-profile--line">{divesLine}</span>
      <BenthicPlusChip onLight />
    </span>
  </div>

  <a href="/profile/emergency" class="bc-profile--emergency">
    <span class="bc-profile--emergency-icon"><Icon name="warning" size={22} weight={1.8} /></span>
    <span class="bc-profile--texts">
      <span class="bc-profile--emergency-label">{t('emergency.entry')}</span>
      <span class="bc-profile--emergency-text">{t('emergency.entryText')}</span>
    </span>
    <span class="bc-profile--chevron"><Icon name="chevron" size={20} /></span>
  </a>

  <h2 class="bc-profile--section">{t('gear.profile.keep')}</h2>
  <div class="bc-profile--list">
    <a href="/profile/gear/" class="bc-profile--row">
      <span class="bc-profile--tile bc-profile--tile-blue"><Icon name="briefcase" size={22} weight={1.8} /></span>
      <span class="bc-profile--texts">
        <span class="bc-profile--label">{t('gear.profile.equipment')}</span>
        <span class="bc-profile--supporting">{equipmentLine}</span>
      </span>
      <span class="bc-profile--chevron"><Icon name="chevron" size={20} /></span>
    </a>
    {#if hasActiveMaintenance()}
      <a href="/profile/maintenance/" class="bc-profile--row">
        <span class="bc-profile--tile bc-profile--tile-amber"><Icon name="bell" size={22} weight={1.8} /></span>
        <span class="bc-profile--texts">
          <span class="bc-profile--label">{t('maintenance.entry')}</span>
        </span>
        {#if overdue > 0}<span class="bc-profile--badge" role="status" aria-label={t('maintenance.badge', { n: overdue })}>{overdue}</span>{/if}
        <span class="bc-profile--chevron"><Icon name="chevron" size={20} /></span>
      </a>
    {/if}
    <a href="/profile/certs/" class="bc-profile--row">
      <span class="bc-profile--tile bc-profile--tile-violet"><Icon name="idCard" size={22} weight={1.8} /></span>
      <span class="bc-profile--texts">
        <span class="bc-profile--label">{t('gear.profile.certifications')}</span>
        <span class="bc-profile--supporting">{certsLine}</span>
      </span>
      <span class="bc-profile--chevron"><Icon name="chevron" size={20} /></span>
    </a>
    <a href="/profile/info" class="bc-profile--row">
      <span class="bc-profile--tile bc-profile--tile-red"><Icon name="account" size={22} weight={1.8} /></span>
      <span class="bc-profile--texts">
        <span class="bc-profile--label">{t('gear.profile.information')}</span>
        <span class="bc-profile--supporting">{t('gear.profile.informationLine')}</span>
      </span>
      <span class="bc-profile--chevron"><Icon name="chevron" size={20} /></span>
    </a>
  </div>

  <p class="bc-profile--note"><Icon name="info" size={18} /><span>{t('gear.profile.kept')}</span></p>
{/snippet}

<Page class="bc-profile" onPageBeforeIn={() => (loadInventory(), loadProfile())}>
  <Navbar title={t('gear.profile.title')}>
    {#snippet left()}
      {#if layout.phone && !desktopApp}<BackLink label={t('account.title')} name={t('gear.piece.back')} />{/if}
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="gear" list="gear" bar="none" />
  {:else}
    {@render body()}
  {/if}
</Page>

<style>
  @layer od.components {
    .bc-profile--emergency {
      margin: 12px 16px 0;
      min-height: 72px;
      padding: 12px 16px;
      border-radius: 24px;
      background: var(--bc-emergency);
      color: var(--bc-on-emergency);
      display: flex;
      align-items: center;
      gap: 16px;
      text-decoration: none;
    }

    .bc-profile--emergency .bc-profile--chevron {
      color: inherit;
    }

    .bc-profile--emergency-icon {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: var(--bc-surface);
      color: var(--bc-emergency);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-profile--emergency-label {
      display: block;
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
    }

    .bc-profile--emergency-text {
      display: block;
      font-size: 14px;
      line-height: 20px;
      opacity: 0.95;
    }

    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.bc-profile .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-profile--hero {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--bc-surface);
    }

    .bc-profile--initial {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-nav-avatar-ink);
      color: #FFFFFF;
      font-size: 24px;
      font-weight: 600;
    }

    .bc-profile--who {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .bc-profile--name {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }

    .bc-profile--line {
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-profile--section {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-profile--list {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-profile--row {
      box-sizing: border-box;
      min-height: 72px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--bc-text);
      text-decoration: none;
    }

    .bc-profile--row + .bc-profile--row {
      border-top: 1px solid var(--bc-separator);
    }

    .bc-profile--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bc-text);
    }

    .bc-profile--tile-blue {
      background: var(--bc-release-tile);
    }

    .bc-profile--tile-amber {
      background: var(--bc-maintenance);
      color: var(--bc-maintenance-icon);
    }

    .bc-profile--badge {
      flex: none;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      box-sizing: border-box;
      border-radius: 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-alarm);
      color: #FFFFFF;
      font-size: 13px;
      line-height: 22px;
      font-weight: 600;
    }

    .bc-profile--tile-violet {
      background: var(--bc-tile-violet);
    }

    .bc-profile--tile-red {
      background: var(--bc-error-container);
    }

    .bc-profile--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-profile--label {
      font-size: 16px;
      line-height: 21px;
    }

    .bc-profile--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-profile--chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-profile--note {
      margin: 16px 32px 24px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
  }
</style>
