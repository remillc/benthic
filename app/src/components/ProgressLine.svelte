<script>
  // @ts-check
  // <ProgressLine> (docs/system-design.md): the line under a progress step. The count on the left, the time left on
  // the right, aligned with the end of the bar (task 2026-11-18-269). The time left comes from lib/time-left.js and
  // stays empty until it is worth showing. A screen reader hears one text: « 184 sur 312, 20 secondes restantes ».
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n.js';
  import { createTimeLeft, timeLeftText } from '../lib/time-left.js';

  /**
   * @type {{ done: number, total: number, count: string, now?: () => number }}
   * `count`: the text of the count (« 184 sur 312 »). `now`: the clock, for tests.
   */
  let { done, total, count, now = Date.now } = $props();

  const estimator = createTimeLeft();
  let clock = $state(now());
  const left = $derived(estimator.update(done, total, clock));
  const short = $derived(timeLeftText(t, left));
  const spoken = $derived(left ? `${count}, ${timeLeftText(t, left, true)}` : count);

  // Re-read the clock every second and at each new count, so that a stalled operation does not keep its old value.
  $effect(() => {
    void done;
    clock = now();
  });
  onMount(() => {
    const id = setInterval(() => (clock = now()), 1000);
    return () => clearInterval(id);
  });
</script>

<span class="od-progress-line">
  <span class="od-progress-line--count" aria-hidden="true">{count}</span>
  <span class="od-progress-line--left" aria-hidden="true">{short}</span>
  <span class="od-sr-only">{spoken}</span>
</span>

<style>
  @layer od.components {
    .od-progress-line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .od-progress-line--left {
      white-space: nowrap;
      text-align: end;
    }
  }
</style>
