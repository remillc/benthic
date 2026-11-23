<script>
  // @ts-check
  // Map of the site behind the top bar and the header of a dive (detail3-android
  // mock-ups; spec, "Dive detail, site map behind the header"). Decorative: not
  // interactive, hidden from screen readers. Until the picture is there
  // (offline and never seen), nothing is shown. The map's credits are in About.
  import { DRAW_WIDTH, HALF_HEIGHT, readySiteMap, sharedSiteMap } from '../lib/site-image.js';

  // `desk` (desktop detail pane, tasks 2026-11-15-193 and 2026-11-22-331): the picture covers the top 170 dp of the pane,
  // across its whole width, with no top bar above it.
  /** @type {{ latUdeg: number, lonUdeg: number, onshown: (shown: boolean) => void, desk?: boolean }} */
  let { latUdeg, lonUdeg, onshown, desk = false } = $props();

  // Prepared ahead (the dives beside this one, dive-preload.js): there from the first frame.
  // svelte-ignore state_referenced_locally
  let src = $state(readySiteMap(latUdeg, lonUdeg) ?? '');

  $effect(() => {
    let stale = false;
    const ready = readySiteMap(latUdeg, lonUdeg);
    if (ready) {
      src = ready;
      onshown(true);
      return;
    }
    sharedSiteMap(latUdeg, lonUdeg)
      .then((url) => {
        if (stale) return;
        src = url;
        onshown(true);
      })
      .catch((e) => {
        // Offline with no copy, or the map server is unavailable: the plain header.
        console.warn('Site map', e);
        if (!stale) onshown(false);
      });
    return () => {
      stale = true;
    };
  });
</script>

<div class="bc-site-header-image bc-site-header-image--image" class:bc-site-header-image--desk={desk} aria-hidden="true">
  {#if src}
    {#if desk}
      <!-- Desktop pane: as wide as the pane, never stretched (the picture's own proportions), centred on the pin. -->
      <img {src} alt="" width={DRAW_WIDTH} height={HALF_HEIGHT * 2} />
    {:else}
      <img {src} alt="" style:width="{DRAW_WIDTH}px" style:height="{HALF_HEIGHT * 2}px" style:margin-left="{-DRAW_WIDTH / 2}px" style:margin-top="{-HALF_HEIGHT}px" />
    {/if}
    <svg class="bc-site-header-image--pin" width="40" height="40" viewBox="-20 -20 40 40">
      <circle class="bc-site-header-image--halo" r="14" />
      <path class="bc-site-header-image--body" d="M0 4 C-2 -1 -8 -5 -8 -11 A8 8 0 1 1 8 -11 C8 -5 2 -1 0 4Z" />
      <circle class="bc-site-header-image--eye" cy="-11" r="3" />
    </svg>
    <div class="bc-site-header-image--fade"></div>
  {/if}
</div>

<style>
  @layer bc.components {
    /* From the top of the screen to just under the header. */
    .bc-site-header-image--image {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(-1 * (var(--f7-navbar-height) + var(--f7-safe-area-top)));
      bottom: -8px;
      overflow: hidden;
      pointer-events: none;
    }

    /* The site is under the pin, in the middle of the top bar. */
    img,
    .bc-site-header-image--pin {
      position: absolute;
      left: 50%;
      top: calc(var(--f7-safe-area-top) + var(--f7-navbar-height) / 2);
    }

    img {
      max-width: none;

      :global(.dark) & {
        filter: brightness(0.6);
      }
    }

    .bc-site-header-image--pin {
      transform: translate(-50%, -50%);
    }

    /* Desktop pane: from the top of the pane, 170 dp; the pin in the header's right half. */
    .bc-site-header-image--image.bc-site-header-image--desk {
      top: 0;
      bottom: auto;
      height: 170px;
    }

    /* The whole header (task 2026-11-22-331): the picture is cropped to fill the pane, centred on the pin, which sits in the
       middle of the pane's width. A pane wider than the picture scales it up, keeping its proportions. */
    .bc-site-header-image--desk img,
    .bc-site-header-image--desk .bc-site-header-image--pin {
      top: 62px;
      left: 50%;
    }

    .bc-site-header-image--desk img {
      width: max(100%, 1000px);
      height: auto;
      aspect-ratio: 1000 / 600;
      transform: translate(-50%, -50%);
    }

    .bc-site-header-image--halo {
      fill: var(--bc-pin);
      fill-opacity: 0.14;
    }

    .bc-site-header-image--body {
      fill: var(--bc-pin);
      stroke: var(--bc-on-pin);
      stroke-width: 1.5;
    }

    .bc-site-header-image--eye {
      fill: var(--bc-on-pin);
    }

    .bc-site-header-image--fade {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        color-mix(in srgb, var(--bc-background) 45%, transparent) 0%,
        color-mix(in srgb, var(--bc-background) 70%, transparent) 60%,
        var(--bc-background) 100%
      );

      /* High contrast: an opaque veil; the header reads on the plain background. */
      :global(html.bc-high-contrast) & {
        background: var(--bc-background);
      }
    }
  }
</style>
