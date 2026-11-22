<script>
  // @ts-check
  // The key figures of a dive: depth, time, water temperature. A figure
  // without a value is left out.
  import { formatDepth, formatDuration, formatTemperature } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ dive: import('benthic-core').DiveDetail, prefs: import('benthic-core').Prefs }} */
  let { dive, prefs } = $props();

  const figures = $derived.by(() => {
    const water = formatTemperature(dive.waterTempMk, prefs);
    return [
      dive.maxDepthMm ? { value: formatDepth(dive.maxDepthMm, prefs), label: t('detail.figureMaxDepth') } : null,
      { value: formatDuration(dive.durationSeconds), label: t('detail.figureDuration') },
      // Subsurface keeps the lowest water temperature of the dive.
      water ? { value: water, label: t('detail.figureWaterMin') } : null,
    ].filter((f) => f !== null);
  });
</script>

<div class="bc-dive-figures bc-value">
  {#each figures as figure (figure.label)}
    <span class="bc-dive-figures--figure"><span class="bc-dive-figures--value">{figure.value}</span><span class="bc-dive-figures--label">{figure.label}</span></span>
  {/each}
</div>

<style>
  @layer od.components {
    .bc-dive-figures {
      padding: 14px 20px 0;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .bc-dive-figures--figure {
      display: flex;
      flex-direction: column;
    }

    /* Large key figures: the system font, as the titles (spec, "Fonts"). */
    .bc-dive-figures--value {
      font-family: var(--bc-title-font);
      font-size: 28px;
      line-height: normal;
      font-weight: 800;
      color: var(--bc-text);
    }

    .bc-dive-figures--label {
      font-size: 13px;
      color: var(--bc-text-2);
    }
  }
</style>
