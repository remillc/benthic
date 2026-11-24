<script>
  // @ts-check
  // <FileImportProgress> (docs/ui-specification.md, « Import progress »): the one progress line of a file import, from
  // the moment a logbook file or a sites file is received or chosen until the import is finished. Mounted once, in
  // App.svelte, over every screen, so that it stays across the screens of a flow. A short phase label and « Annuler »
  // (copy and check only), the bar (Android: the wavy linear indicator; iPhone: the 8 pt bar), and under it
  // <ProgressLine>: the count on the left, the time left on the right. The phases and their weights are
  // lib/import-progress.js.
  import { theme } from 'framework7-svelte';
  import LinearWavyProgress from './LinearWavyProgress.svelte';
  import ProgressLine from './ProgressLine.svelte';
  import { importProgress, importState } from '../lib/import-progress.svelte.js';
  import { benthicRun } from '../lib/benthic-import.svelte.js';
  import { sizeParts } from '../lib/import-progress.js';
  import { t } from '../lib/i18n.js';

  const phaseLabel = $derived(importState.phase ? t(`importFlow.${importState.phase}`) : '');
  const percent = $derived(Math.round(importState.fraction * 100));
  /** @param {number} bytes */
  const size = (bytes) => {
    const { n, unit } = sizeParts(bytes);
    return t(`importFlow.${unit}`, { n: n.toLocaleString() });
  };
  /** The count on the left: the bytes of the copy and the check, a plain text while the core reads, else the percentage. */
  const count = $derived(
    importState.indeterminate
      ? t(importState.phase === 'save' ? 'importFlow.saving' : 'importFlow.reading')
      : importState.total > 0 && (importState.phase === 'copy' || importState.phase === 'check')
        ? t('importFlow.size', { done: size(importState.done), total: size(importState.total) })
        : t('importFlow.percent', { n: percent }),
  );
  /** What the screen reader hears at the line: « Import des plongées, 42 %, 20 secondes restantes » (the time left is added by ProgressLine). */
  const spoken = $derived(t('importFlow.spoken', { phase: phaseLabel, n: percent }));
</script>

<!-- A .benthic import draws its own steps (components/BenthicProgressSteps.svelte): the one line stays out of its way. -->
{#if importState.active && importState.visible && !benthicRun.active}
  <div class="bc-import-progress" role="group" aria-label={t('importFlow.group')}>
    <!-- Announced once per phase, not at each count (the line itself is read on demand). -->
    <span class="bc-sr-only" role="status">{phaseLabel}</span>
    <div class="bc-import-progress--head">
      <span class="bc-import-progress--phase">{phaseLabel}</span>
      {#if importState.cancellable}
        <button type="button" class="bc-text-button bc-import-progress--cancel" disabled={importState.cancelling} onclick={() => importProgress.cancel()}>{t('importFlow.cancel')}</button>
      {/if}
    </div>
    <div class="bc-import-progress--bar">
      {#if theme.ios}
        <div
          class="bc-import-progress--ios"
          class:bc-import-progress--indeterminate={importState.indeterminate}
          role="progressbar"
          aria-label={phaseLabel}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={importState.indeterminate ? undefined : percent}
        >
          <div class="bc-import-progress--fill" style:width={importState.indeterminate ? undefined : `${percent}%`}></div>
        </div>
      {:else}
        <LinearWavyProgress value={importState.fraction} indeterminate={importState.indeterminate} label={phaseLabel} />
      {/if}
    </div>
    <div class="bc-import-progress--line">
      {#if importState.indeterminate}
        <span class="bc-import-progress--count">{count}</span>
      {:else}
        {#key importState.segment}
          <ProgressLine done={Math.round(importState.fraction * 1000)} total={1000} {count} label={spoken} />
        {/key}
      {/if}
    </div>
  </div>
{/if}

<style>
  @layer bc.components {
    /* A card over every screen, above the bottom bar and clear of the gesture bar; fixed, so nothing moves under it. */
    .bc-import-progress {
      position: fixed;
      z-index: 13000;
      left: 12px;
      right: 12px;
      bottom: calc(var(--f7-safe-area-bottom, 0px) + 88px);
      max-width: 480px;
      margin-inline: auto;
      padding: 12px 16px 14px;
      border-radius: 16px;
      background: var(--bc-surface-container-highest, var(--bc-surface));
      color: var(--bc-text);
      box-shadow: 0 2px 12px rgb(0 0 0 / 0.22);
      font-size: 14px;
      line-height: 20px;
    }

    .bc-import-progress--head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: 36px;
    }

    .bc-import-progress--phase {
      font-weight: 600;
    }

    .bc-import-progress--bar {
      margin-top: 4px;
    }

    .bc-import-progress--line {
      margin-top: 6px;
      color: var(--bc-text-2);
      height: 20px;
    }

    .bc-import-progress--ios {
      position: relative;
      height: 8px;
      border-radius: 4px;
      background: var(--bc-surface-2);
      overflow: hidden;
    }

    .bc-import-progress--fill {
      height: 100%;
      border-radius: inherit;
      background: var(--bc-action);
      transition: width 0.3s;
    }

    .bc-import-progress--indeterminate .bc-import-progress--fill {
      position: absolute;
      width: 40%;
      animation: bc-import-progress-slide 1.4s ease-in-out infinite;
    }

    @keyframes bc-import-progress-slide {
      from {
        left: -40%;
      }
      to {
        left: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-import-progress--fill {
        transition: none;
      }
    }
  }
</style>
