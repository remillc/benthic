<script>
  // @ts-check
  // A white result card of the desktop tools (task 2026-11-15-196): the label, the figure large,
  // a line that explains it. `alarm`: the figure in the alarm colour.
  /** @type {{ label: string, value: string, text?: string, alarm?: boolean }} */
  let { label, value, text = '', alarm = false } = $props();
</script>

<div class="bc-desktop-result-card">
  <span class="bc-desktop-result-card--label">{label}</span>
  <span class="bc-desktop-result-card--value bc-value" class:bc-desktop-result-card--alarm={alarm}>{value}</span>
  {#if text}<span class="bc-desktop-result-card--text">{text}</span>{/if}
</div>

<style>
  @layer od.components {
    .bc-desktop-result-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding: 16px 20px 18px;
      border-radius: 16px;
      background: var(--bc-surface);
    }
    .bc-desktop-result-card--label {
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-result-card--value {
      font-family: var(--bc-title-font);
      font-size: 30px;
      font-weight: 500;
      line-height: 1.15;
      color: var(--bc-text);
    }
    .bc-desktop-result-card--alarm {
      color: var(--bc-alarm);
    }
    .bc-desktop-result-card--text {
      font-size: 13px;
      line-height: 1.35;
      color: var(--bc-text-2);
    }
  }
</style>
