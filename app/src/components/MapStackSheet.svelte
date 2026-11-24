<script>
  // @ts-check
  // « {n} sites à cet endroit » (bc-map-stack-sheet, task 2026-11-14-150;
  // sites-superposes-android.dc.html): the pins one tap touched on the Sites map, when
  // they overlap at that scale. The place under the title, then one 56 dp row per site,
  // the most dived first: its dive count in an ink badge, its name, « {n} plongées »,
  // its maximum depth and a chevron. A row opens the site's sheet; ✕, the scrim and Back
  // close (lib/back-button.js closes an open sheet). On iPhone, the same in iOS form.
  import { Sheet, f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { formatDepth, formatNumber } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { ios } from '../lib/layout.svelte.js';

  /**
   * @type {{
   *   sites: { uuid: number, name: string, dives: number, maxDepthMm: number }[],
   *   place: string,
   *   hideDiveCounts?: boolean,
   *   onclose: () => void,
   *   onopen: (uuid: number) => void,
   * }}
   */
  let { sites, place, hideDiveCounts = false, onclose, onopen } = $props();

  // Mounted open, once per tap (Sites.svelte), and gone only once it has closed
  // (onclose, from sheetClosed): Framework7's Sheet does not reopen reliably through
  // its « opened » prop after a swipe closed it. Every way out closes it the same way,
  // with its animation; a chosen site opens after.
  /** @type {HTMLElement|undefined} */
  let content = $state();
  let chosen = 0;
  const close = () => f7.sheet.close(/** @type {HTMLElement} */ (content?.closest('.sheet-modal')));
  // A chosen site first (its opening also forgets the sheet), else only forgotten:
  // once onclose has run, this sheet is being removed.
  const closed = () => {
    if (chosen) onopen(chosen);
    else onclose();
  };

  const rows = $derived([...sites].sort((a, b) => b.dives - a.dives));
  const title = $derived(t('sites.stackTitle', { n: sites.length }));
</script>

<Sheet class="bc-map-stack-sheet bc-sheet-dialog" opened onSheetClosed={closed} backdrop swipeToClose push={false} aria-label={title}>
  <div class="bc-map-stack-sheet--content" data-bc-scroll bind:this={content}>
    <div class="bc-map-stack-sheet--handle" aria-hidden="true"></div>
    <div class="bc-map-stack-sheet--head">
      <h2 class="bc-map-stack-sheet--title">{title}</h2>
      <button type="button" class="bc-map-stack-sheet--close" aria-label={t('sites.close')} onclick={close}><Icon name="close" size={20} /></button>
    </div>
    <p class="bc-map-stack-sheet--note">{place ? `${place}. ` : ''}{t('sites.stackNote')}</p>
    <nav class="bc-map-stack-sheet--list">
      {#each rows as site (site.uuid)}
        <button type="button" class="bc-map-stack-sheet--row" onclick={() => ((chosen = site.uuid), close())}>
          {#if !hideDiveCounts}<span class="bc-map-stack-sheet--badge" aria-hidden="true">{formatNumber(site.dives)}</span>{/if}
          <span class="bc-map-stack-sheet--texts">
            <span class="bc-map-stack-sheet--name">{site.name || t('sites.noName')}</span>
            {#if !hideDiveCounts}<span class="bc-map-stack-sheet--dives">{t('sites.diveCount', { n: site.dives })}</span>{/if}
          </span>
          {#if site.maxDepthMm}<span class="bc-map-stack-sheet--depth bc-value">{formatDepth(site.maxDepthMm, logbook.prefs)}</span>{/if}
          <Icon name="chevron" size={20} />
        </button>
      {/each}
    </nav>
  </div>
</Sheet>

<style>
  @layer bc.components {
    :global(.sheet-modal.bc-map-stack-sheet) {
      --f7-sheet-bg-color: var(--bc-background);
      height: auto;
      max-height: 85%;
      border-radius: 28px 28px 0 0;

      :global(.ios) & {
        border-radius: 10px 10px 0 0;
      }
    }

    .bc-map-stack-sheet--content {
      padding: 8px 0 calc(24px + var(--bc-safe-bottom));
      overflow-y: auto;
      max-height: 85vh;
    }

    .bc-map-stack-sheet--handle {
      width: 32px;
      height: 4px;
      margin: 6px auto 12px;
      border-radius: 2px;
      background: var(--bc-outline);
    }

    .bc-map-stack-sheet--head {
      display: flex;
      align-items: center;
      padding: 0 24px 8px;
    }

    .bc-map-stack-sheet--title {
      flex: 1;
      margin: 0;
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
      color: var(--bc-text);

      :global(.ios) & {
        font-size: 17px;
        font-weight: 600;
      }
    }

    .bc-map-stack-sheet--close {
      flex: none;
      width: 48px;
      height: 48px;
      margin: -12px -12px -12px 0;
      border: none;
      background: none;
      color: var(--bc-text-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-map-stack-sheet--note {
      margin: 0 24px 10px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-map-stack-sheet--list {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .bc-map-stack-sheet--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 6px 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;

      & + .bc-map-stack-sheet--row {
        border-top: 1px solid var(--bc-row-divider);
      }

      :global(.bc-icon) {
        flex: none;
        color: var(--bc-text-2);
      }
    }

    .bc-map-stack-sheet--badge {
      flex: none;
      box-sizing: border-box;
      min-width: 36px;
      height: 22px;
      padding: 0 6px;
      border-radius: 11px;
      background: var(--bc-text);
      color: var(--bc-surface);
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-variant-numeric: tabular-nums;
    }

    .bc-map-stack-sheet--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-map-stack-sheet--name {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-map-stack-sheet--dives {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-map-stack-sheet--depth {
      flex: none;
      font-size: 16px;
      font-weight: 500;
    }
  }
</style>
