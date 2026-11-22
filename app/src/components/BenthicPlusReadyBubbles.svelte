<script>
  // @ts-check
  // The bubbles of the header of « Votre carnet est prêt » (task 2026-11-18-270): there from the start, each rises at a
  // constant speed (1.6 to 2.5 s, the lowest the longest) and leaves through the top; none comes back. While rising it
  // sways 5 px left and right, a round trip every 1.4 s, each starting at another point of the sway.
  // `still`: they stay in place (reduced motion).
  import { BUBBLES, BUBBLES_PANEL } from '../lib/ready-animation.js';

  /** `panel`: over a blue panel (700 × 900) instead of the phone's header. @type {{ still: boolean, panel?: boolean }} */
  let { still, panel = false } = $props();
  const bubbles = $derived(panel ? BUBBLES_PANEL : BUBBLES);
</script>

<svg class="bc-ready-bubbles" class:bc-ready-bubbles--still={still} viewBox={panel ? '0 0 700 900' : '0 0 390 372'} preserveAspectRatio={panel ? 'xMidYMid slice' : 'xMidYMin slice'} aria-hidden="true">
  {#each bubbles as b, i (i)}
    <circle class="bc-ready-bubbles--bubble" cx={b.cx} cy={b.cy} r={b.r} style="--dy: {b.dy}px; --d: {b.duration}ms; --phase: -{b.phase}ms" />
  {/each}
</svg>

<style>
  @layer bc.components {
    .bc-ready-bubbles {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .bc-ready-bubbles--bubble {
      fill: none;
      stroke: var(--bc-plus-bubble);
      stroke-width: 1.2;
      animation:
        bc-ready-rise var(--d) linear 1 forwards,
        bc-ready-sway 700ms ease-in-out var(--phase) 6 alternate;
    }

    .bc-ready-bubbles--still .bc-ready-bubbles--bubble {
      animation: none;
    }

    @keyframes bc-ready-rise {
      from {
        transform: translateY(0);
      }
      to {
        transform: translateY(var(--dy));
      }
    }

    @keyframes bc-ready-sway {
      from {
        translate: -5px 0;
      }
      to {
        translate: 5px 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-ready-bubbles--bubble {
        animation: none;
      }
    }
  }
</style>
