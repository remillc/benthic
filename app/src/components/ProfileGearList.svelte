<script>
  // @ts-check
  // The list pane of « Équipement » on a wide screen (tasks 2026-11-18-275 and 277, docs/mockups-release/bureau-profil-equipement):
  // the title with a search and ⋮, « Entretien », the kits as chips, the inventory grouped by type, and « Ajouter une
  // pièce ». The chosen piece is lit; it opens in the pane to the right. The phone's page (pages/ProfileGear.svelte) has
  // the same content in one column.
  import { onMount } from 'svelte';
  import { f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import SearchClear from './SearchClear.svelte';
  import GearIcon from './GearIcon.svelte';
  import ReadOnlyNotice from './ReadOnlyNotice.svelte';
  import GearExportSheet from './GearExportSheet.svelte';
  import { gear, loadInventory, visibleGear, retiredGear, figuresOf, computerDiveCounts, setReadOnly, maintenanceSections, hasActiveMaintenance } from '../lib/inventory.svelte.js';
  import { groupGear, searchGear } from '../lib/inventory.js';
  import { showProfilePath } from '../lib/profile-frame.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** The tint of a type's tile, the same as the new piece dialog's. @type {Record<string, string>} */
  const TONES = { computer: 'var(--bc-release-tile)', bcd: 'var(--bc-release-tile)', regulator: 'var(--bc-tile-green)', suit: 'var(--bc-tile-beige)', undersuit: 'var(--bc-tile-beige)', cylinder: 'var(--bc-tile-violet)' };

  /** `selected`: the piece open in the right pane. @type {{ selected?: string|null }} */
  let { selected = null } = $props();

  let searching = $state(false);
  let query = $state('');
  let exporting = $state(false);
  /** @type {Map<string, number>} */
  let computerDives = $state(new Map());
  /** @type {HTMLInputElement|undefined} */
  let field = $state();

  const groups = $derived(groupGear(searchGear(visibleGear(), query)));
  const upkeep = $derived(maintenanceSections().counts);
  const upkeepLine = $derived(
    upkeep.overdue || upkeep.soon
      ? [upkeep.overdue ? t('maintenance.cardLine.overdue', { n: upkeep.overdue }) : '', upkeep.soon ? t('maintenance.cardLine.soon', { n: upkeep.soon }) : ''].filter(Boolean).join(' · ')
      : upkeep.ok
        ? t('maintenance.cardLine.allGood')
        : t('maintenance.cardLine.none'),
  );
  const empty = $derived(gear.ready && !gear.pieces.some((g) => !g.retired) && !retired.length);
  /** « Pièces retirées »: the row at the end of the list (task 2026-11-19-308). */
  const retired = $derived(retiredGear());

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

<section class="bc-gear-list" aria-label={t('gear.inventory.title')}>
  <header class="bc-gear-list--head">
    {#if searching}
      <div class="bc-gear-list--search">
        <input bind:this={field} type="search" bind:value={query} placeholder={t('gear.inventory.search')} aria-label={t('gear.inventory.search')} />
        {#if query}<SearchClear onclear={() => (query = '')} />{/if}
      </div>
      <button type="button" class="bc-gear-list--icon" aria-label={t('gear.inventory.searchClose')} onclick={closeSearch}><Icon name="close" size={22} /></button>
    {:else}
      <h1 class="bc-gear-list--title">{t('gear.inventory.title')}</h1>
      <button type="button" class="bc-gear-list--icon" aria-label={t('gear.inventory.search')} onclick={openSearch}><Icon name="search" size={22} /></button>
      <button type="button" class="bc-gear-list--icon" aria-label={t('gear.inventory.more')} aria-haspopup="menu" onclick={more}><Icon name="more" size={22} weight={4} /></button>
    {/if}
  </header>
  <div class="bc-gear-list--scroll">
    <ReadOnlyNotice onexport={() => (exporting = true)} />
    {#if !searching}
      {#if hasActiveMaintenance()}
        <button type="button" class="bc-gear-list--upkeep" onclick={() => showProfilePath('/profile/maintenance/')}>
          <span class="bc-gear-list--tile bc-gear-list--tile-late"><Icon name="clock" size={22} /></span>
          <span class="bc-gear-list--texts">
            <span class="bc-gear-list--name">{t('maintenance.entry')}</span>
            <span class="bc-gear-list--supporting">{upkeepLine}</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
      {/if}
      <h2 class="bc-gear-list--group">{t('gear.inventory.kits')}</h2>
      <div class="bc-gear-list--chips">
        {#each gear.kits as kit (kit.id)}
          <button type="button" class="bc-gear-list--chip" aria-label={t('gear.inventory.kitChip', { name: kit.name, n: kit.gearIds.length })} onclick={() => showProfilePath(`/profile/kits/${kit.id}`)}>
            <Icon name="briefcase" size={18} />{t('gear.addSheet.kitChip', { name: kit.name, n: kit.gearIds.length })}
          </button>
        {/each}
        <button type="button" class="bc-gear-list--chip" onclick={newKit}><Icon name="plus" size={18} />{t('gear.inventory.newKit')}</button>
      </div>
    {/if}
    {#if empty}
      <div class="bc-gear-list--empty">
        <h2>{t('gear.inventory.emptyTitle')}</h2>
        <p>{t('gear.inventory.emptyText')}</p>
      </div>
    {:else if !groups.length}
      <p class="bc-gear-list--empty">{t('gear.inventory.noResults')}</p>
    {/if}
    {#each groups as { group, items } (group)}
      <h2 class="bc-gear-list--group">{t(`gear.inventory.group.${group}`)}</h2>
      {#each items as g (g.id)}
        <button type="button" class="bc-gear-list--row" class:bc-gear-list--on={selected === g.id} aria-current={selected === g.id ? 'true' : undefined} onclick={() => showProfilePath(`/profile/gear/${g.id}`)}>
          <span class="bc-gear-list--tile" style:background={TONES[g.type] ?? 'var(--bc-background)'}><GearIcon type={g.type} name={g.name} size={22} piece={g} tile={40} /></span>
          <span class="bc-gear-list--texts">
            <span class="bc-gear-list--name">{g.name}</span>
            {#if subLine(g)}<span class="bc-gear-list--supporting">{subLine(g)}</span>{/if}
          </span>
        </button>
      {/each}
    {/each}
    {#if retired.length && !searching}
      <button type="button" class="bc-gear-list--row bc-gear-list--retired" class:bc-gear-list--on={selected === 'retired'} onclick={() => showProfilePath('/profile/gear/retired/')}>
        <span class="bc-gear-list--tile"><Icon name="archive" size={22} /></span>
        <span class="bc-gear-list--texts">
          <span class="bc-gear-list--name">{t('gear.inventory.retiredRow')}</span>
          <span class="bc-gear-list--supporting">{t('gear.inventory.retiredCount', { n: retired.length })}</span>
        </span>
      </button>
    {/if}
    <div class="bc-gear-list--bottom"></div>
  </div>
  {#if !gear.readOnly}
    <button type="button" class="bc-gear-list--add" onclick={() => push('/profile/gear/new')}><Icon name="plus" size={24} />{t('gear.inventory.add')}</button>
  {/if}
</section>

<GearExportSheet opened={exporting} pieces={gear.pieces} onclose={() => (exporting = false)} />

<style>
  @layer bc.components {
    .bc-gear-list {
      position: relative;
      flex: none;
      width: var(--bc-pf-list);
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: var(--bc-surface);
      border-right: 1px solid var(--bc-separator);
    }
    .bc-gear-list--head {
      flex: none;
      height: 64px;
      padding: 0 12px 0 20px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .bc-gear-list--title {
      flex: 1;
      margin: 0;
      font-size: 22px;
      font-weight: 500;
    }
    .bc-gear-list--search {
      flex: 1;
      min-width: 0;
      height: 40px;
      padding: 0 12px;
      border: 0;
      border-radius: 20px;
      background: var(--bc-background);
      color: var(--bc-text);
      font: inherit;
      display: flex;
      align-items: center;

      input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: none;
        background: none;
        color: inherit;
        font: inherit;
      }
    }
    .bc-gear-list--icon {
      flex: none;
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
    .bc-gear-list--scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0 8px;
    }
    .bc-gear-list--upkeep {
      width: 100%;
      min-height: 64px;
      padding: 8px 16px;
      border: 0;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bc-maintenance);
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .bc-gear-list--group {
      margin: 16px 12px 4px;
      color: var(--bc-text-2);
      font-size: 14px;
      font-weight: 600;
    }
    .bc-gear-list--chips {
      padding: 0 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    /* Mock-up: 32 px high, 8 px corners, a grey icon, « name · count » in one text. */
    .bc-gear-list--chip {
      height: 32px;
      padding: 0 12px;
      box-sizing: border-box;
      border: 1px solid var(--bc-outline);
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      & :global(svg) {
        color: var(--bc-text-2);
      }
    }
    .bc-gear-list--row {
      width: 100%;
      min-height: 64px;
      padding: 8px 12px;
      border: 0;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
    }
    .bc-gear-list--on,
    .bc-gear-list--on:hover {
      background: var(--bc-selected-container);
    }
    .bc-gear-list--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
    }
    .bc-gear-list--tile-late {
      background: var(--bc-surface);
      color: var(--bc-maintenance-icon);
    }
    .bc-gear-list--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .bc-gear-list--name {
      font-size: 16px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-gear-list--supporting {
      color: var(--bc-text-2);
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-gear-list--retired {
      margin-top: 16px;
    }
    .bc-gear-list--empty {
      margin: 24px 16px;
      color: var(--bc-text-2);
      text-align: center;
    }
    .bc-gear-list--bottom {
      height: 88px;
    }
    .bc-gear-list--add {
      position: absolute;
      inset-inline-end: 24px;
      bottom: 24px;
      height: 56px;
      padding: 0 20px 0 16px;
      border: 0;
      border-radius: 16px;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: var(--bc-secondary-container);
      color: var(--bc-secondary);
      font: inherit;
      font-size: 16px;
      font-weight: 600;
      box-shadow: var(--bc-tile-shadow);
      cursor: pointer;
    }
  }

  /* Framework7's unlayered button rule otherwise stretches it across the list. */
  .bc-gear-list--add {
    width: auto;
  }
</style>
