<script module>
  // Kept while the app runs, so that the tool shows the last values again.
  const saved = { po2: 1400, depth: '', water: '', waterDefault: '', mode: 'nitrox' };
</script>

<script>
  // @ts-check
  // Meilleur mélange on the desktop (task 2026-11-15-196, mock-up bureau-outils-meilleur-melange):
  // Nitrox / Trimix, the fields on the left; on the right the advised mix in a large card with
  // « Préparer ce mélange », then the MOD, END and ppO₂ at the planned depth. The calculation
  // is the phone's (GasBestMix.svelte): lib/gas-calculator.js with the same arguments.
  import DesktopField from './DesktopField.svelte';
  import DesktopSegments from './DesktopSegments.svelte';
  import DesktopResultCard from './DesktopResultCard.svelte';
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { depthUnit, formatNumber, formatPartialPressure } from '../lib/format.js';
  import { WATER_TYPES, waterTypeName, salinityOfWaterType, parseDecimal } from '../lib/tools.js';
  import { po2Choices } from '../lib/select-menu.js';
  import { gasCalculator } from '../lib/gas-calculator.js';
  import { po2AtDepth } from '../lib/desktop-tools.js';
  import { prepareBlend } from '../lib/desktop-tools.svelte.js';
  import { t } from '../lib/i18n.js';

  let mode = $state(/** @type {'nitrox'|'trimix'} */ (saved.mode === 'trimix' ? 'trimix' : 'nitrox'));
  const trimix = $derived(mode === 'trimix');
  const feet = logbook.prefs.length === 'ft';
  const mmPerUnit = feet ? 304.8 : 1000;
  let po2 = $state(String(saved.po2));
  let depth = $state(saved.depth || (feet ? '100' : '30'));
  if (saved.waterDefault !== settings.defaultWater) saved.water = saved.waterDefault = settings.defaultWater;
  let water = $state(saved.water);
  // The Settings value, in the unit of the depth.
  let maxEnd = $state(formatNumber(logbook.prefs.bestMixEndMm / mmPerUnit, feet ? 0 : 1));
  let result = $state(/** @type {import('../lib/gas-calculator.js').GasResult|null} */ (null));
  /** The advised mix itself: its MOD, END and ppO2 at the planned depth. */
  let mix = $state(/** @type {import('../lib/gas-calculator.js').GasResult|null} */ (null));

  const depthValue = $derived(parseDecimal(depth));
  const depthInvalid = $derived(!(depthValue > 0 && depthValue < (feet ? 1000 : 300)));
  const endValue = $derived(parseDecimal(maxEnd));
  const endInvalid = $derived(!(endValue >= 0 && endValue < (feet ? 1000 : 300)));
  const salinity = $derived(salinityOfWaterType(water));

  $effect(() => {
    Object.assign(saved, { po2: Number(po2), depth, water, mode });
    if (depthInvalid || (trimix && endInvalid)) {
      result = mix = null;
      return;
    }
    try {
      const endMm = trimix ? Math.round(endValue * mmPerUnit) : -1;
      const depthMm = Math.round(depthValue * mmPerUnit);
      // The gas only matters for the MOD, which is not shown from this call: air.
      result = gasCalculator(210, 0, Number(po2), depthMm, logbook.prefs, endMm, salinity);
      mix = gasCalculator(result.bestO2, trimix ? result.bestHe : 0, Number(po2), depthMm, logbook.prefs, endMm, salinity);
    } catch (e) {
      console.error('Best mix', e);
      result = mix = null;
    }
  });

  /** @param {number} mm */
  const wholeDepth = (mm) => `${formatNumber(mm / mmPerUnit, 0)} ${depthUnit(logbook.prefs)}`;
  const depthText = $derived(`${formatNumber(depthValue, 0)} ${depthUnit(logbook.prefs)}`);

  const o2Text = $derived(result ? formatNumber(result.bestO2 / 10, 0) : '');
  const heText = $derived(result ? formatNumber(result.bestHe / 10, 0) : '');
  const bigName = $derived(result ? (trimix ? `${o2Text}/${heText}` : `EAN${o2Text}`) : '—');
  const po2Here = $derived(result ? po2AtDepth(result.bestO2, Math.round(depthValue * mmPerUnit), salinity) : 0);
  const over = $derived(!!mix && po2Here > Number(po2) + 5);
  const po2Options = po2Choices().map((mbar) => ({ value: String(mbar), label: formatPartialPressure(mbar / 1000, 1) }));
  const waterOptions = WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) }));
  const note = $derived(t(trimix ? (logbook.prefs.o2narcotic ? 'tools.bestMixNoteNarcotic' : 'tools.bestMixNoteNotNarcotic') : 'tools.bestMixNoteNitrox'));
</script>

<div class="od-desktop-best-mix">
  <div class="od-desktop-best-mix--inputs">
    <DesktopSegments ariaLabel={t('tools.blendMode')} value={mode} options={[{ value: 'nitrox', label: t('tools.nitrox') }, { value: 'trimix', label: t('tools.trimix') }]} onchange={(v) => (mode = /** @type {any} */ (v))} />
    <div class="od-desktop-best-mix--fields">
      <DesktopField label={t('tools.depth')} bind:value={depth} unit={depthUnit(logbook.prefs)} invalid={depthInvalid} helper={depthInvalid ? t('tools.depthInvalid') : ''} />
      <DesktopField label={t('tools.waterType')} bind:value={water} options={waterOptions} />
      <DesktopField label={t('tools.maxPo2')} bind:value={po2} options={po2Options} />
      {#if trimix}
        <DesktopField label={t('tools.maxEnd')} bind:value={maxEnd} unit={depthUnit(logbook.prefs)} invalid={endInvalid} helper={endInvalid ? t('tools.depthInvalid') : t('tools.maxEndHelp')} />
      {/if}
    </div>
  </div>

  <div class="od-desktop-best-mix--results">
    <h3 class="od-desktop-best-mix--heading">{t('tools.bestMixResults')}</h3>
    <div class="od-desktop-best-mix--advised" aria-live="polite">
      <span class="od-desktop-best-mix--name od-value">{bigName}</span>
      <span class="od-desktop-best-mix--kind">
        <span class="od-desktop-best-mix--title">{t(trimix ? 'tools.trimix' : 'tools.nitrox')}</span>
        {#if result}<span class="od-desktop-best-mix--sub">{t(trimix ? 'tools.trimixSub' : 'tools.nitroxSub', { o2: o2Text, he: heText })}</span>{/if}
      </span>
      <button type="button" class="od-desktop-best-mix--prepare" disabled={!result} onclick={() => result && prepareBlend(result.bestO2, trimix ? result.bestHe : 0)}>
        <Icon name="blender" size={20} />{t('desktopTools.prepareMix')}
      </button>
    </div>
    <div class="od-desktop-best-mix--cards">
      <DesktopResultCard label={t('tools.mod')} value={mix ? wholeDepth(mix.modMm) : '—'} text={mix ? t('desktopTools.atPo2', { po2: formatPartialPressure(Number(po2) / 1000, 1) }) : ''} />
      <DesktopResultCard label={t('desktopTools.endAt', { depth: depthText })} value={mix ? wholeDepth(mix.endPlannedMm) : '—'} text={mix ? t(mix.o2Narcotic ? 'desktopTools.o2Narcotic' : 'desktopTools.o2NotNarcotic') : ''} />
      <DesktopResultCard label={t('desktopTools.po2At', { depth: depthText })} value={mix ? formatPartialPressure(po2Here / 1000, 2) : '—'} text={mix ? t(over ? 'desktopTools.overLimit' : 'desktopTools.underLimit') : ''} alarm={over} />
    </div>
    <p class="od-desktop-best-mix--note">{note}</p>
  </div>
</div>

<style>
  @layer od.components {
    .od-desktop-best-mix {
      display: grid;
      grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
      gap: 32px;
      align-items: start;
    }
    /* Fluid layout: in a narrow pane the results go under the inputs. */
    @container od-tool (max-width: 799px) {
      .od-desktop-best-mix {
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
      }
    }
    .od-desktop-best-mix--inputs {
      display: flex;
      flex-direction: column;
      gap: 20px;
      align-items: flex-start;
    }
    .od-desktop-best-mix--fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: start;
      align-self: stretch;
    }
    .od-desktop-best-mix--heading {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 500;
      color: var(--od-text);
    }
    .od-desktop-best-mix--advised {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 20px;
      padding: 20px 24px;
      border-radius: 16px;
      background: var(--od-surface);
    }
    .od-desktop-best-mix--name {
      font-family: var(--od-title-font);
      font-size: 44px;
      font-weight: 500;
      line-height: 1;
      color: var(--od-desktop-selected-ink);
      white-space: nowrap;
    }
    .od-desktop-best-mix--kind {
      flex: 1 1 140px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .od-desktop-best-mix--title {
      font-size: 17px;
      font-weight: 500;
      color: var(--od-text);
    }
    .od-desktop-best-mix--sub {
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-desktop-best-mix--prepare {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 40px;
      padding: 0 20px;
      border: 1px solid var(--od-text-2);
      border-radius: 20px;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--od-text);
      cursor: pointer;
      white-space: nowrap;
    }
    .od-desktop-best-mix--prepare:hover:not(:disabled) {
      background: color-mix(in srgb, var(--od-text) 8%, transparent);
    }
    .od-desktop-best-mix--prepare:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .od-desktop-best-mix--cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .od-desktop-best-mix--note {
      margin: 12px 0 0;
      font-size: 12px;
      color: var(--od-text-2);
    }
  }
</style>
