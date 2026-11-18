<script>
  // @ts-check
  // The bubbles of the header of « Votre carnet est prêt » (task 2026-11-18-270): there from the start, each rises at a
  // constant speed (1.6 to 2.5 s, the lowest the longest) and leaves through the top; none comes back. While rising it
  // sways 5 px left and right, a round trip every 1.4 s, each starting at another point of the sway.
  // `still`: they stay in place (reduced motion).
  import { BUBBLES } from '../lib/ready-animation.js';

  /** @type {{ still: boolean }} */
  let { still } = $props();
</script>

<svg class="od-ready-bubbles" class:od-ready-bubbles--still={still} viewBox="0 0 390 372" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
  {#each BUBBLES as b, i (i)}
    <circle class="od-ready-bubbles--bubble" cx={b.cx} cy={b.cy} r={b.r} style="--dy: {b.dy}px; --d: {b.duration}ms; --phase: -{b.phase}ms" />
  {/each}
</svg>

<style>
  @layer od.components {
    .od-ready-bubbles {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .od-ready-bubbles--bubble {
      fill: none;
      stroke: var(--od-plus-bubble);
      stroke-width: 1.2;
      animation:
        od-ready-rise var(--d) linear 1 forwards,
        od-ready-sway 700ms ease-in-out var(--phase) 6 alternate;
    }

    .od-ready-bubbles--still .od-ready-bubbles--bubble {
      animation: none;
    }

    @keyframes od-ready-rise {
      from {
        transform: translateY(0);
      }
      to {
        transform: translateY(var(--dy));
      }
    }

    @keyframes od-ready-sway {
      from {
        translate: -5px 0;
      }
      to {
        translate: 5px 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-ready-bubbles--bubble {
        animation: none;
      }
    }
  }
</style>
