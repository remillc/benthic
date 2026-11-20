<script>
  // @ts-check
  // /settings/maps/: "Cartes hors ligne" (spec, section 4, "Offline maps";
  // docs/mockups/android-cartes-hors-ligne.dc.html and its variants, iPhone
  // ios-cartes-hors-ligne.dc.html, tablets android-tablette-cartes.dc.html and
  // tablette-cartes.dc.html). The summary, the downloads in progress, the
  // regions, the two settings. Android: a ⋮ menu per region and an extended
  // button; iPhone: an "Actualiser" button per region, a swipe to delete and a
  // "+" in the bar; tablet: the list and the add pane side by side.
  import { Page, Navbar, Link, List, Popover, f7 } from 'framework7-svelte';
  import { tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import LinearWavyProgress from '../components/LinearWavyProgress.svelte';
  import MapsRow from '../components/MapsRow.svelte';
  import { t } from '../lib/i18n.js';
  import { ios, layout } from '../lib/layout.svelte.js';
  import { formatMapSize, formatMapDate } from '../lib/maps-format.js';
  import {
    offlineMaps,
    visibleRegions,
    readyList,
    downloadsList,
    updatesCount,
    regionName,
    activity,
    tilesPercent,
    floor,
    refreshSpace,
    setCellular,
    askCellular,
    askDelete,
    retryRegion,
    removeDownload,
    updateRegion,
    updateAll,
    viewRegion,
    go,
  } from '../lib/offline-maps.svelte.js';

  const downloads = $derived(downloadsList());
  const ready = $derived(readyList());
  const empty = $derived(!downloads.length && !ready.length);
  const readyBytes = $derived(ready.reduce((sum, r) => sum + r.sizeBytes, 0));
  // The device's storage (android-cartes-hors-ligne.dc.html): the maps, the other data, the free space.
  const share = (/** @type {number} */ bytes) => (offlineMaps.totalBytes ? Math.min(100, (bytes / offlineMaps.totalBytes) * 100) : 0);
  const mapsPercent = $derived(share(readyBytes));
  const otherPercent = $derived(share(Math.max(0, offlineMaps.totalBytes - offlineMaps.freeBytes - readyBytes)));
  const updates = $derived(updatesCount());
  const split = $derived(!layout.phone && layout.split);

  /** The region whose ⋮ menu is open. */
  let menuId = $state('');
  const menuRegion = $derived(visibleRegions().find((r) => r.id === menuId));

  /** @param {MouseEvent} e @param {string} id */
  async function openMenu(e, id) {
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    menuId = id;
    await tick();
    f7.popover.open('.bc-maps-menu', target);
  }

  /** @param {import('../lib/offline-maps.svelte.js').Region} r */
  function failureReason(r) {
    return t(`maps.failure.${r.error || 'server'}`);
  }

  /** A download interrupted by a lost network keeps what it received. @param {import('../lib/offline-maps.svelte.js').Region} r */
  const interrupted = (r) => !offlineMaps.online && r.bytesReceived > 0 && ['queued', 'downloading', 'paused', 'waiting-wifi'].includes(r.status);

  /** @param {import('../lib/offline-maps.svelte.js').Region} r @returns {'pause'|'download'} */
  const icon = (r) => (['waiting-wifi', 'paused'].includes(r.status) ? 'pause' : 'download');
</script>

{#snippet refreshIcon()}
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6 M20 4v5h-5" /></svg>
{/snippet}

{#snippet summary()}
  <div class="bc-settings-maps--summary">
    <!-- No limit of their own (task 2026-11-14-137): the regions, their space, and the device's. -->
    <span class="bc-settings-maps--line">
      <span class="bc-settings-maps--count">{t('maps.summary.regions', { n: ready.length })} · {formatMapSize(readyBytes)}</span>
    </span>
    {#if offlineMaps.totalBytes}
      <span class="bc-settings-maps--bar" role="img" aria-label={t('maps.summary.storageLabel', { maps: formatMapSize(readyBytes), free: formatMapSize(offlineMaps.freeBytes), total: formatMapSize(offlineMaps.totalBytes) })}>
        <span class="bc-settings-maps--maps" style:width="{mapsPercent}%"></span>
        <span class="bc-settings-maps--other" style:width="{otherPercent}%"></span>
      </span>
      <span class="bc-settings-maps--legend" aria-hidden="true">
        <span class="bc-settings-maps--key bc-settings-maps--key-maps"></span>{t('maps.summary.maps')}
        <span class="bc-settings-maps--key bc-settings-maps--key-other"></span>{t('maps.summary.other')}
      </span>
      <span class="bc-settings-maps--free">{t('maps.summary.freeOf', { free: formatMapSize(offlineMaps.freeBytes), total: formatMapSize(offlineMaps.totalBytes) })}</span>
    {/if}
  </div>
{/snippet}

{#snippet downloadRow(/** @type {import('../lib/offline-maps.svelte.js').Region} */ r)}
  {@const name = regionName(r)}
  <MapsRow icon={icon(r)}>
    {#snippet body()}
      <span>{name}</span>
      {#if r.status === 'failed'}
        <span class="bc-maps-row--status bc-maps-row--error">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 7.5v5.5M12 16.5h.01" /></svg>{t('maps.failure.title')}
        </span>
        <span class="bc-maps-row--supporting">{failureReason(r)}</span>
        <span class="bc-maps-row--actions">
          {#if r.error !== 'limit'}<button type="button" onclick={() => retryRegion(r.id)}>{t('maps.failure.retry')}</button>{/if}
          <button type="button" onclick={() => removeDownload(r.id)}>{t('maps.failure.remove')}</button>
        </span>
      {:else if interrupted(r)}
        <span class="bc-maps-row--supporting">{t('maps.download.interrupted', { done: r.tilesDone, total: r.tilesTotal })}</span>
        <span class="bc-maps-row--note">{t('maps.download.resumesOnline')}</span>
      {:else if r.pausedReason === 'space'}
        <span class="bc-maps-row--supporting">{t('maps.download.pausedAt', { done: r.tilesDone, total: r.tilesTotal })}</span>
        <span class="bc-maps-row--status bc-maps-row--muted">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 15h18 M7 18h.01" /></svg>{t('maps.download.noSpace')}
        </span>
        <span class="bc-maps-row--note">{t('maps.download.resumesWhen', { floor: formatMapSize(floor()) })}</span>
        <span class="bc-maps-row--actions"><button type="button" onclick={() => (offlineMaps.dialog = { kind: 'manage' })}>{t('maps.download.manage')}</button></span>
      {:else if r.status === 'waiting-wifi'}
        <span class="bc-maps-row--supporting">{t('maps.download.waitingWifi', { total: r.tilesTotal })}</span>
        <span class="bc-maps-row--actions"><button type="button" onclick={() => askCellular(r.id)}>{t('maps.download.now')}</button></span>
      {:else if r.status === 'paused'}
        <span class="bc-maps-row--supporting">{t('maps.download.pausedAt', { done: r.tilesDone, total: r.tilesTotal })}</span>
      {:else if r.status === 'queued'}
        <span class="bc-maps-row--supporting">{t('maps.download.queued', { total: r.tilesTotal })}</span>
      {:else}
        <span class="bc-maps-row--supporting">{t('maps.download.progress', { done: r.tilesDone, total: r.tilesTotal, percent: tilesPercent(r) })}</span>
        {#if ios}
          {#if ios}
            <span
              class="bc-maps-row--progress"
              role="progressbar"
              aria-label={t('maps.download.progressLabel', { name })}
              aria-valuenow={tilesPercent(r)}
              aria-valuemin="0"
              aria-valuemax="100"><span style:width="{tilesPercent(r)}%"></span></span
            >
          {:else}
            <LinearWavyProgress class="bc-maps-row--wavy" value={tilesPercent(r) / 100} label={t('maps.download.progressLabel', { name })} />
          {/if}
        {:else}
          <LinearWavyProgress class="bc-maps-row--wavy" value={tilesPercent(r) / 100} label={t('maps.download.progressLabel', { name })} />
        {/if}
      {/if}
    {/snippet}
    {#snippet trailing()}
      {#if r.status !== 'failed'}
        <button type="button" class="bc-maps-row--icon-button" aria-label={t('maps.download.stop')} onclick={() => removeDownload(r.id)}><Icon name="close" /></button>
      {/if}
    {/snippet}
  </MapsRow>
{/snippet}

{#snippet regionRow(/** @type {import('../lib/offline-maps.svelte.js').Region} */ r)}
  {@const name = regionName(r)}
  {@const act = activity(r)}
  <MapsRow icon="crop">
    {#snippet body()}
      <span>{name}</span>
      {#if r.status === 'updating'}
        {#if act === 'waiting-wifi'}
          <span class="bc-maps-row--supporting">{t('maps.download.updatingWifi')}</span>
          <span class="bc-maps-row--actions"><button type="button" onclick={() => askCellular(r.id)}>{t('maps.download.now')}</button></span>
        {:else}
          <span class="bc-maps-row--supporting">{t('maps.download.updating', { done: r.tilesDone, total: r.tilesTotal })}</span>
          <span
            class="bc-maps-row--progress"
            role="progressbar"
            aria-label={t('maps.download.progressLabel', { name })}
            aria-valuenow={tilesPercent(r)}
            aria-valuemin="0"
            aria-valuemax="100"><span style:width="{tilesPercent(r)}%"></span></span
          >
        {/if}
        <span class="bc-maps-row--note">{t('maps.download.oldStays')}</span>
      {:else}
        <span class="bc-maps-row--supporting">
          {t('maps.region.sizeDate', { size: formatMapSize(r.sizeBytes), date: formatMapDate(r.downloadedAt) })}
        </span>
        {#if r.update}
          <span class="bc-maps-row--status">{@render refreshIcon()}{t('maps.region.updateAvailable')}</span>
          {#if ios}
            <span class="bc-maps-row--actions"><button type="button" onclick={() => updateRegion(r.id)}>{t('maps.region.update')}</button></span>
          {/if}
        {/if}
      {/if}
    {/snippet}
    {#snippet trailing()}
      {#if !ios}
        <button type="button" class="bc-maps-row--icon-button" aria-haspopup="menu" aria-label={t('maps.region.options', { name })} onclick={(e) => openMenu(e, r.id)}>
          <Icon name="more" />
        </button>
      {/if}
    {/snippet}
  </MapsRow>
{/snippet}

{#snippet settingsGroup()}
  <h2 class="bc-maps-row--maps-title">{t('maps.sections.settings')}</h2>
  <div class="bc-maps-row--surface" role="list">
    <div role="listitem">
      <label class="bc-settings-maps--set-row">
        <span class="bc-settings-maps--texts">
          <span class="bc-settings-maps--label">{t(ios ? 'maps.cellular.labelShort' : 'maps.cellular.label')}</span>
          <span class="bc-maps-row--supporting">{t('maps.cellular.text')}</span>
        </span>
        <span class="toggle">
          <input type="checkbox" checked={offlineMaps.cellular} onchange={(e) => setCellular(e.currentTarget.checked)} />
          <span class="toggle-icon"></span>
        </span>
      </label>
    </div>
  </div>
{/snippet}

{#snippet listPane()}
  {#if !offlineMaps.online}
    <p class="bc-settings-maps--no-network" role="status"><Icon name="offline" size={20} /><span>{t('maps.noNetwork')}</span></p>
  {/if}

  {#if empty}
    <div class="bc-settings-maps--empty">
      <span class="bc-settings-maps--illustration" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14" /></svg>
      </span>
      <h2>{t('maps.empty.title')}</h2>
      <p>{t('maps.empty.text')}</p>
      {#if !split}<button type="button" class="bc-settings-maps--filled" onclick={() => go('/settings/maps/area')}>{t('maps.add')}</button>{/if}
    </div>
  {:else}
    {@render summary()}
  {/if}

  {#if downloads.length}
    <h2 class="bc-maps-row--maps-title">{t('maps.sections.downloads')}</h2>
    <div class="bc-maps-row--surface" role="list">
      {#each downloads as r (r.id)}<div role="listitem">{@render downloadRow(r)}</div>{/each}
    </div>
    {#if downloads.some((r) => r.status === 'downloading' || r.status === 'queued')}<p class="bc-maps-row--maps-note">{t('maps.download.background')}</p>{/if}
  {/if}

  {#if ready.length}
    <div class="bc-settings-maps--section-head">
      <h2 class="bc-maps-row--maps-title">{t('maps.sections.regions')}</h2>
      {#if updates > 0}<button type="button" class="bc-settings-maps--text-action" onclick={updateAll}>{t('maps.updateAll')}</button>{/if}
    </div>
    <div class="bc-maps-row--surface" role="list">
      {#each ready as r (r.id)}
        {#if ios}
          <!-- iPhone: a swipe to the left deletes (Framework7 swipeout). -->
          <div role="listitem" class="swipeout no-swipeback">
            <div class="swipeout-content">{@render regionRow(r)}</div>
            <div class="swipeout-actions-right">
              <a href="#delete" class="bc-settings-maps--swipeout-close bc-settings-maps--delete" onclick={(e) => { e.preventDefault(); askDelete(r.id); }}>{t('maps.menu.delete')}</a>
            </div>
          </div>
        {:else}
          <div role="listitem">{@render regionRow(r)}</div>
        {/if}
      {/each}
      {#if ios}
        <div role="listitem">
          <button type="button" class="bc-settings-maps--set-row bc-settings-maps--add-row" onclick={() => go('/settings/maps/area')}>
            <span class="bc-settings-maps--texts"><span class="bc-settings-maps--label">{t('maps.add')}</span></span>
            <Icon name="chevron" size={20} />
          </button>
        </div>
      {/if}
    </div>
    {#if ios}<p class="bc-maps-row--maps-note">{t('maps.region.swipeHint')}</p>{/if}
  {/if}

  {@render settingsGroup()}
  <div class="bc-settings-maps--bottom"></div>
{/snippet}

<Page class="bc-settings-maps" onPageBeforeIn={refreshSpace}>
  <Navbar title={t('maps.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="bc-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      {#if ios && !split}
        <Link iconOnly onClick={() => go('/settings/maps/area')}>
          <Icon name="plus" />
          <span class="bc-sr-only">{t('maps.add')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  {#if split}
    <div class="bc-settings-maps--panes">
      <div class="bc-settings-maps--pane bc-settings-maps--list-pane">{@render listPane()}</div>
      <div class="bc-settings-maps--pane bc-settings-maps--add-pane">
        <h2 class="bc-settings-maps--add-title">{t('maps.add')}</h2>
        <p class="bc-maps-row--maps-note bc-settings-maps--add-text">{t('maps.empty.text')}</p>
        <button type="button" class="bc-settings-maps--filled" onclick={() => go('/settings/maps/area')}>{t('maps.area.choose')}</button>
      </div>
    </div>
  {:else}
    {@render listPane()}
  {/if}

  <!-- The ⋮ menu of a region (android-cartes-menu.dc.html). -->
  <Popover class="bc-menu bc-maps-menu" backdrop={false}>
    <List noChevron>
      {#if menuRegion?.update && menuRegion.status === 'ready'}
        <MenuItem icon="refresh" text={t('maps.menu.update')} onclick={() => updateRegion(menuRegion.id)} />
      {/if}
      {#if menuRegion}<MenuItem icon="place" text={t('maps.menu.view')} onclick={() => viewRegion(menuRegion.id)} />{/if}
      {#if menuRegion}<MenuItem icon="delete" text={t('maps.menu.delete')} destructive onclick={() => askDelete(menuRegion.id)} />{/if}
    </List>
  </Popover>

  {#snippet fixedContent()}
    {#if !ios && !split && !empty}
      <!-- Extended floating button, written by hand as in the Logbook. -->
      <div class="fab fab-right-bottom fab-extended bc-fab-add">
        <a href="/settings/maps/area">
          <i class="icon"><Icon name="plus" /></i>
          <div class="fab-text">{t('maps.add')}</div>
        </a>
      </div>
    {/if}
  {/snippet}
</Page>

<style>
  @layer od.components {
    .bc-settings-maps--no-network {
      margin: 8px 16px 0;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--bc-surface-2);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text);

      :global(svg) {
        flex: none;
        margin-top: 1px;
      }
    }

    .bc-settings-maps--summary {
      margin: 8px 16px 0;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-variant-numeric: tabular-nums;

      .bc-settings-maps--line {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .bc-settings-maps--count {
        flex: 1;
        font-size: 16px;
        line-height: 24px;
      }

      /* The device's storage: the maps in ink, the other data in the outline tone, the rest free. */
      .bc-settings-maps--bar {
        height: 8px;
        border-radius: 4px;
        background: var(--bc-surface-container);
        overflow: hidden;
        display: flex;
        gap: 2px;

        > span {
          flex: none;
          height: 100%;
          border-radius: 4px;
        }
      }

      .bc-settings-maps--maps,
      .bc-settings-maps--key-maps {
        background: var(--bc-text);
      }

      .bc-settings-maps--other,
      .bc-settings-maps--key-other {
        background: var(--bc-separator);
      }

      .bc-settings-maps--legend {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        line-height: 18px;
        color: var(--bc-text-2);
      }

      .bc-settings-maps--key {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 4px;

        &.bc-settings-maps--key-other {
          margin-left: 6px;
        }
      }

      .bc-settings-maps--free {
        font-size: 13px;
        line-height: 18px;
        color: var(--bc-text-2);
      }
    }

    .bc-settings-maps--section-head {
      display: flex;
      align-items: center;
      padding-right: 8px;

      .bc-maps-row--maps-title {
        flex: 1;
      }
    }

    .bc-settings-maps--text-action {
      flex: none;
      width: auto;
      height: 40px;
      margin-top: 12px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.1px;
      cursor: pointer;
    }

    .bc-settings-maps--empty {
      margin: 24px 24px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;

      .bc-settings-maps--illustration {
        width: 96px;
        height: 96px;
        border-radius: 48px;
        background: var(--bc-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;

        svg {
          fill: none;
          stroke: var(--bc-text);
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      }

      h2 {
        margin: 20px 0 8px;
        font-size: 20px;
        line-height: 28px;
        font-weight: 600;
      }

      p {
        margin: 0 0 20px;
        font-size: 15px;
        line-height: 22px;
        color: var(--bc-text-2);
      }
    }

    .bc-settings-maps--filled {
      width: auto;
      height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: 24px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    .bc-settings-maps--set-row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      .bc-settings-maps--texts {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .bc-settings-maps--label {
        font-size: 16px;
        line-height: 24px;
      }

      .bc-maps-row--supporting {
        font-size: 14px;
        line-height: 20px;
        color: var(--bc-text-2);
      }

      :global(svg) {
        flex: none;
        color: var(--bc-text-2);
      }

      .toggle {
        flex: none;
      }
    }

    /* iPhone: the swipeout action. */
    .swipeout {
      position: relative;
      overflow: hidden;
    }

    .bc-settings-maps--delete {
      background: var(--bc-error);
      color: var(--bc-on-error);
      font-weight: 600;
    }

    /* Tablet: the list and the add pane side by side (the add pane on a surface container on Android). */
    .bc-settings-maps--panes {
      display: flex;
      align-items: flex-start;
      min-height: 100%;
    }

    .bc-settings-maps--pane {
      min-width: 0;
    }

    /* Tablet in portrait (task 2026-11-19-300): the detail pane is too narrow for two columns, the add pane goes under the list. */
    @media (orientation: portrait) {
      .bc-settings-maps--panes {
        flex-direction: column;
        align-items: stretch;
      }

      .bc-settings-maps--list-pane {
        flex: none;
      }

      .bc-settings-maps--add-pane {
        flex: none;
        align-self: auto;
        margin: 16px 12px 24px;
        padding-bottom: 20px;
        border-radius: 28px;
      }

      :global(.ios) .bc-settings-maps--add-pane {
        border-radius: 10px;
        border-left: none;
      }
    }

    .bc-settings-maps--list-pane {
      flex: 1 1 0;
    }

    .bc-settings-maps--add-pane {
      flex: 1 1 0;
      align-self: stretch;
      background: var(--bc-surface-2);
      border-radius: 28px 0 0 28px;
      padding-top: 8px;
      --bc-field-margin: 12px;
    }

    :global(.ios) .bc-settings-maps--add-pane {
      background: var(--bc-background);
      border-radius: 0;
      border-left: 1px solid var(--bc-separator);
    }

    .bc-settings-maps--add-pane .bc-settings-maps--filled {
      margin: 16px 20px 0;
    }

    .bc-settings-maps--add-title {
      margin: 0;
      padding: 16px 20px 4px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }

    .bc-settings-maps--bottom {
      height: 96px;
    }
  }
</style>
