<script>
  // @ts-check
  // The left pane of « Mon profil de plongeur » on a wide screen (tasks 2026-11-18-275 and 277): the way back, the diver
  // (avatar, name, OpenDives+ chip) and the four entries; the chosen one is lit.
  import { f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import { gear, loadInventory, visibleGear, overdueBadge, hasActiveMaintenance } from '../lib/inventory.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { odplusAccount } from '../lib/benthic-plus-state.svelte.js';
  import { onMount } from 'svelte';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { goToSection } from '../lib/navigation.svelte.js';
  import { PROFILE_SECTIONS, showProfilePath, heroOf, readHero } from '../lib/profile-frame.js';
  import { profileWindow } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
  import { documentsLine } from '../lib/documents-text.js';

  /** @type {{ section: keyof typeof PROFILE_SECTIONS }} */
  let { section } = $props();

  onMount(() => {
    if (!diver.ready) loadProfile().catch((e) => console.error('Reading the profile', e));
    if (!gear.ready) loadInventory().catch((e) => console.error('Reading the inventory', e));
  });

  // The Mac's profile window does not load the logbook: the main window left the diver's line.
  const hero = $derived(profileWindow ? readHero() : heroOf(logbook, odplusAccount));
  const name = $derived(diver.info.fullName || hero.name || t('gear.profile.defaultName'));
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

<nav class="bc-profile-nav" aria-label={t('gear.profile.title')}>
  <div class="bc-profile-nav--head">
    {#if !profileWindow}<button type="button" class="bc-profile-nav--back" aria-label={t('gear.piece.back')} onclick={leave}><i class="icon icon-back"></i></button>{/if}
    <h1 class="bc-profile-nav--title">{t('gear.profile.title')}</h1>
  </div>
  <div class="bc-profile-nav--hero">
    <span class="bc-profile-nav--initial" aria-hidden="true">{initial}</span>
    <span class="bc-profile-nav--who">
      <span class="bc-profile-nav--name">{name}</span>
      <span class="bc-profile-nav--line">{divesLine}</span>
      <BenthicPlusChip onLight />
    </span>
  </div>
  <h2 class="bc-profile-nav--section">{t('gear.profile.keep')}</h2>
  <div class="bc-profile-nav--list">
    {#each entries as e (e.id)}
      {#if e.id !== 'maintenance' || hasActiveMaintenance()}
        <button type="button" class="bc-profile-nav--row" class:bc-profile-nav--on={section === e.id} aria-current={section === e.id ? 'page' : undefined} onclick={() => showProfilePath(PROFILE_SECTIONS[e.id])}>
          <span class="bc-profile-nav--tile bc-profile-nav--tile-{e.tone}"><Icon name={e.icon} size={22} weight={1.8} /></span>
          <span class="bc-profile-nav--texts">
            <span class="bc-profile-nav--label">{t(e.label)}</span>
            {#if lines[e.id]}<span class="bc-profile-nav--supporting">{lines[e.id]}</span>{/if}
          </span>
          {#if e.id === 'maintenance' && overdue > 0}<span class="bc-profile-nav--badge" role="status" aria-label={t('maintenance.badge', { n: overdue })}>{overdue}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
  <p class="bc-profile-nav--note"><Icon name="lock" size={16} /><span>{t('gear.profile.keptWide')}</span></p>
</nav>

<style>
  @layer od.components {
    .bc-profile-nav {
      flex: none;
      width: var(--bc-pf-nav);
      box-sizing: border-box;
      height: 100%;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      padding: 0 8px 16px;
      background: var(--bc-background);
      border-right: 1px solid var(--bc-separator);
    }
    .bc-profile-nav--head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 64px;
      padding: 0 12px;
    }
    .bc-profile-nav--back {
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 20px;
      background: none;
      color: var(--bc-text);
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .bc-profile-nav--title {
      margin: 0;
      font-size: 22px;
      font-weight: 500;
      line-height: 28px;
    }
    .bc-profile-nav--hero {
      flex: none;
      margin: 0 0 8px;
      padding: 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--bc-surface);
    }
    .bc-profile-nav--initial {
      flex: none;
      width: 52px;
      height: 52px;
      border-radius: 26px;
      display: grid;
      place-items: center;
      background: var(--bc-nav-avatar-ink);
      color: #FFFFFF;
      font-size: 22px;
      font-weight: 600;
    }
    .bc-profile-nav--who {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
    .bc-profile-nav--name {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 18px;
      font-weight: 600;
    }
    .bc-profile-nav--line {
      color: var(--bc-text-2);
      font-size: 14px;
    }
    .bc-profile-nav--section {
      margin: 8px 12px 4px;
      color: var(--bc-text-2);
      font-size: 14px;
      font-weight: 600;
    }
    .bc-profile-nav--list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .bc-profile-nav--row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 8px 12px;
      border: 0;
      border-radius: 16px;
      background: none;
      color: var(--bc-text);
      text-align: start;
      font: inherit;
      cursor: pointer;
    }
    .bc-profile-nav--row:hover {
      background: color-mix(in srgb, var(--bc-text) 6%, transparent);
    }
    .bc-profile-nav--on,
    .bc-profile-nav--on:hover {
      background: var(--bc-selected-container);
    }
    .bc-profile-nav--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: var(--bc-text);
    }
    .bc-profile-nav--tile-blue {
      background: var(--bc-release-tile);
    }
    .bc-profile-nav--tile-amber {
      background: var(--bc-maintenance);
      color: var(--bc-maintenance-icon);
    }
    .bc-profile-nav--tile-violet {
      background: var(--bc-tile-violet);
    }
    .bc-profile-nav--tile-red {
      background: var(--bc-error-container);
    }
    .bc-profile-nav--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .bc-profile-nav--label {
      font-size: 16px;
      font-weight: 500;
    }
    .bc-profile-nav--supporting {
      color: var(--bc-text-2);
      font-size: 14px;
    }
    .bc-profile-nav--badge {
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      box-sizing: border-box;
      border-radius: 11px;
      display: grid;
      place-items: center;
      background: var(--bc-alarm);
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 600;
    }
    .bc-profile-nav--note {
      margin: auto 8px 0;
      padding-top: 16px;
      display: flex;
      gap: 8px;
      align-items: flex-start;
      color: var(--bc-text-2);
      font-size: 13px;
    }
  }
</style>
