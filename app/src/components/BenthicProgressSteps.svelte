<script>
  // @ts-check
  // The step list of the `.benthic` import (task 2026-11-23-360; docs/system-design.md, « Progress »): « Vérification du
  // fichier » (« 1 248 fichiers, tous intacts » once done), « Plongées et sites », « Équipement, profil et brevets » and, when
  // the file has them, « Photos et vidéos ». A step is done (a check), current (a dot, its count, the time left and the wavy bar)
  // or waiting. It reads the run's state (lib/benthic-import.svelte.js); the first launch and the replace overlay both draw it.
  import Icon from './Icon.svelte';
  import LinearWavyProgress from './LinearWavyProgress.svelte';
  import ProgressLine from './ProgressLine.svelte';
  import { benthicRun } from '../lib/benthic-import.svelte.js';
  import { progressSteps, sizeText } from '../lib/benthic-import-text.js';
  import { formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  const counts = $derived(benthicRun.counts);
  const steps = $derived(progressSteps(benthicRun.phase, { dives: !!counts && counts.dives > 0, media: !!counts && counts.media > 0 }));
  /** @param {number} n */
  const format = (n) => formatNumber(n);

  /** @param {'verify'|'logbook'|'data'|'media'} key */
  function title(key) {
    if (key === 'verify') return t('benthicImport.progress.verify');
    if (key === 'logbook') return t('benthicImport.progress.dives');
    if (key === 'data') return t('benthicImport.progress.data');
    return t('benthicImport.progress.media', { size: sizeText(counts?.mediaBytes ?? 0, t, format) });
  }
</script>

<div class="bc-benthic-steps" role="group" aria-label={t('benthicImport.progress.group')}>
  {#each steps as step (step.key)}
    <div class="bc-benthic-steps--step" data-step={step.key} data-state={step.state}>
      <span class="bc-benthic-steps--mark" class:bc-benthic-steps--done={step.state === 'done'} class:bc-benthic-steps--current={step.state === 'current'}>
        {#if step.state === 'done'}<Icon name="check" size={16} weight={2.6} />{:else if step.state === 'current'}<span class="bc-benthic-steps--dot"></span>{/if}
      </span>
      <span class="bc-benthic-steps--text">
        <span class="bc-benthic-steps--name" class:bc-benthic-steps--waiting={step.state === 'waiting'} class:bc-benthic-steps--name-current={step.state === 'current'}>{title(step.key)}</span>
        {#if step.key === 'verify' && step.state === 'done'}
          <span class="bc-benthic-steps--detail bc-benthic-steps--intact">{t('benthicImport.progress.verifyDone', { n: benthicRun.verifyTotal })}</span>
        {:else if step.key === 'verify' && step.state === 'current'}
          <span class="bc-benthic-steps--detail"><ProgressLine done={benthicRun.verifyFiles} total={benthicRun.verifyTotal} count={t('benthicImport.progress.verifyCount', { done: format(benthicRun.verifyFiles), total: format(benthicRun.verifyTotal) })} /></span>
        {:else if step.key === 'logbook' && step.state === 'current' && counts}
          {@const done = Math.round(benthicRun.fraction * counts.dives)}
          <span class="bc-benthic-steps--detail"><ProgressLine {done} total={counts.dives} count={t('benthicImport.progress.count', { done: format(done), total: format(counts.dives) })} /></span>
        {:else if step.key === 'media' && step.state === 'current'}
          <span class="bc-benthic-steps--detail"><ProgressLine done={benthicRun.done} total={benthicRun.total} count={t('benthicImport.progress.count', { done: sizeText(benthicRun.done, t, format), total: sizeText(benthicRun.total, t, format) })} /></span>
        {/if}
      </span>
    </div>
    {#if step.state === 'current'}
      <div class="bc-benthic-steps--bar">
        <LinearWavyProgress value={benthicRun.fraction} label={title(step.key)} />
      </div>
    {/if}
  {/each}
</div>

<style>
  @layer bc.components {
    .bc-benthic-steps {
      padding: 20px 20px 22px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .bc-benthic-steps--step {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .bc-benthic-steps--mark {
      flex: none;
      box-sizing: border-box;
      width: 28px;
      height: 28px;
      border: 2px solid var(--bc-release-pending);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bc-release-on-panel);
    }

    .bc-benthic-steps--done {
      border: none;
      background: var(--bc-release-ok);
    }

    .bc-benthic-steps--current {
      border: 3px solid var(--bc-release-row-main);
    }

    .bc-benthic-steps--dot {
      width: 10px;
      height: 10px;
      border-radius: 5px;
      background: var(--bc-release-row-main);
    }

    .bc-benthic-steps--text {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
      padding-top: 4px;
    }

    .bc-benthic-steps--name {
      font-size: 16px;
      line-height: 21px;
      font-weight: 500;
    }

    .bc-benthic-steps--name-current {
      font-weight: 600;
    }

    .bc-benthic-steps--waiting {
      color: var(--bc-text-2);
    }

    .bc-benthic-steps--detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-benthic-steps--intact {
      color: var(--bc-text);
    }

    .bc-benthic-steps--bar {
      min-width: 0;
      max-width: calc(100% - 42px);
      overflow: hidden;
      margin: -4px 0 2px 42px;
      --bc-linear-wavy-progress-active: var(--bc-release-row-main);
      --bc-linear-wavy-progress-track: var(--bc-release-track);
    }
  }
</style>
