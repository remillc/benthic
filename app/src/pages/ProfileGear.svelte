<script>
  // @ts-check
  // « Équipement » (task 2026-11-17-267, docs/mockups-release/profil-equipement-android.dc.html): the kits as
  // chips then « Nouveau kit », the inventory grouped by type (icon, name, a sub-line, the number of dives), a
  // search and ⋮ in the top bar (« Exporter ou imprimer… », « Afficher les pièces archivées »), and the extended
  // button « Ajouter une pièce ». Works offline: everything is read from the working copy on the device.
  import BackLink from '../components/BackLink.svelte';
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import GearIcon from '../components/GearIcon.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import GearExportSheet from '../components/GearExportSheet.svelte';
  import { gear, loadInventory, visibleGear, figuresOf, computerDiveCounts, setReadOnly, maintenanceSections } from '../lib/inventory.svelte.js';
  import { groupGear, searchGear } from '../lib/inventory.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { connection } from '../lib/online.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  let showArchived = $state(false);
  let searching = $state(false);
  let query = $state('');
  let exporting = $state(false);
  /** @type {Map<string, number>} */
  let computerDives = $state(new Map());
  /** @type {HTMLInputElement|undefined} */
  let field = $state();

  const shown = $derived(searchGear(visibleGear(showArchived), query));
  const groups = $derived(groupGear(shown));
  const upkeep = $derived(maintenanceSections().counts);
  /** The line of the « Entretien » card: what is overdue, what is coming up, else that all is well. */
  const upkeepLine = $derived(
    upkeep.overdue || upkeep.soon
      ? [upkeep.overdue ? t('maintenance.cardLine.overdue', { n: upkeep.overdue }) : '', upkeep.soon ? t('maintenance.cardLine.soon', { n: upkeep.soon }) : ''].filter(Boolean).join(' · ')
      : upkeep.ok
        ? t('maintenance.cardLine.allGood')
        : t('maintenance.cardLine.none'),
  );
  const empty = $derived(gear.ready && !gear.pieces.some((g) => !g.retired) && !showArchived);

  async function refresh() {
    await loadInventory();
    computerDives = await computerDiveCounts();
  }
  onMount(refresh);

  /** The line under a name: the serial number of a computer or the piece's note, then its dives. @param {import('../lib/inventory.js').Gear} g */
  function subLine(g) {
    const n = figuresOf(g, computerDives).dives;
    const first = g.type === 'computer' ? (g.serial ? t('gear.inventory.serialLine', { serial: g.serial }) : '') : (g.note ?? '');
    return [first, n ? t('gear.inventory.dives', { n }) : ''].filter(Boolean).join(' · ');
  }

  /** @param {string} id */
  const open = (id) => f7.views.current.router.navigate(`/profile/gear/${id}`);

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
    // No billing exists yet: a development switch stands for the end of the subscription.
    if (import.meta.env?.DEV) items.push({ label: gear.readOnly ? t('gear.inventory.devReadOnlyOff') : t('gear.inventory.devReadOnlyOn'), onclick: () => setReadOnly(!gear.readOnly), divider: true });
    openPopupMenu(/** @type {HTMLElement} */ (e.currentTarget), items, t('gear.inventory.more'));
  }

  function newKit() {
    if (gear.readOnly) showSnackbar(t('gear.inventory.readOnlyRefused'));
    else f7.views.current.router.navigate('/profile/kits/new');
  }
</script>

<Page class="od-gear-page">
  <Navbar>
    {#snippet left()}
      <BackLink label={t('gear.profile.title')} name={t('gear.piece.back')} />
    {/snippet}
    {#snippet right()}
      {#if !searching}
        <a href="#search" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), openSearch())}>
          <Icon name="search" /><span class="od-sr-only">{t('gear.inventory.search')}</span>
        </a>
        <a href="#more" class="link icon-only external" role="button" aria-haspopup="menu" onclick={(e) => (e.preventDefault(), more(e))}>
          <Icon name="more" weight={4} /><span class="od-sr-only">{t('gear.inventory.more')}</span>
        </a>
      {/if}
    {/snippet}
    {#snippet title()}
      {#if searching}
        <div class="od-gear-page--search">
          <input bind:this={field} type="search" bind:value={query} placeholder={t('gear.inventory.search')} aria-label={t('gear.inventory.search')} />
          <button type="button" aria-label={t('gear.inventory.searchClose')} onclick={closeSearch}><Icon name="close" size={22} /></button>
        </div>
      {:else}
        {t('gear.inventory.title')}
      {/if}
    {/snippet}
  </Navbar>

  <ReadOnlyNotice onexport={() => (exporting = true)} />

  {#if gear.pending > 0}
    <p class="od-gear-page--pending" role="status">
      <Icon name={connection.online ? 'sync' : 'offline'} size={18} />
      <span>{t(connection.online ? 'gear.inventory.pending' : 'gear.inventory.pendingOffline', { n: gear.pending })}</span>
    </p>
  {/if}

  {#if !searching}
    <a href="/profile/maintenance/" class="od-gear-page--upkeep">
      <span class="od-gear-page--tile"><Icon name="clock" size={22} /></span>
      <span class="od-gear-page--texts">
        <span class="od-gear-page--name">{t('maintenance.entry')}</span>
        <span class="od-gear-page--supporting" class:od-gear-page--late={upkeep.overdue > 0}>{upkeepLine}</span>
      </span>
      {#if upkeep.overdue > 0}<span class="od-gear-page--badge-red" role="status" aria-label={t('maintenance.badge', { n: upkeep.overdue })}>{upkeep.overdue}</span>{/if}
      <span class="od-gear-page--chevron"><Icon name="chevron" size={20} /></span>
    </a>
    <h2 class="od-gear-page--title">{t('gear.inventory.kits')}</h2>
    <div class="od-gear-page--chips">
      {#each gear.kits as kit (kit.id)}
        <a href={`/profile/kits/${kit.id}`} class="od-gear-page--chip" aria-label={t('gear.inventory.kitChip', { name: kit.name, n: kit.gearIds.length })}>
          <Icon name="briefcase" size={18} />{kit.name}<span class="od-gear-page--chip-count">{kit.gearIds.length}</span>
        </a>
      {/each}
      <button type="button" class="od-gear-page--chip od-gear-page--chip-new" onclick={newKit}>
        <Icon name="plus" size={18} />{t('gear.inventory.newKit')}
      </button>
    </div>
  {/if}

  {#if empty}
    <div class="od-gear-page--empty">
      <h2>{t('gear.inventory.emptyTitle')}</h2>
      <p>{t('gear.inventory.emptyText')}</p>
    </div>
  {:else if !groups.length}
    <p class="od-gear-page--none">{t('gear.inventory.noResults')}</p>
  {/if}

  {#each groups as { group, items } (group)}
    <h2 class="od-gear-page--title">{t(`gear.inventory.group.${group}`)}</h2>
    <div class="od-gear-page--list">
      {#each items as g (g.id)}
        <button type="button" class="od-gear-page--row" onclick={() => open(g.id)}>
          <span class="od-gear-page--tile"><GearIcon type={g.type} name={g.name} size={22} /></span>
          <span class="od-gear-page--texts">
            <span class="od-gear-page--name">{g.name}{#if g.retired}<span class="od-gear-page--badge">{t('gear.inventory.archivedBadge')}</span>{/if}</span>
            {#if subLine(g)}<span class="od-gear-page--supporting">{subLine(g)}</span>{/if}
          </span>
          <span class="od-gear-page--chevron"><Icon name="chevron" size={20} /></span>
        </button>
      {/each}
    </div>
  {/each}
  <div class="od-gear-page--bottom"></div>

  {#snippet fixedContent()}
    <!-- Read only: the button goes away (hidden, not removed: the slot is drawn once). -->
    <div class="fab fab-right-bottom fab-extended od-fab-add" style:display={gear.readOnly ? 'none' : null}>
      <a href="/profile/gear/new">
        <i class="icon"><Icon name="plus" /></i>
        <div class="fab-text">{t('gear.inventory.add')}</div>
      </a>
    </div>
  {/snippet}
</Page>

<GearExportSheet opened={exporting} pieces={gear.pieces} onclose={() => (exporting = false)} />

<style>
  @layer od.components {
    .od-gear-page--upkeep {
      margin: 8px 16px 0;
      min-height: 64px;
      padding: 8px 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--od-surface);
      color: var(--od-text);
      text-decoration: none;
    }

    .od-gear-page--late {
      color: var(--od-alarm);
    }

    .od-gear-page--badge-red {
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

    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.od-gear-page .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-gear-page--search {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 4px;

      input {
        flex: 1;
        min-width: 0;
        height: 40px;
        border: none;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 16px;
        outline: none;
      }

      button {
        width: 40px;
        height: 40px;
        border: none;
        background: none;
        color: var(--od-text);
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }

    .od-gear-page--pending {
      margin: 8px 20px 0;
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-gear-page--title {
      margin: 0;
      padding: 20px 20px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-gear-page--chips {
      display: flex;
      gap: 8px;
      padding: 0 16px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .od-gear-page--chip {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 14px;
      border: var(--od-outline-width) solid var(--od-outline);
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
    }

    .od-gear-page--chip-count {
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      box-sizing: border-box;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--od-tonal);
      font-size: 12px;
    }

    .od-gear-page--chip-new {
      border-style: dashed;
      color: var(--od-secondary);
    }

    .od-gear-page--list {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-gear-page--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .od-gear-page--row + .od-gear-page--row {
      border-top: 1px solid var(--od-separator);
    }

    .od-gear-page--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-text);
    }

    .od-gear-page--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-gear-page--name {
      font-size: 16px;
      line-height: 22px;
    }

    .od-gear-page--badge {
      margin-inline-start: 8px;
      padding: 0 6px;
      border: var(--od-outline-width) solid var(--od-text-2);
      border-radius: 8px;
      font-size: 11px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-gear-page--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-gear-page--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-gear-page--empty {
      margin: 32px 32px 0;
      text-align: center;
      color: var(--od-text-2);

      h2 {
        margin: 0 0 8px;
        font-size: 20px;
        font-weight: 500;
        color: var(--od-text);
      }

      p {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
      }
    }

    .od-gear-page--none {
      margin: 24px 32px;
      text-align: center;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-gear-page--bottom {
      height: 96px;
    }
  }
</style>
