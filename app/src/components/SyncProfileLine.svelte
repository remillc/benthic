<script>
  // @ts-check
  // <SyncProfileLine> (task 2026-11-23-340, replacing <PullProgress> of todo 88): the Carnet shows the copy of this
  // device at start, then the app exchanges with the server. A white line, with a soft glow, is drawn on the header's
  // faint dive profile and says that the exchange runs and how far it is (the stages of lib/sync-progress.js): a segment
  // slides while the progress is unknown, the line fills up to the fraction once known, completes when the exchange ends,
  // then fades. It takes no height, so nothing moves.
  //
  // It is laid over the profile of the band (<BandBackdrop>, the Material look; the profile is the same curve,
  // lib/band-profile.js). Where a header has no band (iPhone and iPad, the desktop's table), `edge` draws the faint
  // profile too, in the ink colour, just under the header, and the line on it.
  import { untrack } from 'svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { bandProfileInPixels } from '../lib/band-profile.js';
  import { SYNC_LINE, lineView, nextLinePhase } from '../lib/sync-line.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ edge?: boolean }} */
  let { edge = false } = $props();

  /** The height of the profile's box, as drawn by the bands (px). */
  const HEIGHT = 34;
  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  let width = $state(0);
  /** @type {import('../lib/sync-line.js').LinePhase} */
  let phase = $state('idle');
  let reduced = $state(!!motion?.matches);
  /** @type {ReturnType<typeof setTimeout>[]} */
  let timers = [];

  const active = $derived(logbook.pulling && !logbook.loading && !logbook.error);
  const failed = $derived(!!logbook.error);
  const fraction = $derived(logbook.syncProgress?.fraction ?? 0);
  const view = $derived(lineView(phase, fraction, reduced));
  const path = $derived(width > 0 ? bandProfileInPixels(width, HEIGHT) : '');
  const label = $derived(t('sync.progressLine'));

  const clear = () => {
    for (const id of timers) clearTimeout(id);
    timers = [];
  };

  $effect(() => {
    const on = active;
    const bad = failed;
    untrack(() => {
      const next = nextLinePhase(phase, on, { reduced, failed: bad });
      if (next === phase) return;
      clear();
      phase = next;
      if (next === 'completing') {
        timers.push(
          setTimeout(() => {
            phase = 'fading';
            timers.push(setTimeout(() => (phase = 'idle'), SYNC_LINE.fadeMs));
          }, SYNC_LINE.completeMs + SYNC_LINE.holdMs),
        );
      }
    });
  });

  $effect(() => {
    const follow = (/** @type {MediaQueryListEvent} */ e) => (reduced = e.matches);
    motion?.addEventListener('change', follow);
    return () => {
      motion?.removeEventListener('change', follow);
      clear();
    };
  });
</script>

{#if view.visible}
  <div class="bc-sync-line" class:bc-sync-line--edge={edge} class:bc-sync-line--band={!edge} role="status" bind:clientWidth={width}>
    <svg
      class="bc-sync-line--svg"
      class:bc-sync-line--fading={phase === 'fading'}
      width={width}
      height={HEIGHT}
      viewBox="0 0 {width} {HEIGHT}"
      style:opacity={view.groupOpacity}
      role="progressbar"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={view.value}
    >
      {#if edge && path}
        <path d="{path} V{HEIGHT} H0 Z" class="bc-sync-line--area" />
        <path d={path} class="bc-sync-line--faint" />
      {/if}
      {#if path}
        <path
          d={path}
          class="bc-sync-line--line"
          class:bc-sync-line--sliding={view.mode === 'sliding'}
          pathLength="100"
          style:stroke-dasharray={view.dash}
          style:opacity={view.opacity}
          style:transition={view.transition}
        />
      {/if}
    </svg>
  </div>
{/if}

<style>
  @layer bc.components {
    /* The same box as the band's profile: its width, 34 px tall, 2 px above the band's bottom. */
    .bc-sync-line {
      position: absolute;
      left: 0;
      width: 100%;
      height: 34px;
      z-index: 1;
      pointer-events: none;
      color: var(--bc-on-band);

      &.bc-sync-line--band {
        bottom: 2px;
      }

      /* No band: just under the header, over the first pixels of the list (the line takes no height). */
      &.bc-sync-line--edge {
        top: 100%;
        color: var(--bc-action);
      }
    }

    .bc-sync-line--svg {
      display: block;
      overflow: visible;
      transition: none;

      &.bc-sync-line--fading {
        transition: opacity 1100ms ease-in-out;
      }

      .bc-sync-line--band & {
        filter: drop-shadow(0 0 3px rgb(255 255 255 / 0.85)) drop-shadow(0 0 6px rgb(255 255 255 / 0.45));
      }
    }

    .bc-sync-line--area {
      fill: color-mix(in srgb, var(--bc-text) 6%, transparent);
    }

    .bc-sync-line--faint {
      fill: none;
      stroke: color-mix(in srgb, var(--bc-text) 22%, transparent);
      stroke-width: 1.5;
      stroke-linejoin: round;
    }

    .bc-sync-line--line {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* A quarter of the line crosses it from left to right in 1.6 s, linear, looping. */
    .bc-sync-line--sliding {
      animation: bc-sync-line-slide 1.6s linear infinite;
    }

    @keyframes bc-sync-line-slide {
      from {
        stroke-dashoffset: 26;
      }
      to {
        stroke-dashoffset: -101;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-sync-line--sliding {
        animation: none;
      }

      .bc-sync-line--svg.bc-sync-line--fading {
        transition: none;
      }
    }
  }
</style>
