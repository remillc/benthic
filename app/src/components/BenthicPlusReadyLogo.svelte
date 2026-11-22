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

<span class="bc-ready-logo" class:bc-ready-logo--play={play} style="--bc-ready-size: {size}px; --bc-ready-ring: {1 + (size === 72 ? 36 : 56) / (size / 2)}">
  <span class="bc-ready-logo--ring" aria-hidden="true"></span>
  <span class="bc-ready-logo--disc">
    <span class="bc-ready-logo--white"></span>
    <svg class="bc-ready-logo--mark" width={Math.round((size * 38) / 72)} height={Math.round((size * 38) / 72)} viewBox="0 0 24 24" aria-hidden="true">
      <path d={play ? WAVE_PATH : CHECK_PATH}>
        {#if play}
          <animate bind:this={morph} attributeName="d" begin="indefinite" values={MORPH.values} keyTimes={MORPH.keyTimes} dur={MORPH.dur} calcMode="spline" keySplines={MORPH.keySplines} fill="freeze" />
        {/if}
      </path>
    </svg>
  </span>
</span>

<style>
  @layer bc.components {
    .bc-ready-logo {
      position: relative;
      width: var(--bc-ready-size, 72px);
      height: var(--bc-ready-size, 72px);
      flex: none;
      display: block;
    }

    /* The ring of the end: a disc behind the logo that grows to twice its size while it fades (36 px of spread). */
    .bc-ready-logo--ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: var(--bc-plus-ring);
      opacity: 0;
    }

    .bc-ready-logo--disc {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-row-main);
      box-shadow: 0 6px 18px var(--bc-plus-logo-shadow);
    }

    /* The white disc is a layer over the blue one, so the change of colour is an opacity change. */
    .bc-ready-logo--white {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: var(--bc-release-on-panel);
    }

    .bc-ready-logo--mark {
      position: relative;
      flex: none;
      fill: none;
      stroke: var(--bc-release-row-main);
      stroke-width: 2.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .bc-ready-logo--play {
      .bc-ready-logo--disc {
        animation: bc-ready-pop 2000ms linear 1 both;
      }

      .bc-ready-logo--white {
        animation: bc-ready-white 2000ms ease-out 1 both;
      }

      .bc-ready-logo--mark {
        animation: bc-ready-line 2000ms ease-out 1 both;
      }

      .bc-ready-logo--ring {
        animation: bc-ready-ring 2000ms ease-out 1 both;
      }
    }

    /* 0 to 0.3 s: the logo grows; 0.3 to 1.3 s: two turns, slowing down; 1.5 to 1.8 s: the bounce 1.14, 0.95, 1. */
    @keyframes bc-ready-pop {
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

    @keyframes bc-ready-white {
      0%,
      65% {
        opacity: 0;
      }
      85%,
      100% {
        opacity: 1;
      }
    }

    @keyframes bc-ready-line {
      0%,
      65% {
        stroke: var(--bc-release-on-panel);
      }
      85%,
      100% {
        stroke: var(--bc-release-row-main);
      }
    }

    @keyframes bc-ready-ring {
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
        transform: scale(var(--bc-ready-ring, 2));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-ready-logo--play {
        .bc-ready-logo--disc,
        .bc-ready-logo--white,
        .bc-ready-logo--mark,
        .bc-ready-logo--ring {
          animation: none;
        }
      }
    }
  }
</style>
