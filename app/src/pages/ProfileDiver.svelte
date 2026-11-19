<script>
  // @ts-check
  // « Mon profil de plongeur » (task 2026-11-17-267, docs/mockups-release/profil-plongeur-android.dc.html): the
  // diver's initial, name, number of dives and the OpenDives+ chip, then three entries: « Équipement », « Brevets » and
  // « Informations » (task 2026-11-18-272).
  import BackLink from '../components/BackLink.svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import OdPlusChip from '../components/OdPlusChip.svelte';
  import { gear, loadInventory, visibleGear, overdueBadge } from '../lib/inventory.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { t } from '../lib/i18n.js';

  const name = $derived(logbook.email || t('gear.profile.defaultName'));
  const initial = $derived(name.trim().charAt(0).toLocaleUpperCase());
  const total = $derived(logbook.dives.length);
  const since = $derived(logbook.dives.reduce((year, d) => Math.min(year, Number(d.date.slice(0, 4)) || year), 9999));
  const divesLine = $derived(total ? t('gear.profile.divesSince', { n: total, year: String(since) }) : t('gear.profile.noDive'));
  const certsLine = $derived(diver.certs.length ? t('gear.profile.certificationsLine', { n: diver.certs.length }) : t('gear.profile.noCertification'));
  const overdue = $derived(overdueBadge());
  const equipmentLine = $derived(
    gear.ready && visibleGear().length ? `${t('gear.inventory.pieces', { n: visibleGear().length })} · ${t('gear.inventory.kitCount', { n: gear.kits.length })}` : t('gear.profile.noPiece'),
  );
</script>

<Page class="od-profile" onPageBeforeIn={() => (loadInventory(), loadProfile())}>
  <Navbar title={t('gear.profile.title')}>
    {#snippet left()}
      <BackLink label={t('account.title')} name={t('gear.piece.back')} />
    {/snippet}
  </Navbar>

  <div class="od-profile--hero">
    <span class="od-profile--initial" aria-hidden="true">{initial}</span>
    <span class="od-profile--who">
      <span class="od-profile--name">{name}</span>
      <span class="od-profile--line">{divesLine}</span>
      <OdPlusChip onLight />
    </span>
  </div>

  <h2 class="od-profile--section">{t('gear.profile.keep')}</h2>
  <div class="od-profile--list">
    <a href="/profile/gear/" class="od-profile--row">
      <span class="od-profile--tile od-profile--tile-blue"><Icon name="briefcase" size={22} weight={1.8} /></span>
      <span class="od-profile--texts">
        <span class="od-profile--label">{t('gear.profile.equipment')}</span>
        <span class="od-profile--supporting">{equipmentLine}</span>
      </span>
      <span class="od-profile--chevron"><Icon name="chevron" size={20} /></span>
    </a>
    <a href="/profile/maintenance/" class="od-profile--row">
      <span class="od-profile--tile od-profile--tile-amber"><Icon name="bell" size={22} weight={1.8} /></span>
      <span class="od-profile--texts">
        <span class="od-profile--label">{t('maintenance.entry')}</span>
      </span>
      {#if overdue > 0}<span class="od-profile--badge" role="status" aria-label={t('maintenance.badge', { n: overdue })}>{overdue}</span>{/if}
      <span class="od-profile--chevron"><Icon name="chevron" size={20} /></span>
    </a>
    <a href="/profile/certs/" class="od-profile--row">
      <span class="od-profile--tile od-profile--tile-violet"><Icon name="idCard" size={22} weight={1.8} /></span>
      <span class="od-profile--texts">
        <span class="od-profile--label">{t('gear.profile.certifications')}</span>
        <span class="od-profile--supporting">{certsLine}</span>
      </span>
      <span class="od-profile--chevron"><Icon name="chevron" size={20} /></span>
    </a>
    <a href="/profile/info" class="od-profile--row">
      <span class="od-profile--tile od-profile--tile-red"><Icon name="account" size={22} weight={1.8} /></span>
      <span class="od-profile--texts">
        <span class="od-profile--label">{t('gear.profile.information')}</span>
        <span class="od-profile--supporting">{t('gear.profile.informationLine')}</span>
      </span>
      <span class="od-profile--chevron"><Icon name="chevron" size={20} /></span>
    </a>
  </div>

  <p class="od-profile--note"><Icon name="info" size={18} /><span>{t('gear.profile.kept')}</span></p>
</Page>

<style>
  @layer od.components {
    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.od-profile .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-profile--hero {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--od-surface);
    }

    .od-profile--initial {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-nav-avatar-ink);
      color: #FFFFFF;
      font-size: 24px;
      font-weight: 600;
    }

    .od-profile--who {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .od-profile--name {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }

    .od-profile--line {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-profile--section {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-profile--list {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-profile--row {
      box-sizing: border-box;
      min-height: 72px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--od-text);
      text-decoration: none;
    }

    .od-profile--row + .od-profile--row {
      border-top: 1px solid var(--od-separator);
    }

    .od-profile--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-text);
    }

    .od-profile--tile-blue {
      background: var(--od-release-tile);
    }

    .od-profile--tile-amber {
      background: var(--od-maintenance);
      color: var(--od-maintenance-icon);
    }

    .od-profile--badge {
      flex: none;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      box-sizing: border-box;
      border-radius: 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--od-alarm);
      color: #FFFFFF;
      font-size: 13px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-profile--tile-violet {
      background: var(--od-tile-violet);
    }

    .od-profile--tile-red {
      background: var(--od-error-container);
    }

    .od-profile--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-profile--label {
      font-size: 16px;
      line-height: 21px;
    }

    .od-profile--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-profile--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-profile--note {
      margin: 16px 32px 24px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
