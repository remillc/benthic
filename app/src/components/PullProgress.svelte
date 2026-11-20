<script>
  // @ts-check
  // <PullProgress> (todo 88): the Carnet shows the copy of this device at start, then the app
  // exchanges with the server. This bar, at the top of the list, says that the exchange runs and
  // how far it is (the stages of lib/sync-progress.js); it takes no height, so the list does not
  // move when it goes. Android: the Material 3 Expressive wavy linear indicator
  // (docs/system-design.md, section 8); iPhone: the 8 pt bar of the iOS downloads.
  import { theme } from 'framework7-svelte';
  import LinearWavyProgress from './LinearWavyProgress.svelte';
  import { logbook, syncFlavour } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  const fraction = $derived(logbook.syncProgress?.fraction ?? 0);
  const percent = $derived(Math.round(fraction * 100));
  const label = $derived(t(`sync.syncing${syncFlavour()}`));
</script>

<div class="bc-pull-progress" role="status">
  {#if theme.ios}
    <div
      class="bc-pull-progress--bar"
      class:bc-pull-progress--indeterminate={fraction <= 0}
      role="progressbar"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={fraction > 0 ? percent : undefined}
    >
      <div class="bc-pull-progress--fill" style:width={fraction > 0 ? `${percent}%` : undefined}></div>
    </div>
  {:else}
    <LinearWavyProgress value={fraction} indeterminate={fraction <= 0} {label} />
  {/if}
</div>

<style>
  @layer od.components {
    /* No height: the bar lies over the first pixels of the list. */
    .bc-pull-progress {
      position: relative;
      height: 0;
      z-index: 2;
      padding: 0 16px;
      pointer-events: none;
    }

    .bc-pull-progress--bar {
      position: absolute;
      top: 4px;
      left: 16px;
      right: 16px;
      height: 4px;
      border-radius: 2px;
      background: var(--bc-surface-2);
      overflow: hidden;

      :global(.ios) & {
        height: 8px;
        border-radius: 4px;
      }
    }

    .bc-pull-progress--fill {
      height: 100%;
      border-radius: inherit;
      background: var(--bc-action);
      transition: width 0.3s;
    }

    .bc-pull-progress--indeterminate .bc-pull-progress--fill {
      position: absolute;
      width: 40%;
      animation: od-pull-progress-slide 1.4s ease-in-out infinite;
    }

    @keyframes od-pull-progress-slide {
      from {
        left: -40%;
      }
      to {
        left: 100%;
      }
    }
  }
</style>
