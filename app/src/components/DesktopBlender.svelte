<script>
  // @ts-check
  // Mélangeur de gaz on the desktop (tasks 2026-11-15-196, 198, 199, 201; mock-up
  // bureau-outils-melangeur): the target, the cylinder and what it holds on the left; on the right
  // the fill order with a cylinder drawn in layers and the numbered steps. The calculation is the
  // phone's (GasBlender.svelte): lib/gas-blend.js with the same arguments. The state is kept in
  // lib/desktop-tools.svelte.js so that « Préparer ce mélange » can set the target.
  import { cachedCylinderTypes } from '../lib/core-cache.js';
  import DesktopField from './DesktopField.svelte';
  import DesktopSegments from './DesktopSegments.svelte';
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatGasVolume, formatNumber, locale } from '../lib/format.js';
  import { parseDecimal } from '../lib/tools.js';
  import { gasBlend } from '../lib/gas-blend.js';
  import { aboveWorkingPressure, cylinderLayers, followCylinder, suggestedFinalPressure } from '../lib/desktop-tools.js';
  import { desktopTools, setBlenderMode, setBlenderOrder } from '../lib/desktop-tools.svelte.js';
  import { t } from '../lib/i18n.js';

  const b = desktopTools.blender;
  const prefs = logbook.prefs;
  const psi = prefs.pressure === 'psi';
  const MBAR_PER_UNIT = psi ? 68.947572932 : 1000;
  const pressureUnit = t(psi ? 'units.psi' : 'units.bar');
  const trimix = $derived(b.mode === 'trimix');
  const oxygenFirst = $derived(trimix && b.order === 'oxygen');

  /** @type {{ name: string, ml: number, workingPressureMbar: number }[]} */
  let cylinders = $state([]);
  let result = $state(/** @type {import('../lib/gas-blend.js').GasBlend|null} */ (null));

  // Read again when the logbook changes: its cylinders are part of the list.
  $effect(() => {
    if (logbook.loading) return;
    cachedCylinderTypes()
      .then((/** @type {import('benthic-core').GasCylinderTypes} */ list) => {
        cylinders = list.types.filter((c) => c.ml > 0);
        const names = cylinders.map((c) => c.name);
        if (!b.cylinder || !names.includes(b.cylinder)) {
          b.cylinder = names.includes(list.default) ? list.default : names.includes('AL80') ? 'AL80' : (names[0] ?? '');
        }
      })
      .catch((e) => console.error('Cylinder types', e));
  });

  const cylinderType = $derived(cylinders.find((c) => c.name === b.cylinder));
  const cylinderMl = $derived(cylinderType?.ml ?? 0);
  /** The cylinder's working pressure in the display unit: what the final pressure follows. */
  const working = $derived(suggestedFinalPressure(cylinderType?.workingPressureMbar ?? 0, MBAR_PER_UNIT));

  // « Pression finale désirée » follows the cylinder until the diver types a value of his own.
  $effect(() => {
    const next = working;
    if (!next && b.finalPressure.trim() !== '') return;
    const shown = followCylinder(b.finalPressure, b.suggested, next || (psi ? '3000' : '200'));
    b.finalPressure = shown;
    b.suggested = next || (psi ? '3000' : '200');
  });

  /** @param {string} text */
  const percent = (text) => (/^\s*\d{1,3}([.,]\d)?\s*$/.test(text) ? Number(text.replace(',', '.')) : NaN);

  const o2Value = $derived(percent(b.o2));
  const heValue = $derived(trimix ? (b.he.trim() === '' ? 0 : percent(b.he)) : 0);
  const wantedInvalid = $derived(!(o2Value >= 1 && o2Value <= 100 && heValue >= 0 && o2Value + heValue <= 100));
  const finalValue = $derived(parseDecimal(b.finalPressure));
  const finalInvalid = $derived(!(finalValue > 0 && finalValue * MBAR_PER_UNIT <= 500000));
  const aboveWorking = $derived(!finalInvalid && aboveWorkingPressure(finalValue, working));
  const insideValue = $derived(b.insidePressure.trim() === '' ? 0 : parseDecimal(b.insidePressure));
  const insideInvalid = $derived(!(insideValue >= 0 && insideValue * MBAR_PER_UNIT <= 500000));
  const insideO2Value = $derived(insideValue > 0 ? percent(b.insideO2) : 21);
  const insideHeValue = $derived(insideValue > 0 && trimix ? (b.insideHe.trim() === '' ? 0 : percent(b.insideHe)) : 0);
  const insideMixInvalid = $derived(insideValue > 0 && !(insideO2Value >= 0 && insideHeValue >= 0 && insideO2Value + insideHeValue <= 100));
  const topUpO2Value = $derived(b.topUp === 'air' ? 21 : percent(b.topUpO2));
  const topUpInvalid = $derived(!(topUpO2Value >= 1 && topUpO2Value <= 99));
  const invalid = $derived(wantedInvalid || finalInvalid || insideInvalid || insideMixInvalid || topUpInvalid || cylinderMl <= 0);

  $effect(() => {
    oxygenFirst;
    if (invalid) {
      result = null;
      return;
    }
    try {
      result = gasBlend(
        Math.round(o2Value * 10),
        Math.round(heValue * 10),
        Math.round(finalValue * MBAR_PER_UNIT),
        cylinderMl,
        Math.round(insideValue * MBAR_PER_UNIT),
        Math.round(insideO2Value * 10),
        Math.round(insideHeValue * 10),
        Math.round(topUpO2Value * 10),
        oxygenFirst,
      );
    } catch (e) {
      console.error('Gas blender', e);
      result = null;
    }
  });

  /** @param {number} mbar */
  const pressureText = (mbar) => `${formatNumber(mbar / MBAR_PER_UNIT, 0)} ${pressureUnit}`;

  /** The name of a gas of the fill. @param {'he'|'o2'|'topup'} gas */
  const gasName = (gas) =>
    gas === 'he' ? t('tools.helium') : gas === 'o2' ? t('tools.oxygen') : b.topUp === 'air' ? t('tools.blendAir') : t('tools.blendNitrox', { o2: formatNumber(topUpO2Value, 0) });

  /** The fill, in order, without the steps that add nothing at the display precision. */
  const steps = $derived.by(() => {
    if (!result) return [];
    return result.steps
      .filter((s) => Math.round(s.addedMbar / MBAR_PER_UNIT) > 0)
      .map((s) => ({
        gas: s.gas,
        name: gasName(s.gas),
        added:
          s.gas === 'topup'
            ? t('tools.blendAddedOnly', { pressure: pressureText(s.addedMbar) })
            : t('tools.blendAdded', { pressure: pressureText(s.addedMbar), volume: formatGasVolume(s.volumeMl, prefs) }),
        upTo: t('tools.blendUpTo', { pressure: pressureText(s.toMbar) }),
      }));
  });

  const bleedText = $derived(result?.bleedToMbar ? `${formatNumber(Math.floor(result.bleedToMbar / MBAR_PER_UNIT), 0)} ${pressureUnit}` : '');

  /** The cylinder's layers (task 199): no layer for what was in it, the residual counted in each gas. */
  const layers = $derived(
    result && !result.error
      ? cylinderLayers(result, {
          finalMbar: Math.round(finalValue * MBAR_PER_UNIT),
          residualO2: insideO2Value / 100,
          residualHe: insideHeValue / 100,
          trimix,
          oxygenFirst,
        })
      : [],
  );
  const drawingLabel = $derived(
    layers.length
      ? t('desktopTools.cylinderLabel', {
          pressure: pressureText(finalValue * MBAR_PER_UNIT),
          gases: new Intl.ListFormat(locale, { type: 'conjunction' }).format(layers.map((l) => gasName(l.gas).toLowerCase())),
        })
      : '',
  );

  // The cylinder interior of the drawing, in its own units (viewBox 0 0 120 270).
  const BODY_TOP = 30;
  const BODY_BOTTOM = 262;
  /** @type {Record<string, string>} */
  const LAYER_FILL = { he: 'var(--bc-gas-helium)', o2: 'var(--bc-gas-oxygen)', topup: 'var(--bc-gas-topup)' };
  const drawn = $derived.by(() => {
    const total = layers.reduce((s, l) => s + l.mbar, 0) || 1;
    let y = BODY_BOTTOM;
    return layers.map((l) => {
      const h = ((BODY_BOTTOM - BODY_TOP) * l.mbar) / total;
      y -= h;
      return { gas: l.gas, y, h };
    });
  });

  /** One label per cylinder type: its size and working pressure; the name only when two read alike. */
  const cylinderOptions = $derived.by(() => {
    const labels = cylinders.map((c) => {
      const size = [formatNumber(c.ml / 1000, 1), t('units.liters')].join(' ');
      return c.workingPressureMbar > 0 ? `${size} · ${pressureText(c.workingPressureMbar)}` : size;
    });
    return cylinders.map((c, i) => ({ value: c.name, label: labels.filter((l) => l === labels[i]).length > 1 ? `${c.name} · ${labels[i]}` : labels[i] }));
  });
  const topUpOptions = $derived([
    { value: 'air', label: t('tools.blendTopUpAir') },
    { value: 'nitrox', label: t('tools.blendTopUpNitrox') },
  ]);
  const workingText = $derived(working ? `${formatNumber(Number(working), 0)} ${pressureUnit}` : '');
</script>

<div class="bc-desktop-blender">
  <div class="bc-desktop-blender--inputs">
    <DesktopSegments
      ariaLabel={t('tools.blendMode')}
      value={b.mode}
      options={[{ value: 'nitrox', label: t('tools.nitrox') }, { value: 'trimix', label: t('tools.trimix') }]}
      onchange={(v) => setBlenderMode(/** @type {any} */ (v))}
    />

    <h3 class="bc-desktop-blender--label">{t('tools.blendWanted')}</h3>
    <div class="bc-desktop-blender--pair">
      <DesktopField label={t('tools.oxygen')} bind:value={b.o2} unit={t('units.percent')} invalid={wantedInvalid} helper={wantedInvalid ? t('tools.gasInvalid') : ''} />
      {#if trimix}<DesktopField label={t('tools.helium')} bind:value={b.he} unit={t('units.percent')} invalid={wantedInvalid} />{/if}
    </div>
    <div class="bc-desktop-blender--pair">
      <DesktopField label={t('tools.blendCylinder')} bind:value={b.cylinder} options={cylinderOptions} />
      <DesktopField
        label={t('desktopTools.finalPressure')}
        bind:value={b.finalPressure}
        unit={pressureUnit}
        invalid={finalInvalid}
        warning={aboveWorking}
        helper={aboveWorking ? t('desktopTools.aboveWorking', { pressure: workingText }) : workingText ? t('desktopTools.workingPressure', { pressure: workingText }) : ''}
      />
    </div>

    <h3 class="bc-desktop-blender--label">{t('tools.blendInside')}</h3>
    <div class="bc-desktop-blender--pair">
      <DesktopField
        label={t('tools.blendInsidePressure')}
        bind:value={b.insidePressure}
        unit={pressureUnit}
        invalid={insideInvalid}
        helper={insideInvalid ? t('tools.blendInvalid') : t('tools.blendInsideHelp')}
      />
    </div>
    <div class="bc-desktop-blender--pair">
      <DesktopField label={t('tools.oxygen')} bind:value={b.insideO2} unit={t('units.percent')} invalid={insideMixInvalid} />
      {#if trimix}<DesktopField label={t('tools.helium')} bind:value={b.insideHe} unit={t('units.percent')} invalid={insideMixInvalid} />{/if}
    </div>
    <div class="bc-desktop-blender--pair">
      <DesktopField label={t('tools.blendTopUp')} bind:value={b.topUp} options={topUpOptions} />
      {#if b.topUp === 'nitrox'}<DesktopField label={t('tools.blendTopUpOxygen')} bind:value={b.topUpO2} unit={t('units.percent')} invalid={topUpInvalid} />{/if}
    </div>
  </div>

  <div class="bc-desktop-blender--fill">
    <div class="bc-desktop-blender--fill-head">
      <h3 class="bc-desktop-blender--title">{t('tools.blendFill')}</h3>
      {#if trimix}
        <DesktopSegments
          ariaLabel={t('tools.blendOrder')}
          value={b.order}
          options={[{ value: 'helium', label: t('tools.blendOrderHelium') }, { value: 'oxygen', label: t('tools.blendOrderOxygen') }]}
          onchange={(v) => setBlenderOrder(/** @type {any} */ (v))}
        />
      {/if}
    </div>

    {#if result && result.error === 'TOPUP_TOO_RICH'}
      <p class="bc-desktop-blender--notice" role="alert">{t('tools.blendTooRich')}</p>
    {:else if result}
      {#if result.error === 'RESIDUAL_TOO_HIGH'}
        <div class="bc-desktop-blender--notice" role="alert">
          <strong>{t('tools.blendBleedTitle')}</strong>
          <span>{bleedText && result.bleedToMbar ? t('tools.blendBleedText', { pressure: bleedText }) : t('tools.blendBleedEmpty')}</span>
        </div>
      {/if}
      <div class="bc-desktop-blender--card">
        <svg class="bc-desktop-blender--cylinder" viewBox="0 0 120 270" width="110" role="img" aria-label={drawingLabel}>
          <defs>
            <clipPath id="od-desktop-blender-clip"><path d="M60 26 C 98 26 104 44 104 66 L 104 236 C 104 252 98 262 84 262 L 36 262 C 22 262 16 252 16 236 L 16 66 C 16 44 22 26 60 26 Z" /></clipPath>
          </defs>
          <rect x="46" y="8" width="28" height="20" rx="4" class="bc-desktop-blender--valve" />
          <g clip-path="url(#od-desktop-blender-clip)">
            <rect x="0" y="0" width="120" height="270" class="bc-desktop-blender--empty" />
            {#each drawn as layer (layer.gas)}
              <rect x="0" y={layer.y} width="120" height={layer.h} style:fill={LAYER_FILL[layer.gas]} />
            {/each}
          </g>
          <path class="bc-desktop-blender--outline" d="M60 26 C 98 26 104 44 104 66 L 104 236 C 104 252 98 262 84 262 L 36 262 C 22 262 16 252 16 236 L 16 66 C 16 44 22 26 60 26 Z" />
        </svg>
        {#if workingText}<span class="bc-desktop-blender--working bc-value">{workingText}</span>{/if}
        <ol class="bc-desktop-blender--steps" aria-live="polite">
          {#each steps as step, i (i)}
            <li>
              <span class="bc-desktop-blender--number bc-desktop-blender--number-{step.gas}" aria-hidden="true">{i + 1}</span>
              <span class="bc-desktop-blender--texts">
                <span class="bc-desktop-blender--name">{step.name}</span>
                <span class="bc-desktop-blender--added bc-value">{step.added}</span>
              </span>
              <span class="bc-desktop-blender--upto bc-value">{step.upTo}</span>
            </li>
          {/each}
        </ol>
      </div>
    {:else if invalid}
      <p class="bc-desktop-blender--notice" role="alert">{t('tools.blendInvalid')}</p>
    {/if}

    <p class="bc-desktop-blender--caption">{t('tools.blendCooled')} {t('tools.blendOxygenClean')}</p>
    <div class="bc-desktop-blender--banner" role="note"><Icon name="warning" size={20} />{t('tools.blendAnalyse')}</div>
  </div>
</div>

<style>
  @layer od.components {
    .bc-desktop-blender {
      display: grid;
      grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
      gap: 32px;
      align-items: start;
    }
    /* Fluid layout: in a narrow pane the results go under the inputs. */
    @container od-tool (max-width: 799px) {
      .bc-desktop-blender {
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
      }
    }
    .bc-desktop-blender--inputs {
      display: flex;
      flex-direction: column;
      gap: 14px;
      align-items: stretch;

      > :global(.bc-desktop-segments) {
        align-self: flex-start;
      }
    }
    .bc-desktop-blender--label {
      margin: 6px 0 0;
      font-size: 15px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-blender--pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: start;
    }
    .bc-desktop-blender--fill {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    .bc-desktop-blender--fill-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 42px;
    }
    .bc-desktop-blender--title {
      margin: 0;
      font-size: 15px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-blender--card {
      position: relative;
      display: flex;
      align-items: center;
      gap: 32px;
      padding: 20px 24px;
      border-radius: 16px;
      background: var(--bc-surface);
    }
    .bc-desktop-blender--cylinder {
      flex: none;
    }
    .bc-desktop-blender--valve {
      fill: var(--bc-text-2);
    }
    .bc-desktop-blender--empty {
      fill: var(--bc-desktop-field);
    }
    .bc-desktop-blender--outline {
      fill: none;
      stroke: var(--bc-text-2);
      stroke-width: 2;
    }
    .bc-desktop-blender--working {
      position: absolute;
      top: 28px;
      left: 140px;
      font-size: 12px;
      color: var(--bc-text-2);
    }
    .bc-desktop-blender--steps {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 0;
      list-style: none;
      & li {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-top: 1px solid var(--bc-separator);

        &:first-child {
          border-top: 0;
        }
      }
    }
    .bc-desktop-blender--number {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-size: 15px;
      font-weight: 600;
      color: #fff;
    }
    .bc-desktop-blender--number-he {
      background: var(--bc-gas-helium);
    }
    .bc-desktop-blender--number-o2 {
      background: var(--bc-gas-oxygen);
    }
    .bc-desktop-blender--number-topup {
      background: var(--bc-gas-topup-badge);
    }
    .bc-desktop-blender--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .bc-desktop-blender--name {
      font-size: 17px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-blender--added {
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-desktop-blender--upto {
      font-size: 14px;
      color: var(--bc-text-2);
      text-align: right;
      min-width: 110px;
    }
    .bc-desktop-blender--notice {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--bc-alarm-tint);
      font-size: 14px;
      color: var(--bc-text);
    }
    .bc-desktop-blender--caption {
      margin: 0;
      font-size: 12px;
      color: var(--bc-text-2);
    }
    .bc-desktop-blender--banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 12px;
      background: var(--bc-desktop-banner);
      font-size: 15px;
      color: var(--bc-desktop-banner-ink);
    }
  }
</style>
