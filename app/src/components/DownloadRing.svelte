<script>
  // @ts-check
  // The round figure of the download screens (task 2026-11-23-357): the computer's picture or a Bluetooth disc
  // inside rings that pulse (search, connection), or inside a circular progress ring with the percentage
  // (download in progress). The picture is the `children` snippet.

  /**
   * `value`: the fraction done (0 to 1) for the progress ring; left out, the rings pulse.
   * `percent`: the percentage written under the picture, the progress ring only. `label`: the ring's name for assistive technology.
   * @type {{ value?: number|null, percent?: string, label?: string, size?: number, children: import('svelte').Snippet }}
   */
  let { value = null, percent = '', label = '', size = 168, children } = $props();
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
</script>

<div class="bc-download-ring" class:bc-download-ring--pulse={value === null} style:--bc-download-ring-size="{size}px">
  {#if value === null}
    <span class="bc-download-ring--wave" aria-hidden="true"></span>
    <span class="bc-download-ring--wave bc-download-ring--wave-late" aria-hidden="true"></span>
    <span class="bc-download-ring--wave bc-download-ring--wave-last" aria-hidden="true"></span>
  {:else}
    <svg class="bc-download-ring--svg" viewBox="0 0 168 168" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(value * 100)}>
      <circle class="bc-download-ring--track" cx="84" cy="84" r={radius} />
      <circle
        class="bc-download-ring--arc"
        cx="84"
        cy="84"
        r={radius}
        stroke-dasharray={circumference}
        stroke-dashoffset={circumference * (1 - Math.min(1, Math.max(0, value)))}
        transform="rotate(-90 84 84)"
      />
    </svg>
  {/if}
  <div class="bc-download-ring--center">
    {@render children()}
    {#if percent}<span class="bc-download-ring--percent">{percent}</span>{/if}
  </div>
</div>

<style>
  @layer bc.components {
    .bc-download-ring {
      position: relative;
      width: var(--bc-download-ring-size);
      height: var(--bc-download-ring-size);
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-download-ring--center {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--bc-text);
    }

    .bc-download-ring--percent {
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .bc-download-ring--svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .bc-download-ring--track,
    .bc-download-ring--arc {
      fill: none;
      stroke-width: 8;
    }

    .bc-download-ring--track {
      stroke: var(--bc-progress-track);
    }

    .bc-download-ring--arc {
      stroke: var(--bc-secondary);
      stroke-linecap: round;
      transition: stroke-dashoffset 0.3s;
    }

    .bc-download-ring--wave {
      position: absolute;
      inset: 18%;
      border-radius: 50%;
      border: 2px solid var(--bc-secondary);
      opacity: 0;
      animation: bc-download-ring-pulse 2.4s ease-out infinite;
    }

    .bc-download-ring--wave-late {
      animation-delay: 0.8s;
    }

    .bc-download-ring--wave-last {
      animation-delay: 1.6s;
    }

    @keyframes bc-download-ring-pulse {
      from {
        transform: scale(0.8);
        opacity: 0.55;
      }
      to {
        transform: scale(1.25);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-download-ring--wave {
        animation: none;
        opacity: 0.25;
      }

      .bc-download-ring--wave-late {
        transform: scale(1.1);
      }

      .bc-download-ring--wave-last {
        transform: scale(1.25);
      }
    }
  }
</style>
