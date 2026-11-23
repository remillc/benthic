<script>
  // @ts-check
  // The step card of the « Envoyer vers divelogs.de » progress (task 2026-11-23-337): the look of the divelogs.de import's
  // card in the first launch (FirstLaunchDivelogs.svelte: paper card, round marks, the wavy bar under the current step, the
  // count and the time left of <ProgressLine>), for a list of steps. A step is done (green check), current (dot), waiting
  // (empty ring) or failed (red « ! »).
  import Icon from './Icon.svelte';
  import LinearWavyProgress from './LinearWavyProgress.svelte';
  import ProgressLine from './ProgressLine.svelte';

  /**
   * @type {{
   *   steps: {
   *     state: 'done'|'current'|'waiting'|'failed',
   *     name: string,
   *     detail?: string,
   *     progress?: { done: number, total: number, count: string },
   *   }[],
   * }}
   * `progress`: the line under the current step, with the count and the time left, and the wave under it.
   */
  let { steps } = $props();
</script>

<div class="bc-divelogs-steps" role="list">
  {#each steps as step (step.name)}
    <div class="bc-divelogs-steps--step" role="listitem" data-state={step.state}>
      <span class="bc-divelogs-steps--mark bc-divelogs-steps--{step.state}" aria-hidden="true">
        {#if step.state === 'done'}<Icon name="check" size={16} weight={2.6} />{:else if step.state === 'current'}<span class="bc-divelogs-steps--dot"></span>{:else if step.state === 'failed'}<span class="bc-divelogs-steps--bang">!</span>{/if}
      </span>
      <span class="bc-divelogs-steps--text">
        <span class="bc-divelogs-steps--name bc-divelogs-steps--name-{step.state}">{step.name}</span>
        {#if step.progress}
          <span class="bc-divelogs-steps--detail"><ProgressLine done={step.progress.done} total={step.progress.total} count={step.progress.count} /></span>
        {:else if step.detail}
          <span class="bc-divelogs-steps--detail" role={step.state === 'failed' ? 'alert' : undefined}>{step.detail}</span>
        {/if}
      </span>
    </div>
    {#if step.progress}
      <div class="bc-divelogs-steps--bar">
        <LinearWavyProgress value={step.progress.total ? step.progress.done / step.progress.total : 0} label={step.name} />
      </div>
    {/if}
  {/each}
</div>

<style>
  @layer bc.components {
    .bc-divelogs-steps {
      margin: 0 24px;
      padding: 20px 20px 22px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .bc-divelogs-steps--step {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .bc-divelogs-steps--mark {
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

    .bc-divelogs-steps--done {
      border: none;
      background: var(--bc-release-ok);
    }

    .bc-divelogs-steps--current {
      border: 3px solid var(--bc-release-row-main);
    }

    .bc-divelogs-steps--failed {
      border: none;
      background: var(--bc-alarm);
    }

    .bc-divelogs-steps--dot {
      width: 10px;
      height: 10px;
      border-radius: 5px;
      background: var(--bc-release-row-main);
    }

    .bc-divelogs-steps--bang {
      font-size: 15px;
      line-height: 16px;
      font-weight: 700;
    }

    .bc-divelogs-steps--text {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
      padding-top: 4px;
    }

    .bc-divelogs-steps--name {
      font-size: 16px;
      line-height: 21px;
      font-weight: 500;
    }

    .bc-divelogs-steps--name-current {
      font-weight: 600;
    }

    .bc-divelogs-steps--name-failed {
      font-weight: 600;
      color: var(--bc-alarm);
    }

    .bc-divelogs-steps--name-waiting {
      color: var(--bc-text-2);
    }

    .bc-divelogs-steps--detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    /* The bar is as wide as the text beside it, never wider (as the import's card). */
    .bc-divelogs-steps--bar {
      min-width: 0;
      max-width: calc(100% - 42px);
      overflow: hidden;
      margin: -4px 0 2px 42px;
      --bc-linear-wavy-progress-active: var(--bc-release-row-main);
      --bc-linear-wavy-progress-track: var(--bc-release-track);
    }
  }
</style>
