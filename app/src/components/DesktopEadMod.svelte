<script module>
  // Kept while the app runs, so that the tool shows the last gas again.
  const saved = { o2: '32', he: '0', po2: 1400, depth: '', water: '', waterDefault: '' };
</script>

<script>
  // @ts-check
  // EAD et MOD on the desktop (task 2026-11-15-196, mock-up bureau-outils-ead-mod): the fields on
  // the left, three result cards on the right. The calculation is the phone's (GasEadMod.svelte):
  // lib/gas-calculator.js with the same arguments.
  import DesktopField from './DesktopField.svelte';
  import DesktopResultCard from './DesktopResultCard.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { depthUnit, formatMixName, formatNumber, formatPartialPressure } from '../lib/format.js';
  import { WATER_TYPES, waterTypeName, salinityOfWaterType, parseDecimal } from '../lib/tools.js';
  import { po2Choices } from '../lib/select-menu.js';
  import { gasCalculator } from '../lib/gas-calculator.js';
  import { t } from '../lib/i18n.js';

  const feet = $derived(logbook.prefs.length === 'ft');
  let o2 = $state(saved.o2);
  let he = $state(saved.he);
  let po2 = $state(String(saved.po2));
  let depth = $state(saved.depth || (logbook.prefs.length === 'ft' ? '100' : '30'));
  // The water type of Settings, until changed here or in Settings.
  if (saved.waterDefault !== settings.defaultWater) saved.water = saved.waterDefault = settings.defaultWater;
  let water = $state(saved.water);
  let result = $state(/** @type {import('../lib/gas-calculator.js').GasResult|null} */ (null));

  /** @param {string} text */
  const percent = (text) => (/^\s*\d{1,3}\s*$/.test(text) ? Number(text) : NaN);
  const o2Value = $derived(percent(o2));
  const heValue = $derived(he.trim() === '' ? 0 : percent(he));
  const gasInvalid = $derived(!(o2Value >= 1 && o2Value <= 100 && heValue >= 0 && o2Value + heValue <= 100));
  const depthValue = $derived(parseDecimal(depth));
  const depthMm = $derived(Math.round(feet ? depthValue * 304.8 : depthValue * 1000));
  const depthInvalid = $derived(!(depthValue > 0 && depthValue < (feet ? 1000 : 300)));

  $effect(() => {
    Object.assign(saved, { o2, he, po2: Number(po2), depth, water });
    if (gasInvalid || depthInvalid) {
      result = null;
      return;
    }
    try {
      result = gasCalculator(o2Value * 10, heValue * 10, Number(po2), depthMm, logbook.prefs, -1, salinityOfWaterType(water));
    } catch (e) {
      console.error('EAD and MOD', e);
      result = null;
    }
  });

  /** Whole metres or feet: the MOD is rounded to the metre. @param {number} mm */
  function wholeDepth(mm) {
    return `${formatNumber(feet ? mm / 304.8 : mm / 1000, 0)} ${depthUnit(logbook.prefs)}`;
  }

  const po2Options = po2Choices().map((mbar) => ({ value: String(mbar), label: formatPartialPressure(mbar / 1000, 1) }));
  const waterOptions = WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) }));
  const gasName = $derived(result ? formatMixName(result.o2, result.he) : '');
</script>

<div class="bc-desktop-ead-mod">
  <div class="bc-desktop-ead-mod--fields">
    <DesktopField label={t('tools.oxygen')} bind:value={o2} unit={t('units.percent')} invalid={gasInvalid} helper={gasInvalid ? t('tools.gasInvalid') : ''} />
    <DesktopField label={t('tools.helium')} bind:value={he} unit={t('units.percent')} invalid={gasInvalid} />
    <DesktopField label={t('tools.maxPo2')} bind:value={po2} options={po2Options} />
    <DesktopField
      label={t('tools.plannedDepth')}
      bind:value={depth}
      unit={depthUnit(logbook.prefs)}
      invalid={depthInvalid}
      helper={depthInvalid ? t('tools.depthInvalid') : t('tools.plannedDepthHelp')}
    />
    <DesktopField label={t('tools.waterType')} bind:value={water} options={waterOptions} />
  </div>

  <div class="bc-desktop-ead-mod--results">
    <h3 class="bc-desktop-ead-mod--heading">{result ? t('desktopTools.resultsFor', { gas: gasName }) : t('tools.results')}</h3>
    <div class="bc-desktop-ead-mod--cards" aria-live="polite">
      {#if result}
        <DesktopResultCard label={t('tools.mod')} value={wholeDepth(result.modMm)} text={t('desktopTools.modSub', { po2: formatPartialPressure(result.po2Mbar / 1000, 1) })} />
        <DesktopResultCard label={t('tools.ead')} value={wholeDepth(result.eadPlannedMm)} text={t('tools.eadSub', { depth: wholeDepth(depthMm) })} />
        <DesktopResultCard label={t('tools.end')} value={wholeDepth(result.endPlannedMm)} text={t(result.o2Narcotic ? 'tools.endSub' : 'tools.endSubNotNarcotic')} />
      {:else}
        <DesktopResultCard label={t('tools.mod')} value="—" />
        <DesktopResultCard label={t('tools.ead')} value="—" />
        <DesktopResultCard label={t('tools.end')} value="—" />
      {/if}
    </div>
    <p class="bc-desktop-ead-mod--note">{t('tools.eadNote')}</p>
  </div>
</div>

<style>
  @layer od.components {
    .bc-desktop-ead-mod {
      display: grid;
      grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
      gap: 32px;
      align-items: start;
    }
    /* Fluid layout: in a narrow pane the results go under the inputs. */
    @container od-tool (max-width: 799px) {
      .bc-desktop-ead-mod {
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
      }
    }
    .bc-desktop-ead-mod--fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px 16px;
      align-items: start;
    }
    .bc-desktop-ead-mod--heading {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-ead-mod--cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .bc-desktop-ead-mod--note {
      margin: 12px 0 0;
      font-size: 12px;
      color: var(--bc-text-2);
    }
  }
</style>
