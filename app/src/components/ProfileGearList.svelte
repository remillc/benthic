<script>
  // @ts-check
  // The list pane of « Équipement » on a wide screen (tasks 2026-11-18-275 and 277, docs/mockups-release/bureau-profil-equipement):
  // the title with a search and ⋮, « Entretien », the kits as chips, the inventory grouped by type, and « Ajouter une
  // pièce ». The chosen piece is lit; it opens in the pane to the right. The phone's page (pages/ProfileGear.svelte) has
  // the same content in one column.
  import { onMount } from 'svelte';
  import { f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import GearIcon from './GearIcon.svelte';
  import ReadOnlyNotice from './ReadOnlyNotice.svelte';
  import GearExportSheet from './GearExportSheet.svelte';
  import { gear, loadInventory, visibleGear, figuresOf, computerDiveCounts, setReadOnly, maintenanceSections } from '../lib/inventory.svelte.js';
  import { groupGear, searchGear } from '../lib/inventory.js';
  import { showProfilePath } from '../lib/profile-frame.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** The tint of a type's tile, the same as the new piece dialog's. @type {Record<string, string>} */
  const TONES = { computer: 'var(--od-release-tile)', bcd: 'var(--od-release-tile)', regulator: 'var(--od-tile-green)', suit: 'var(--od-tile-beige)', undersuit: 'var(--od-tile-beige)', cylinder: 'var(--od-tile-violet)' };

  /** `selected`: the piece open in the right pane. @type {{ selected?: string|null }} */
  let { selected = null } = $props();

  let showArchived = $state(false);
  let searching = $state(false);
  let query = $state('');
  let exporting = $state(false);
  /** @type {Map<string, number>} */
  let computerDives = $state(new Map());
  /** @type {HTMLInputElement|undefined} */
  let field = $state();

  const groups = $derived(groupGear(searchGear(visibleGear(showArchived), query)));
  const upkeep = $derived(maintenanceSections().counts);
  const upkeepLine = $derived(
    upkeep.overdue || upkeep.soon
      ? [upkeep.overdue ? t('maintenance.cardLine.overdue', { n: upkeep.overdue }) : '', upkeep.soon ? t('maintenance.cardLine.soon', { n: upkeep.soon }) : ''].filter(Boolean).join(' · ')
      : upkeep.ok
        ? t('maintenance.cardLine.allGood')
        : t('maintenance.cardLine.none'),
  );
  const empty = $derived(gear.ready && !gear.pieces.some((g) => !g.retired) && !showArchived);

  onMount(async () => {
    await loadInventory();
    computerDives = await computerDiveCounts();
  });

  /** @param {import('../lib/inventory.js').Gear} g */
  function subLine(g) {
    const n = figuresOf(g, computerDives).dives;
    const first = g.type === 'computer' ? (g.serial ? t('gear.inventory.serialLine', { serial: g.serial }) : '') : (g.note ?? '');
    return [first, n ? t('gear.inventory.dives', { n }) : ''].filter(Boolean).join(' · ');
  }

  function openSearch() {
    searching = true;
    setTimeout(() => field?.focus(), 50);
  }
  function closeSearch() {
    searching = false;
    query = '';
  }

  /** @param {MouseEvent} e */
  function more(e) {
    /** @type {import('../lib/popup-menu.js').MenuItem[]} */
    const items = [
      { label: t('gear.inventory.export'), onclick: () => (exporting = true), disabled: !gear.pieces.length },
      { label: showArchived ? t('gear.inventory.hideArchived') : t('gear.inventory.showArchived'), onclick: () => (showArchived = !showArchived) },
    ];
    if (import.meta.env?.DEV) items.push({ label: gear.readOnly ? t('gear.inventory.devReadOnlyOff') : t('gear.inventory.devReadOnlyOn'), onclick: () => setReadOnly(!gear.readOnly), divider: true });
    openPopupMenu(/** @type {HTMLElement} */ (e.currentTarget), items, t('gear.inventory.more'));
  }

  /** @param {string} path */
  const push = (path) => f7.views.current.router.navigate(path);
  function newKit() {
    if (gear.readOnly) showSnackbar(t('gear.inventory.readOnlyRefused'));
    else push('/profile/kits/new');
  }
</script>

<section class="od-gear-list" aria-label={t('gear.inventory.title')}>
  <header class="od-gear-list--head">
    {#if searching}
      <input bind:this={field} class="od-gear-list--search" type="search" bind:value={query} placeholder={t('gear.inventory.search')} aria-label={t('gear.inventory.search')} />
      <button type="button" class="od-gear-list--icon" aria-label={t('gear.inventory.searchClose')} onclick={closeSearch}><Icon name="close" size={22} /></button>
    {:else}
      <h1 class="od-gear-list--title">{t('gear.inventory.title')}</h1>
      <button type="button" class="od-gear-list--icon" aria-label={t('gear.inventory.search')} onclick={openSearch}><Icon name="search" size={22} /></button>
      <button type="button" class="od-gear-list--icon" aria-label={t('gear.inventory.more')} aria-haspopup="menu" onclick={more}><Icon name="more" size={22} weight={4} /></button>
    {/if}
  </header>
  <div class="od-gear-list--scroll">
    <ReadOnlyNotice onexport={() => (exporting = true)} />
    {#if !searching}
      <button type="button" class="od-gear-list--upkeep" onclick={() => showProfilePath('/profile/maintenance/')}>
        <span class="od-gear-list--tile od-gear-list--tile-late"><Icon name="clock" size={22} /></span>
        <span class="od-gear-list--texts">
          <span class="od-gear-list--name">{t('maintenance.entry')}</span>
          <span class="od-gear-list--supporting">{upkeepLine}</span>
        </span>
        <Icon name="chevron" size={20} />
      </button>
      <h2 class="od-gear-list--group">{t('gear.inventory.kits')}</h2>
      <div class="od-gear-list--chips">
        {#each gear.kits as kit (kit.id)}
          <button type="button" class="od-gear-list--chip" aria-label={t('gear.inventory.kitChip', { name: kit.name, n: kit.gearIds.length })} onclick={() => showProfilePath(`/profile/kits/${kit.id}`)}>
            <Icon name="briefcase" size={18} />{kit.name}<span>{kit.gearIds.length}</span>
          </button>
        {/each}
        <button type="button" class="od-gear-list--chip" onclick={newKit}><Icon name="plus" size={18} />{t('gear.inventory.newKit')}</button>
      </div>
    {/if}
    {#if empty}
      <div class="od-gear-list--empty">
        <h2>{t('gear.inventory.emptyTitle')}</h2>
        <p>{t('gear.inventory.emptyText')}</p>
      </div>
    {:else if !groups.length}
      <p class="od-gear-list--empty">{t('gear.inventory.noResults')}</p>
    {/if}
    {#each groups as { group, items } (group)}
      <h2 class="od-gear-list--group">{t(`gear.inventory.group.${group}`)}</h2>
      {#each items as g (g.id)}
        <button type="button" class="od-gear-list--row" class:od-gear-list--on={selected === g.id} aria-current={selected === g.id ? 'true' : undefined} onclick={() => showProfilePath(`/profile/gear/${g.id}`)}>
          <span class="od-gear-list--tile" style:background={TONES[g.type] ?? 'var(--od-background)'}><GearIcon type={g.type} name={g.name} size={22} /></span>
          <span class="od-gear-list--texts">
            <span class="od-gear-list--name">{g.name}{#if g.retired}<span class="od-gear-list--badge">{t('gear.inventory.archivedBadge')}</span>{/if}</span>
            {#if subLine(g)}<span class="od-gear-list--supporting">{subLine(g)}</span>{/if}
          </span>
        </button>
      {/each}
    {/each}
    <div class="od-gear-list--bottom"></div>
  </div>
  {#if !gear.readOnly}
    <button type="button" class="od-gear-list--add" onclick={() => push('/profile/gear/new')}><Icon name="plus" size={22} />{t('gear.inventory.add')}</button>
  {/if}
</section>

<GearExportSheet opened={exporting} pieces={gear.pieces} onclose={() => (exporting = false)} />

<style>
  @layer od.components {
    .od-gear-list {
      position: relative;
      flex: none;
      width: var(--od-pf-list);
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: var(--od-surface);
      border-right: 1px solid var(--od-separator);
    }
    .od-gear-list--head {
      flex: none;
      height: 64px;
      padding: 0 12px 0 20px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .od-gear-list--title {
      flex: 1;
      margin: 0;
      font-size: 22px;
      font-weight: 500;
    }
    .od-gear-list--search {
      flex: 1;
      min-width: 0;
      height: 40px;
      padding: 0 12px;
      border: 0;
      border-radius: 20px;
      background: var(--od-background);
      color: var(--od-text);
      font: inherit;
    }
    .od-gear-list--icon {
      flex: none;
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
    .od-gear-list--scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0 8px;
    }
    .od-gear-list--upkeep {
      width: 100%;
      min-height: 64px;
      padding: 8px 16px;
      border: 0;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--od-maintenance);
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .od-gear-list--group {
      margin: 16px 12px 4px;
      color: var(--od-text-2);
      font-size: 14px;
      font-weight: 600;
    }
    .od-gear-list--chips {
      padding: 0 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .od-gear-list--chip {
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid var(--od-separator);
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      cursor: pointer;
    }
    .od-gear-list--chip span {
      color: var(--od-text-2);
    }
    .od-gear-list--row {
      width: 100%;
      min-height: 64px;
      padding: 8px 12px;
      border: 0;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .od-gear-list--row:hover {
      background: color-mix(in srgb, var(--od-text) 6%, transparent);
    }
    .od-gear-list--on,
    .od-gear-list--on:hover {
      background: var(--od-selected-container);
    }
    .od-gear-list--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
    }
    .od-gear-list--tile-late {
      background: var(--od-surface);
      color: var(--od-maintenance-icon);
    }
    .od-gear-list--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .od-gear-list--name {
      font-size: 16px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-gear-list--supporting {
      color: var(--od-text-2);
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-gear-list--badge {
      margin-inline-start: 8px;
      padding: 0 6px;
      border-radius: 6px;
      background: var(--od-background);
      font-size: 12px;
      font-weight: 500;
    }
    .od-gear-list--empty {
      margin: 24px 16px;
      color: var(--od-text-2);
      text-align: center;
    }
    .od-gear-list--bottom {
      height: 88px;
    }
    .od-gear-list--add {
      position: absolute;
      inset-inline-end: 16px;
      bottom: 16px;
      height: 56px;
      padding: 0 20px;
      border: 0;
      border-radius: 16px;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: var(--od-selected-container);
      color: var(--od-text);
      font: inherit;
      font-weight: 500;
      box-shadow: var(--od-tile-shadow);
      cursor: pointer;
    }
  }
</style>
