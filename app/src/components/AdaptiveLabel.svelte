<script>
  // @ts-check
  // Tab label that shows its full form when it fits, its short form otherwise
  // ("Statistiques", "Stats"). Screen readers always hear the full form.
  import { onMount } from 'svelte';

  /** @type {{ full: string, short: string }} */
  let { full, short } = $props();

  /** @type {HTMLSpanElement|undefined} */
  let label = $state();
  /** @type {HTMLSpanElement|undefined} */
  let measure = $state();
  let shortened = $state(false);

  function fit() {
    if (!label || !measure) return;
    shortened = measure.offsetWidth > label.clientWidth;
  }

  onMount(() => {
    // The tab width changes on rotation; the text width with the system text size.
    const observer = new ResizeObserver(fit);
    if (label) observer.observe(label);
    if (measure) observer.observe(measure);
    fit();
    return () => observer.disconnect();
  });
</script>

<span class="bc-adaptive-label tabbar-label bc-adaptive-label--label" class:bc-adaptive-label--shortened={shortened} bind:this={label}>
  <span class="bc-adaptive-label--full">{full}</span>
  <span class="bc-adaptive-label--short" aria-hidden="true">{short}</span>
  <span class="bc-adaptive-label--measure" aria-hidden="true" bind:this={measure}>{full}</span>
</span>

<style>
  @layer bc.components {
    .bc-adaptive-label--label {
      position: relative;
      display: block;
      width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-align: center;

      &.bc-adaptive-label--shortened .bc-adaptive-label--full {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }

      &:not(.bc-adaptive-label--shortened) .bc-adaptive-label--short {
        display: none;
      }
    }

    .bc-adaptive-label--measure {
      position: absolute;
      left: 0;
      top: 0;
      visibility: hidden;
      white-space: nowrap;
    }
  }
</style>
