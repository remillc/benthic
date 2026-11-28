<script>
  // @ts-check
  // Header band of the four sections (spec, "Side menu and section headers,
  // identity"): under the top bar, the same gradient, a faint dive profile,
  // the one-line summary, and a wave that joins the content. `tall` when a
  // search bar follows the summary. `overMap`, on Sites, whose map runs under
  // the band: the wave cuts the band, so the map shows under the curve.
  // The page title is not here: it sits on the ☰ row of the top bar (task 2026-11-14-117).

  /** @type {{ summary?: string, placeholder?: boolean, tall?: boolean, overMap?: boolean, pill?: boolean, chip?: boolean, bare?: boolean, summaryKey?: unknown, syncLine?: boolean, children?: import('svelte').Snippet }} */
  import { ios } from '../lib/layout.svelte.js';
  import { BAND_PROFILE } from '../lib/band-profile.js';
  import { overlayScrollbar } from '../lib/overlay-scrollbar.js';
  import SyncProfileLine from './SyncProfileLine.svelte';
  let { summary = '', placeholder = false, tall = false, overMap = false, pill = false, chip = false, bare = false, summaryKey = undefined, syncLine = false, children } = $props();

  /** @type {HTMLElement|undefined} */
  let band = $state();
  /**
   * The band reaches the right edge of its scrolling area: the area's scrollbar is laid over the content instead of
   * taking a 4 px gutter beside it (Christian's report of 27 November 2026; lib/overlay-scrollbar.js).
   */
  $effect(() => {
    const scroller = /** @type {HTMLElement|null} */ (band?.closest('.page-content, [data-bc-scroll]') ?? null);
    if (scroller) return overlayScrollbar(scroller);
  });

  const PROFILE = BAND_PROFILE;
</script>

{#if ios && !overMap}
  <!-- iPhone (task 289, ios-carnet.dc.html): no band; the summary under the large title, then what the page puts there
       (the search field). -->
  <div class="bc-section-band bc-section-band--ios">
    {#key summaryKey}
      {#if summary}<p class="bc-section-band--summary bc-value" aria-hidden={placeholder || undefined}><span class:bc-section-band--placeholder={placeholder}>{summary}</span></p>{/if}
    {/key}
    {@render children?.()}
    <!-- No band here: the faint profile and the sync progress line go under the header (task 2026-11-23-340). -->
    {#if syncLine}<SyncProfileLine edge />{/if}
  </div>
{:else}
<div bind:this={band} class="bc-section-band bc-section-band--band" class:bc-section-band--tall={tall} class:bc-section-band--over-map={overMap} class:bc-section-band--pill={pill} class:bc-section-band--with-chip={chip} class:bc-section-band--bare={bare}>
  {#if !bare}
    <svg class="bc-section-band--profile" width="300" height="34" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
      <path d="{PROFILE} V140 H0 Z" class="bc-section-band--area" />
      <path d={PROFILE} class="bc-section-band--line" vector-effect="non-scaling-stroke" />
    </svg>
  {/if}
  {#if !overMap && !bare}
    <svg class="bc-section-band--wave" width="300" height="18" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
  {/if}
  <!-- A new summaryKey cross-fades to the new summary (Sites: the search count). -->
  {#key summaryKey}
    {#if summary}<p class="bc-section-band--summary bc-value" aria-hidden={placeholder || undefined}><span class:bc-section-band--placeholder={placeholder}>{summary}</span></p>{/if}
  {/key}
  {@render children?.()}
</div>
{/if}

<style>
  @layer bc.components {
    .bc-section-band--band {
      --bc-band-h: calc(var(--f7-safe-area-top) + 120px);
      position: relative;
      overflow: hidden;
      padding: 0 16px 32px;
      background-image: var(--bc-band-grain), var(--bc-band-gradient);
      /* At least down to the band's bottom: on a tablet the status bar is outside the app. */
      background-size: 256px 256px, 100% max(var(--bc-band-h), calc(100% + var(--f7-navbar-height) + var(--f7-safe-area-top)));
      background-position: 0 0, 0 calc(-1 * (var(--f7-navbar-height) + var(--f7-safe-area-top)));
      background-repeat: repeat, no-repeat;
      color: var(--bc-on-band);

      &.bc-section-band--tall {
        --bc-band-h: calc(var(--f7-safe-area-top) + 190px);

        /* The logbook's search field sits 8 px higher; the band keeps its height (task 284). */
        /* :global: the search field comes from the page (a slot); Svelte would drop the rule otherwise. */
        &:has(:global(.bc-band-search, .bc-folding-search--slot)) {
          padding-bottom: 40px;
        }
      }

      &.bc-section-band--pill {
        --bc-band-h: calc(var(--f7-safe-area-top) + 242px);
      }

      /* A small status chip under the summary (Sites, offline). */
      &.bc-section-band--with-chip {
        --bc-band-h: calc(var(--f7-safe-area-top) + 154px);
      }

      /* Only the texts: <BandBackdrop> draws the band under them. */
      &.bc-section-band--bare {
        z-index: 11;
        overflow: visible;
        background: none;
      }

      /* Only the wave's height runs over the map: its pins stay in view. */
      &.bc-section-band--over-map {
        z-index: 3;
        margin-bottom: -18px;
        mask:
          linear-gradient(#000, #000) top / 100% calc(100% - 17px) no-repeat,
          url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%20300%2018%27%20preserveAspectRatio%3D%27none%27%3E%3Cpath%20d%3D%27M0%200%20H300%20V11%20Q262.5%2020%20225%2011%20T150%2011%20T75%2011%20T0%2011%20Z%27%20fill%3D%27black%27/%3E%3C/svg%3E") bottom / 100% 18px no-repeat;
      }
    }

    .bc-section-band--profile {
      position: absolute;
      left: 0;
      bottom: 2px;
      width: 100%;
      height: 34px;

      .bc-section-band--area {
        fill: var(--bc-band-profile-area);
      }

      .bc-section-band--line {
        fill: none;
        stroke: var(--bc-band-profile-line);
        stroke-width: 1.5;
        stroke-linejoin: round;
      }
    }

    .bc-section-band--wave {
      position: absolute;
      left: 0;
      bottom: -1px;
      width: 100%;
      height: 18px;
      display: block;

      path {
        fill: var(--f7-page-bg-color);
      }
    }

    @keyframes bc-summary-in {
      from {
        opacity: 0;
      }
    }

    /* iPhone: the summary and the search field under the large title, no band. */
    .bc-section-band--ios {
      position: relative;
      padding: 0 16px 8px;

      .bc-section-band--summary {
        color: var(--bc-text-2);
        font-size: 13px;
        line-height: 18px;
        margin-bottom: 10px;
      }
    }

    /* The line's place while the logbook loads: its text drawn as blocks (Framework7's skeleton text), in the band's colour. */
    .bc-section-band--placeholder {
      color: transparent;
      background: color-mix(in srgb, var(--bc-on-band-2) 28%, transparent);
      border-radius: 4px;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }

    .bc-section-band--summary {
      position: relative;
      animation: bc-summary-in 150ms linear;
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      white-space: pre-line;
      color: var(--bc-on-band-2);
      /* The folding search box fades it while it rises (FoldingSearch.svelte). */
      opacity: var(--bc-summary-opacity, 1);
    }
  }
</style>
