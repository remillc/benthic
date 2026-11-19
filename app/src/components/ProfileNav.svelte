<script>
  // @ts-check
  // The left pane of « Mon profil de plongeur » on a wide screen (tasks 2026-11-18-275 and 277): the way back, the diver
  // (avatar, name, OpenDives+ chip) and the four entries; the chosen one is lit.
  import { f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import OdPlusChip from './OdPlusChip.svelte';
  import { gear, visibleGear, overdueBadge } from '../lib/inventory.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { diver } from '../lib/profile.svelte.js';
  import { goToSection } from '../lib/navigation.svelte.js';
  import { PROFILE_SECTIONS, showProfilePath, heroOf, readHero } from '../lib/profile-frame.js';
  import { profileWindow } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
  import { documentsLine } from '../lib/documents-text.js';

  /** @type {{ section: keyof typeof PROFILE_SECTIONS }} */
  let { section } = $props();

  // The Mac's profile window does not load the logbook: the main window left the diver's line.
  const hero = $derived(profileWindow ? readHero() : heroOf(logbook));
  const name = $derived(hero.name || t('gear.profile.defaultName'));
  const initial = $derived(name.trim().charAt(0).toLocaleUpperCase());
  const total = $derived(hero.total);
  const since = $derived(hero.since);
  const divesLine = $derived(total ? t('gear.profile.divesSince', { n: total, year: String(since) }) : t('gear.profile.noDive'));
  const overdue = $derived(overdueBadge());
  /** @type {Record<string, string>} */
  const lines = $derived({
    gear: gear.ready && visibleGear().length ? `${t('gear.inventory.pieces', { n: visibleGear().length })} · ${t('gear.inventory.kitCount', { n: gear.kits.length })}` : t('gear.profile.noPiece'),
    maintenance: '',
    certs: documentsLine(diver.certs),
    info: t('gear.profile.informationLine'),
  });
  const entries = /** @type {const} */ ([
    { id: 'gear', icon: 'briefcase', tone: 'blue', label: 'gear.profile.equipment' },
    { id: 'maintenance', icon: 'bell', tone: 'amber', label: 'maintenance.entry' },
    { id: 'certs', icon: 'idCard', tone: 'violet', label: 'gear.profile.certifications' },
    { id: 'info', icon: 'account', tone: 'red', label: 'gear.profile.information' },
  ]);

  /** Leaves the profile: back to the section it was opened over. */
  function leave() {
    const router = f7.views.current?.router;
    // The pages the panes replaced left one entry only, so one Back leaves.
    if (router && router.history.length > 1) router.back({ force: true });
    else goToSection('logbook');
  }
</script>

<nav class="od-profile-nav" aria-label={t('gear.profile.title')}>
  <div class="od-profile-nav--head">
    {#if !profileWindow}<button type="button" class="od-profile-nav--back" aria-label={t('gear.piece.back')} onclick={leave}><i class="icon icon-back"></i></button>{/if}
    <h1 class="od-profile-nav--title">{t('gear.profile.title')}</h1>
  </div>
  <div class="od-profile-nav--hero">
    <span class="od-profile-nav--initial" aria-hidden="true">{initial}</span>
    <span class="od-profile-nav--who">
      <span class="od-profile-nav--name">{name}</span>
      <span class="od-profile-nav--line">{divesLine}</span>
      <OdPlusChip onLight />
    </span>
  </div>
  <h2 class="od-profile-nav--section">{t('gear.profile.keep')}</h2>
  <div class="od-profile-nav--list">
    {#each entries as e (e.id)}
      <button type="button" class="od-profile-nav--row" class:od-profile-nav--on={section === e.id} aria-current={section === e.id ? 'page' : undefined} onclick={() => showProfilePath(PROFILE_SECTIONS[e.id])}>
        <span class="od-profile-nav--tile od-profile-nav--tile-{e.tone}"><Icon name={e.icon} size={22} weight={1.8} /></span>
        <span class="od-profile-nav--texts">
          <span class="od-profile-nav--label">{t(e.label)}</span>
          {#if lines[e.id]}<span class="od-profile-nav--supporting">{lines[e.id]}</span>{/if}
        </span>
        {#if e.id === 'maintenance' && overdue > 0}<span class="od-profile-nav--badge" role="status" aria-label={t('maintenance.badge', { n: overdue })}>{overdue}</span>{/if}
      </button>
    {/each}
  </div>
  <p class="od-profile-nav--note"><Icon name="lock" size={16} /><span>{t('gear.profile.keptWide')}</span></p>
</nav>

<style>
  @layer od.components {
    .od-profile-nav {
      flex: none;
      width: var(--od-pf-nav);
      box-sizing: border-box;
      height: 100%;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      padding: 0 8px 16px;
      background: var(--od-background);
      border-right: 1px solid var(--od-separator);
    }
    .od-profile-nav--head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 64px;
      padding: 0 12px;
    }
    .od-profile-nav--back {
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 20px;
      background: none;
      color: var(--od-text);
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .od-profile-nav--title {
      margin: 0;
      font-size: 22px;
      font-weight: 500;
      line-height: 28px;
    }
    .od-profile-nav--hero {
      flex: none;
      margin: 0 0 8px;
      padding: 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--od-surface);
    }
    .od-profile-nav--initial {
      flex: none;
      width: 52px;
      height: 52px;
      border-radius: 26px;
      display: grid;
      place-items: center;
      background: var(--od-nav-avatar-ink);
      color: #FFFFFF;
      font-size: 22px;
      font-weight: 600;
    }
    .od-profile-nav--who {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
    .od-profile-nav--name {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 18px;
      font-weight: 600;
    }
    .od-profile-nav--line {
      color: var(--od-text-2);
      font-size: 14px;
    }
    .od-profile-nav--section {
      margin: 8px 12px 4px;
      color: var(--od-text-2);
      font-size: 14px;
      font-weight: 600;
    }
    .od-profile-nav--list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .od-profile-nav--row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 8px 12px;
      border: 0;
      border-radius: 16px;
      background: none;
      color: var(--od-text);
      text-align: start;
      font: inherit;
      cursor: pointer;
    }
    .od-profile-nav--row:hover {
      background: color-mix(in srgb, var(--od-text) 6%, transparent);
    }
    .od-profile-nav--on,
    .od-profile-nav--on:hover {
      background: var(--od-selected-container);
    }
    .od-profile-nav--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: var(--od-text);
    }
    .od-profile-nav--tile-blue {
      background: var(--od-release-tile);
    }
    .od-profile-nav--tile-amber {
      background: var(--od-maintenance);
      color: var(--od-maintenance-icon);
    }
    .od-profile-nav--tile-violet {
      background: var(--od-tile-violet);
    }
    .od-profile-nav--tile-red {
      background: var(--od-error-container);
    }
    .od-profile-nav--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .od-profile-nav--label {
      font-size: 16px;
      font-weight: 500;
    }
    .od-profile-nav--supporting {
      color: var(--od-text-2);
      font-size: 14px;
    }
    .od-profile-nav--badge {
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      box-sizing: border-box;
      border-radius: 11px;
      display: grid;
      place-items: center;
      background: var(--od-alarm);
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 600;
    }
    .od-profile-nav--note {
      margin: auto 8px 0;
      padding-top: 16px;
      display: flex;
      gap: 8px;
      align-items: flex-start;
      color: var(--od-text-2);
      font-size: 13px;
    }
  }
</style>
