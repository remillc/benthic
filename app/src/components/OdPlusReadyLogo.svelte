<script>
  // @ts-check
  // The disc of « Votre carnet est prêt » (task 2026-11-18-270). Played: pop, two turns, wave to check mark, white ring.
  // Not played (back to the screen, reduced motion): the end state, a white disc with the blue check mark.
  import { onMount } from 'svelte';
  import { CHECK_PATH, MORPH, WAVE_PATH } from '../lib/ready-animation.js';

  /** `size`: the disc's diameter, 72 on a phone, 120 on the blue panel (the ring then spreads 56). @type {{ play: boolean, size?: number }} */
  let { play, size = 72 } = $props();

  /** @type {SVGAnimateElement | undefined} */
  let morph = $state();

  // The line morphs in SVG (SMIL, which every web view runs); the rest is CSS on transform and opacity.
  onMount(() => {
    if (play) /** @type {any} */ (morph)?.beginElement?.();
  });
</script>

<span class="od-ready-logo" class:od-ready-logo--play={play} style="--od-ready-size: {size}px; --od-ready-ring: {1 + (size === 72 ? 36 : 56) / (size / 2)}">
  <span class="od-ready-logo--ring" aria-hidden="true"></span>
  <span class="od-ready-logo--disc">
    <span class="od-ready-logo--white"></span>
    <svg class="od-ready-logo--mark" width={Math.round((size * 38) / 72)} height={Math.round((size * 38) / 72)} viewBox="0 0 24 24" aria-hidden="true">
      <path d={play ? WAVE_PATH : CHECK_PATH}>
        {#if play}
          <animate bind:this={morph} attributeName="d" begin="indefinite" values={MORPH.values} keyTimes={MORPH.keyTimes} dur={MORPH.dur} calcMode="spline" keySplines={MORPH.keySplines} fill="freeze" />
        {/if}
      </path>
    </svg>
  </span>
</span>

<style>
  @layer od.components {
    .od-ready-logo {
      position: relative;
      width: var(--od-ready-size, 72px);
      height: var(--od-ready-size, 72px);
      flex: none;
      display: block;
    }

    /* The ring of the end: a disc behind the logo that grows to twice its size while it fades (36 px of spread). */
    .od-ready-logo--ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: var(--od-plus-ring);
      opacity: 0;
    }

    .od-ready-logo--disc {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-row-main);
      box-shadow: 0 6px 18px var(--od-plus-logo-shadow);
    }

    /* The white disc is a layer over the blue one, so the change of colour is an opacity change. */
    .od-ready-logo--white {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: var(--od-release-on-panel);
    }

    .od-ready-logo--mark {
      position: relative;
      flex: none;
      fill: none;
      stroke: var(--od-release-row-main);
      stroke-width: 2.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .od-ready-logo--play {
      .od-ready-logo--disc {
        animation: od-ready-pop 2000ms linear 1 both;
      }

      .od-ready-logo--white {
        animation: od-ready-white 2000ms ease-out 1 both;
      }

      .od-ready-logo--mark {
        animation: od-ready-line 2000ms ease-out 1 both;
      }

      .od-ready-logo--ring {
        animation: od-ready-ring 2000ms ease-out 1 both;
      }
    }

    /* 0 to 0.3 s: the logo grows; 0.3 to 1.3 s: two turns, slowing down; 1.5 to 1.8 s: the bounce 1.14, 0.95, 1. */
    @keyframes od-ready-pop {
      0% {
        transform: scale(0) rotate(0deg);
        animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1.2);
      }
      15% {
        transform: scale(1) rotate(0deg);
        animation-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1);
      }
      65% {
        transform: scale(1) rotate(720deg);
        animation-timing-function: ease-out;
      }
      75% {
        transform: scale(1.14) rotate(720deg);
      }
      85% {
        transform: scale(0.95) rotate(720deg);
      }
      100% {
        transform: scale(1) rotate(720deg);
      }
    }

    @keyframes od-ready-white {
      0%,
      65% {
        opacity: 0;
      }
      85%,
      100% {
        opacity: 1;
      }
    }

    @keyframes od-ready-line {
      0%,
      65% {
        stroke: var(--od-release-on-panel);
      }
      85%,
      100% {
        stroke: var(--od-release-row-main);
      }
    }

    @keyframes od-ready-ring {
      0%,
      74.9% {
        opacity: 0;
        transform: scale(1);
      }
      75% {
        opacity: 1;
        transform: scale(1);
      }
      100% {
        opacity: 0;
        transform: scale(var(--od-ready-ring, 2));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-ready-logo--play {
        .od-ready-logo--disc,
        .od-ready-logo--white,
        .od-ready-logo--mark,
        .od-ready-logo--ring {
          animation: none;
        }
      }
    }
  }
</style>
