<script>
  // @ts-check
  // A white result card of the desktop tools (task 2026-11-15-196): the label, the figure large,
  // a line that explains it. `alarm`: the figure in the alarm colour.
  /** @type {{ label: string, value: string, text?: string, alarm?: boolean }} */
  let { label, value, text = '', alarm = false } = $props();
</script>

<div class="od-desktop-result-card">
  <span class="od-desktop-result-card--label">{label}</span>
  <span class="od-desktop-result-card--value od-value" class:od-desktop-result-card--alarm={alarm}>{value}</span>
  {#if text}<span class="od-desktop-result-card--text">{text}</span>{/if}
</div>

<style>
  @layer od.components {
    .od-desktop-result-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding: 16px 20px 18px;
      border-radius: 16px;
      background: var(--od-surface);
    }
    .od-desktop-result-card--label {
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-desktop-result-card--value {
      font-family: var(--od-title-font);
      font-size: 30px;
      font-weight: 500;
      line-height: 1.15;
      color: var(--od-text);
    }
    .od-desktop-result-card--alarm {
      color: var(--od-alarm);
    }
    .od-desktop-result-card--text {
      font-size: 13px;
      line-height: 1.35;
      color: var(--od-text-2);
    }
  }
</style>
