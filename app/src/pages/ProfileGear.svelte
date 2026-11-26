<script>
  // @ts-check
  // « Équipement » (task 2026-11-17-267, docs/mockups-release/profil-equipement-android.dc.html): the kits as
  // chips then « Nouveau kit », the inventory grouped by type (icon, name, a sub-line, the number of dives), a
  // search and ⋮ in the top bar (« Exporter ou imprimer… », « Afficher les pièces archivées »), and the extended
  // button « Ajouter une pièce ». Works offline: everything is read from the working copy on the device.
  import { ios } from '../lib/layout.svelte.js';
  import BackLink from '../components/BackLink.svelte';
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import SearchClear from '../components/SearchClear.svelte';
  import GearIcon from '../components/GearIcon.svelte';
  import DcTile from '../components/DcTile.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import GearExportSheet from '../components/GearExportSheet.svelte';
  import { gear, loadInventory, visibleGear, retiredGear, figuresOf, computerDiveCounts, setReadOnly, maintenanceSections, readPhoto, hasActiveMaintenance } from '../lib/inventory.svelte.js';
  import { groupGear, searchGear } from '../lib/inventory.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { connection } from '../lib/online.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** The diver's own photos of their computers, by piece id (they win over the catalog photo). @type {Record<string, string>} */
  let photos = $state({});
  $effect(() => {
    for (const g of gear.pieces) {
      if (g.type === 'computer' && g.photoId && !(g.id in photos)) readPhoto(g.photoId).then((url) => (photos[g.id] = url));
    }
  });
  let searching = $state(false);
  let query = $state('');
  let exporting = $state(false);
  /** @type {Map<string, number>} */
  let computerDives = $state(new Map());
  /** @type {HTMLInputElement|undefined} */
  let field = $state();

  const shown = $derived(searchGear(visibleGear(), query));
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
  const empty = $derived(gear.ready && !gear.pieces.some((g) => !g.retired) && !retired.length);
  /** « Pièces retirées »: the row at the end of the list (task 2026-11-19-308). */
  const retired = $derived(retiredGear());

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

{#snippet computerIcon()}
  <GearIcon type="computer" size={22} />
{/snippet}

{#snippet body()}

  <ReadOnlyNotice onexport={() => (exporting = true)} />

  {#if gear.pending > 0}
    <p class="bc-gear-page--pending" role="status">
      <Icon name={connection.online ? 'sync' : 'offline'} size={18} />
      <span>{t(connection.online ? 'gear.inventory.pending' : 'gear.inventory.pendingOffline', { n: gear.pending })}</span>
    </p>
  {/if}

  {#if !searching}
    {#if hasActiveMaintenance()}
      <!-- profil-equipement-android: a tinted card (the late tint when an upkeep is overdue), the icon without a tile;
           ios-profil-equipement: a row of a grouped list. -->
      <a href="/profile/maintenance/" class="bc-gear-page--upkeep" class:bc-gear-page--upkeep-late={upkeep.overdue > 0}>
        <span class="bc-gear-page--upkeep-icon"><Icon name="clock" size={22} /></span>
        <span class="bc-gear-page--texts">
          <span class="bc-gear-page--name">{t('maintenance.entry')}</span>
          <span class="bc-gear-page--supporting" class:bc-gear-page--late={upkeep.overdue > 0}>{upkeepLine}</span>
        </span>
        {#if upkeep.overdue > 0}<span class="bc-gear-page--badge-red" role="status" aria-label={t('maintenance.badge', { n: upkeep.overdue })}>{upkeep.overdue}</span>{/if}
        <span class="bc-gear-page--chevron"><Icon name="chevron" size={20} /></span>
      </a>
    {/if}
    <h2 class="bc-gear-page--title bc-gear-page--title-kits">{t('gear.inventory.kits')}</h2>
    {#if ios}
      <!-- iPhone: the kits are a grouped list (name, count, chevron), « Nouveau kit » a row in the accent colour. -->
      <div class="bc-gear-page--list bc-gear-page--kit-list">
        {#each gear.kits as kit (kit.id)}
          <a href={`/profile/kits/${kit.id}`} class="bc-gear-page--row" aria-label={t('gear.inventory.kitChip', { name: kit.name, n: kit.gearIds.length })}>
            <span class="bc-gear-page--texts"><span class="bc-gear-page--name">{kit.name}</span></span>
            <span class="bc-gear-page--kit-count">{kit.gearIds.length}</span>
            <span class="bc-gear-page--chevron"><Icon name="chevron" size={20} /></span>
          </a>
        {/each}
        <button type="button" class="bc-gear-page--row bc-gear-page--kit-new" onclick={newKit}>
          <span class="bc-gear-page--texts"><span class="bc-gear-page--name">{t('gear.inventory.newKit')}</span></span>
        </button>
      </div>
    {:else}
      <div class="bc-gear-page--chips">
        {#each gear.kits as kit (kit.id)}
          <a href={`/profile/kits/${kit.id}`} class="bc-gear-page--chip" aria-label={t('gear.inventory.kitChip', { name: kit.name, n: kit.gearIds.length })}>
            <Icon name="briefcase" size={18} />{kit.name}<span class="bc-gear-page--chip-count">{kit.gearIds.length}</span>
          </a>
        {/each}
        <button type="button" class="bc-gear-page--chip bc-gear-page--chip-new" onclick={newKit}>
          <Icon name="plus" size={18} />{t('gear.inventory.newKit')}
        </button>
      </div>
    {/if}
  {/if}

  {#if empty}
    <div class="bc-gear-page--empty">
      <h2>{t('gear.inventory.emptyTitle')}</h2>
      <p>{t('gear.inventory.emptyText')}</p>
    </div>
  {:else if !groups.length}
    <p class="bc-gear-page--none">{t('gear.inventory.noResults')}</p>
  {/if}

  {#each groups as { group, items } (group)}
    <h2 class="bc-gear-page--title">{t(`gear.inventory.group.${group}`)}</h2>
    <div class="bc-gear-page--list">
      {#each items as g (g.id)}
        <button type="button" class="bc-gear-page--row" onclick={() => open(g.id)}>
          <span class="bc-gear-page--tile">{#if g.type === 'computer'}<DcTile model={g.computerModel || g.name} size={ios ? 36 : 40} radius={ios ? 8 : 10} photo={photos[g.id] ?? ''} fallback={computerIcon} />{:else}<GearIcon type={g.type} name={g.name} size={22} />{/if}</span>
          <span class="bc-gear-page--texts">
            <span class="bc-gear-page--name">{g.name}</span>
            {#if subLine(g)}<span class="bc-gear-page--supporting">{subLine(g)}</span>{/if}
          </span>
          <span class="bc-gear-page--chevron"><Icon name="chevron" size={20} /></span>
        </button>
      {/each}
    </div>
  {/each}
  {#if retired.length && !searching}
    <div class="bc-gear-page--list bc-gear-page--retired">
      <a href="/profile/gear/retired/" class="bc-gear-page--row">
        <span class="bc-gear-page--tile"><Icon name="archive" size={22} /></span>
        <span class="bc-gear-page--texts">
          <span class="bc-gear-page--name">{t('gear.inventory.retiredRow')}</span>
          <span class="bc-gear-page--supporting">{t('gear.inventory.retiredCount', { n: retired.length })}</span>
        </span>
        <span class="bc-gear-page--chevron"><Icon name="chevron" size={20} /></span>
      </a>
    </div>
  {/if}
  <div class="bc-gear-page--bottom"></div>
{/snippet}

<Page class="bc-gear-page">
  <Navbar>
    {#snippet left()}
      <BackLink label={t('gear.profile.title')} name={t('gear.piece.back')} />
    {/snippet}
    {#snippet right()}
      {#if !searching}
        {#if ios && !gear.readOnly}<Link href="/profile/gear/new" iconOnly><Icon name="plus" /><span class="bc-sr-only">{t('gear.inventory.add')}</span></Link>{/if}
        <a href="#search" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), openSearch())}>
          <Icon name="search" /><span class="bc-sr-only">{t('gear.inventory.search')}</span>
        </a>
        <a href="#more" class="link icon-only external" role="button" aria-haspopup="menu" onclick={(e) => (e.preventDefault(), more(e))}>
          <Icon name="more" weight={4} /><span class="bc-sr-only">{t('gear.inventory.more')}</span>
        </a>
      {/if}
    {/snippet}
    {#snippet title()}
      {#if searching}
        <div class="bc-gear-page--search">
          <input bind:this={field} type="search" bind:value={query} placeholder={t('gear.inventory.search')} aria-label={t('gear.inventory.search')} />
          {#if query}<SearchClear onclear={() => (query = '')} />{/if}
          <button type="button" aria-label={t('gear.inventory.searchClose')} onclick={closeSearch}><Icon name="close" size={22} /></button>
        </div>
      {:else}
        {t('gear.inventory.title')}
      {/if}
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="gear" list="gear" bar="none" />
  {:else}
    {@render body()}
  {/if}
  {#snippet fixedContent()}
    <!-- Read only: the button goes away (hidden, not removed: the slot is drawn once). -->
    <div class="fab fab-right-bottom fab-extended bc-fab-add" style:display={gear.readOnly || ios || profileWide() ? 'none' : null}>
      <a href="/profile/gear/new">
        <i class="icon"><Icon name="plus" size={24} /></i>
        <div class="fab-text">{t('gear.inventory.add')}</div>
      </a>
    </div>
  {/snippet}
</Page>

<GearExportSheet opened={exporting} pieces={gear.pieces} onclose={() => (exporting = false)} />

<style>
  @layer bc.components {
    /* Entretien (profil-equipement-android): a tinted card, 64 dp, 20 dp corners, the icon alone (no tile), the name
       16/600; the late tint when an upkeep is overdue, else the blue one. */
    .bc-gear-page--upkeep {
      box-sizing: border-box;
      margin: 8px 16px 0;
      min-height: 64px;
      padding: 10px 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      background: var(--bc-secondary-container);
      color: var(--bc-text);
      text-decoration: none;

      .bc-gear-page--name {
        font-weight: 600;
      }

      &.bc-gear-page--upkeep-late {
        background: var(--bc-late-tint);
      }

      /* iPhone (ios-profil-equipement): a 44 pt row of a white grouped list with 10 pt corners. */
      :global(.ios) & {
        min-height: 44px;
        padding: 8px 16px;
        gap: 12px;
        border-radius: 10px;
        background: var(--bc-surface);

        .bc-gear-page--name {
          font-size: 17px;
          font-weight: 400;
        }
      }
    }

    .bc-gear-page--upkeep-icon {
      flex: none;
      display: flex;
      color: var(--bc-secondary);

      .bc-gear-page--upkeep-late & {
        color: var(--bc-late);
      }
    }

    .bc-gear-page--late {
      color: var(--bc-alarm);
    }

    .bc-gear-page--badge-red {
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

    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.bc-gear-page .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-gear-page--search {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 4px;

      :global(.bc-search-clear) {
        margin: 0;
      }

      input {
        flex: 1;
        min-width: 0;
        height: 40px;
        border: none;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 16px;
        outline: none;
      }

      button {
        width: 40px;
        height: 40px;
        border: none;
        background: none;
        color: var(--bc-text);
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }

    .bc-gear-page--pending {
      margin: 8px 20px 0;
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-gear-page--title {
      margin: 0;
      padding: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);

      /* iPhone: a small uppercase header over the grouped list. */
      :global(.ios) & {
        padding: 22px 32px 6px;
        font-size: 13px;
        line-height: 18px;
        font-weight: 400;
        text-transform: uppercase;
      }
    }

    .bc-gear-page--title-kits {
      padding-top: 16px;
    }

    /* The kits wrap onto several lines, none is hidden off screen. */
    .bc-gear-page--chips {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 0 16px;
    }

    .bc-gear-page--chip {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 14px 0 10px;
      box-sizing: border-box;
      border: 1px solid var(--bc-separator);
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
    }

    .bc-gear-page--chip :global(svg) {
      color: var(--bc-secondary);
    }

    .bc-gear-page--chip-count {
      color: var(--bc-text-2);
      font-weight: 400;
    }

    /* « Nouveau kit »: dashed, no fill, ink icon and label. */
    .bc-gear-page--chip-new {
      gap: 6px;
      border-style: dashed;
      border-color: var(--bc-outline);
      background: none;
      color: var(--bc-text);
      :global(svg) {
        color: var(--bc-text);
      }
    }

    /* iPhone kit list: 44 pt rows, the count right-aligned before the chevron, « Nouveau kit » in the accent colour. */
    .bc-gear-page--kit-list .bc-gear-page--row {
      min-height: 44px;
      padding-block: 0;
      gap: 12px;
      text-decoration: none;
    }
    .bc-gear-page--name {
      font-size: 16px;
    }
    .bc-gear-page--kit-count {
      flex: none;
      color: var(--bc-text-2);
      font-size: 17px;
      white-space: nowrap;
    }
    .bc-gear-page--kit-new {
      color: var(--bc-secondary);
    }

    .bc-gear-page--list {
      margin: 0 16px;
      border-radius: 20px;

      :global(.ios) & {
        border-radius: 10px;
      }
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-gear-page--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      & + .bc-gear-page--row {
        border-top: 1px solid var(--bc-separator);
      }

      /* iPhone (ios-profil-equipement): 44 pt rows (two lines make about 57), 12 pt gaps, the name in 17 pt. */
      :global(.ios) & {
        min-height: 44px;
        gap: 12px;

        .bc-gear-page--name {
          font-size: 17px;
        }
      }
    }

    .bc-gear-page--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-tile);
      color: var(--bc-text);

      /* iPhone: 36 pt tiles with 8 pt corners (task 2026-11-19-306). */
      :global(.ios) & {
        width: 36px;
        height: 36px;
        border-radius: 8px;
      }
    }

    .bc-gear-page--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-gear-page--name {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-gear-page--retired {
      margin-top: 16px;
    }

    .bc-gear-page--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-gear-page--chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-gear-page--empty {
      margin: 32px 32px 0;
      text-align: center;
      color: var(--bc-text-2);

      h2 {
        margin: 0 0 8px;
        font-size: 20px;
        font-weight: 500;
        color: var(--bc-text);
      }

      p {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
      }
    }

    .bc-gear-page--none {
      margin: 24px 32px;
      text-align: center;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    /* « Ajouter une pièce »: extended FAB in the secondary container (56 dp, 16 dp corners, 16 / 600 label). */
    :global(.bc-gear-page .bc-fab-add) {
      --f7-fab-bg-color: var(--bc-secondary-container);
      --f7-fab-text-color: var(--bc-secondary);
      --f7-fab-extended-text-font-size: 16px;
      --f7-fab-extended-text-font-weight: 600;
      --f7-fab-extended-text-padding: 0 20px 0 0;
    }

    /* 16 dp, the 24 dp icon, 12 dp, then the label. */
    :global(.bc-gear-page .bc-fab-add i ~ .fab-text) {
      padding-left: 52px;
    }

    .bc-gear-page--bottom {
      height: 96px;
    }
  }
</style>
