<script module>
  // Kept while the app runs, so that the tool shows the last values again.
  const MODE_KEY = 'bc.blenderMode';
  const saved = {
    o2: '32',
    he: '35',
    finalPressure: '',
    // The value the cylinder put in the final pressure (kept to tell it from a typed one).
    autoFinal: '',
    cylinder: '',
    insidePressure: '',
    insideO2: '21',
    insideHe: '0',
    topUp: 'air',
    topUpO2: '32',
  };
</script>

<script>
  // @ts-check
  import { untrack } from 'svelte';
  import { deviceStore } from '../lib/device-store.js';
  import { takeBlend } from '../lib/gas-handoff.js';
  // Gas blender (docs/ui-specification.md, section 1, "Tools page and gas
  // tools"; docs/mockups/outils-melangeur-android.dc.html, outils-melangeur-
  // nitrox-android.dc.html): partial pressure blending of nitrox and trimix.
  // Everything is computed by lib/gas-blend.js with the real-gas
  // compressibility; this screen only turns the
  // units and writes the fill in order. Nitrox mode hides the helium fields and
  // the helium step. Nitrox by default; the last mode chosen is remembered on
  // the device.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import TextField from '../components/TextField.svelte';
  import SelectField from '../components/SelectField.svelte';
  import ButtonGroup from '../components/ButtonGroup.svelte';
  import Icon from '../components/Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatCylinderSize, formatGasVolume, formatNumber } from '../lib/format.js';
  import { parseDecimal } from '../lib/tools.js';
  import { gasBlend } from '../lib/gas-blend.js';
  import { followCylinder, aboveWorkingPressure } from '../lib/gas-blender-form.js';
  import { t } from '../lib/i18n.js';

  const prefs = logbook.prefs;
  const psi = prefs.pressure === 'psi';
  const MBAR_PER_UNIT = psi ? 68.947572932 : 1000;
  const pressureUnit = t(psi ? 'units.psi' : 'units.bar');

  const MODES = /** @type {const} */ (['nitrox', 'trimix']);
  const ORDERS = /** @type {const} */ (['helium', 'oxygen']);

  /** @returns {'nitrox'|'trimix'} */
  function readMode() {
    try {
      return deviceStore.getItem(MODE_KEY) === 'trimix' ? 'trimix' : 'nitrox';
    } catch {
      return 'nitrox';
    }
  }
  // "Prepare this mix" of Best mix: the mode and the wanted mix, once.
  const handoff = takeBlend();
  let mode = $state(handoff?.mode ?? readMode());
  /** @param {'nitrox'|'trimix'} next */
  function setMode(next) {
    mode = next;
    try {
      deviceStore.setItem(MODE_KEY, next);
    } catch {
      // The mode is only a convenience.
    }
  }
  const trimix = $derived(mode === 'trimix');

  const ORDER_KEY = 'bc.blenderOrder';
  /** @returns {'helium'|'oxygen'} */
  function readOrder() {
    try {
      return deviceStore.getItem(ORDER_KEY) === 'oxygen' ? 'oxygen' : 'helium';
    } catch {
      return 'helium';
    }
  }
  let order = $state(readOrder());
  /** @param {'helium'|'oxygen'} next */
  function setOrder(next) {
    order = next;
    try {
      deviceStore.setItem(ORDER_KEY, next);
    } catch {
      // The order is only a convenience.
    }
  }
  const oxygenFirst = $derived(trimix && order === 'oxygen');

  let o2 = $state(handoff ? String(handoff.o2 / 10) : saved.o2);
  let he = $state(handoff && handoff.mode === 'trimix' ? String(handoff.he / 10) : saved.he);
  // Starts at the working pressure of the cylinder (see the effect below).
  let finalPressure = $state(saved.finalPressure);
  let cylinder = $state(saved.cylinder);
  let insidePressure = $state(saved.insidePressure);
  let insideO2 = $state(saved.insideO2);
  let insideHe = $state(saved.insideHe);
  let topUp = $state(saved.topUp);
  let topUpO2 = $state(saved.topUpO2);
  /** @type {{ name: string, ml: number, workingPressureMbar: number }[]} */
  let cylinders = $state([]);
  let result = $state(/** @type {import('../lib/gas-blend.js').GasBlend|null} */ (null));

  // Read again when the logbook changes: its cylinders are part of the list.
  $effect(() => {
    if (logbook.loading) return;
    BenthicCore.toolQuery({ kind: 'cylinders' })
      .then((/** @type {import('benthic-core').GasCylinderTypes} */ list) => {
        cylinders = list.types.filter((c) => c.ml > 0);
        const names = cylinders.map((c) => c.name);
        if (!cylinder || !names.includes(cylinder)) {
          cylinder = names.includes(list.default) ? list.default : names.includes('AL80') ? 'AL80' : (names[0] ?? '');
        }
      })
      .catch((e) => console.error('Cylinder types', e));
  });

  /** @param {string} text */
  const percent = (text) => (/^\s*\d{1,3}(\.\d)?\s*$/.test(text.replace(',', '.')) ? Number(text.replace(',', '.')) : NaN);

  const o2Value = $derived(percent(o2));
  const heValue = $derived(trimix ? (he.trim() === '' ? 0 : percent(he)) : 0);
  const wantedInvalid = $derived(!(o2Value >= 1 && o2Value <= 100 && heValue >= 0 && o2Value + heValue <= 100));
  const finalValue = $derived(parseDecimal(finalPressure));
  const finalInvalid = $derived(!(finalValue > 0 && finalValue * MBAR_PER_UNIT <= 500000));
  const insideValue = $derived(insidePressure.trim() === '' ? 0 : parseDecimal(insidePressure));
  const insideInvalid = $derived(!(insideValue >= 0 && insideValue * MBAR_PER_UNIT <= 500000));
  const insideO2Value = $derived(insideValue > 0 ? percent(insideO2) : 21);
  const insideHeValue = $derived(insideValue > 0 && trimix ? (insideHe.trim() === '' ? 0 : percent(insideHe)) : 0);
  const insideMixInvalid = $derived(insideValue > 0 && !(insideO2Value >= 0 && insideHeValue >= 0 && insideO2Value + insideHeValue <= 100));
  const topUpO2Value = $derived(topUp === 'air' ? 21 : percent(topUpO2));
  const topUpInvalid = $derived(!(topUpO2Value >= 1 && topUpO2Value <= 99));
  const cylinderMl = $derived(cylinders.find((c) => c.name === cylinder)?.ml ?? 0);
  const invalid = $derived(wantedInvalid || finalInvalid || insideInvalid || insideMixInvalid || topUpInvalid || cylinderMl <= 0);

  /** Working pressure of the chosen cylinder, in mbar (0 when unknown). */
  const workingMbar = $derived(cylinders.find((c) => c.name === cylinder)?.workingPressureMbar ?? 0);
  const workingText = $derived(workingMbar > 0 ? pressureText(workingMbar) : '');
  const aboveWorking = $derived(!finalInvalid && aboveWorkingPressure(Math.round(finalValue * MBAR_PER_UNIT), workingMbar));

  // The final pressure follows the cylinder's working pressure until the diver types a value;
  // a typed value stays when the cylinder changes.
  $effect(() => {
    const wm = workingMbar;
    untrack(() => {
      const next = followCylinder({ current: finalPressure, lastAuto: saved.autoFinal, workingMbar: wm, mbarPerUnit: MBAR_PER_UNIT, fallback: psi ? '3000' : '200' });
      finalPressure = next.value;
      saved.autoFinal = next.auto;
    });
  });

  $effect(() => {
    Object.assign(saved, { o2, he, finalPressure, cylinder, insidePressure, insideO2, insideHe, topUp, topUpO2 });
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

  /** The fill, in order, without the steps that add nothing at the display precision. */
  const steps = $derived.by(() => {
    if (!result) return [];
    return result.steps
      .filter((s) => Math.round(s.addedMbar / MBAR_PER_UNIT) > 0)
      .map((s) => ({
        name:
          s.gas === 'he'
            ? t('tools.helium')
            : s.gas === 'o2'
              ? t('tools.oxygen')
              : topUp === 'air'
                ? t('tools.blendAir')
                : t('tools.blendNitrox', { o2: formatNumber(topUpO2Value, 0) }),
        added:
          s.gas === 'topup'
            ? t('tools.blendAddedOnly', { pressure: pressureText(s.addedMbar) })
            : t('tools.blendAdded', { pressure: pressureText(s.addedMbar), volume: formatGasVolume(s.volumeMl, prefs) }),
        upTo: t('tools.blendUpTo', { pressure: pressureText(s.toMbar) }),
      }));
  });

  /** Bleed pressure, rounded down at the display precision. */
  const bleedText = $derived(
    result?.bleedToMbar ? `${formatNumber(Math.floor(result.bleedToMbar / MBAR_PER_UNIT), 0)} ${pressureUnit}` : '',
  );

  const cylinderOptions = $derived(
    cylinders.map((c) => ({ value: c.name, label: [c.name, formatCylinderSize(c.ml, c.workingPressureMbar, prefs)].filter(Boolean).join(', ') })),
  );
  const topUpOptions = $derived([
    { value: 'air', label: t('tools.blendTopUpAir') },
    { value: 'nitrox', label: t('tools.blendTopUpNitrox') },
  ]);
  /** 0 to 100 %, for the oxygen and helium left in the cylinder (any combination). */
  const percentOptions = Array.from({ length: 101 }, (_, i) => ({ value: String(i), label: `${i} ${t('units.percent')}` }));
  /** Oxygen left in a nitrox cylinder, one mix: "EAN32". */
  const nitroxOptions = Array.from({ length: 101 }, (_, i) => ({ value: String(i), label: i === 0 ? `0 ${t('units.percent')}` : `EAN${i}` }));
</script>

<Page class="bc-gas-blender">
  <Navbar title={t('tools.blender')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="bc-sr-only">{t('common.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="bc-gas-blender--modes">
    <ButtonGroup ariaLabel={t('tools.blendMode')} value={mode} options={MODES.map((choice) => ({ value: choice, label: t(`tools.${choice}`) }))} onchange={(choice) => setMode(/** @type {any} */ (choice))} />
  </div>

  <h2 class="bc-gas-blender--label">{t('tools.blendWanted')}</h2>
  <div class="bc-gas-blender--pair">
    <TextField label={t('tools.oxygen')} bind:value={o2} inputmode="decimal" invalid={wantedInvalid} supporting={wantedInvalid ? t('tools.gasInvalid') : ''}>
      {#snippet trailing()}<span class="bc-gas-blender--unit">{t('units.percent')}</span>{/snippet}
    </TextField>
    {#if trimix}
      <TextField label={t('tools.helium')} bind:value={he} inputmode="decimal" invalid={wantedInvalid}>
        {#snippet trailing()}<span class="bc-gas-blender--unit">{t('units.percent')}</span>{/snippet}
      </TextField>
    {:else}
      <SelectField label={t('tools.blendCylinder')} bind:value={cylinder} options={cylinderOptions} />
    {/if}
  </div>
  <div class="bc-gas-blender--pair">
    {#if trimix}
      <SelectField label={t('tools.blendCylinder')} bind:value={cylinder} options={cylinderOptions} />
    {/if}
    <TextField
      label={t('tools.blendFinalPressure')}
      bind:value={finalPressure}
      inputmode="decimal"
      invalid={finalInvalid}
      warning={aboveWorking}
      supporting={aboveWorking ? t('tools.blendAboveWorking', { pressure: workingText }) : workingText ? t('tools.blendWorking', { pressure: workingText }) : ''}
    >
      {#snippet trailing()}<span class="bc-gas-blender--unit">{pressureUnit}</span>{/snippet}
    </TextField>
  </div>

  <h2 class="bc-gas-blender--label">{t('tools.blendInside')}</h2>
  <div class="bc-gas-blender--pair">
    <TextField
      label={t('tools.blendInsidePressure')}
      bind:value={insidePressure}
      inputmode="decimal"
      invalid={insideInvalid}
      supporting={insideInvalid ? t('tools.blendInvalid') : t('tools.blendInsideHelp')}
    >
      {#snippet trailing()}<span class="bc-gas-blender--unit">{pressureUnit}</span>{/snippet}
    </TextField>
    {#if !trimix}
      <SelectField label={t('tools.blendInsideMix')} bind:value={insideO2} options={nitroxOptions} />
    {/if}
  </div>
  {#if trimix}
    <div class="bc-gas-blender--pair">
      <SelectField label={t('tools.blendInsideOxygen')} bind:value={insideO2} options={percentOptions} />
      <SelectField label={t('tools.blendInsideHelium')} bind:value={insideHe} options={percentOptions} />
    </div>
  {/if}
  <SelectField label={t('tools.blendTopUp')} bind:value={topUp} options={topUpOptions} />
  {#if topUp === 'nitrox'}
    <TextField label={t('tools.blendTopUpOxygen')} bind:value={topUpO2} inputmode="decimal" invalid={topUpInvalid}>
      {#snippet trailing()}<span class="bc-gas-blender--unit">{t('units.percent')}</span>{/snippet}
    </TextField>
  {/if}

  {#if result}
    {#if result.error === 'TOPUP_TOO_RICH'}
      <p class="bc-gas-blender--notice" role="alert">{t('tools.blendTooRich')}</p>
    {:else}
      {#if result.error === 'RESIDUAL_TOO_HIGH'}
        <div class="bc-gas-blender--notice" role="alert">
          <strong>{t('tools.blendBleedTitle')}</strong>
          <span>{bleedText && result.bleedToMbar ? t('tools.blendBleedText', { pressure: bleedText }) : t('tools.blendBleedEmpty')}</span>
        </div>
      {/if}
      <h2 class="bc-gas-blender--title">{t('tools.blendFill')}</h2>
      {#if trimix}
        <div class="bc-gas-blender--modes bc-gas-blender--order">
          <ButtonGroup ariaLabel={t('tools.blendOrder')} value={order} options={ORDERS.map((choice) => ({ value: choice, label: t(choice === 'helium' ? 'tools.blendOrderHelium' : 'tools.blendOrderOxygen') }))} onchange={(choice) => setOrder(/** @type {any} */ (choice))} />
        </div>
      {/if}
      <ol class="bc-gas-blender--steps" aria-live="polite">
        {#each steps as step, i (i)}
          <li>
            <span class="bc-gas-blender--number" aria-hidden="true">{i + 1}</span>
            <span class="bc-gas-blender--texts">
              <span class="bc-gas-blender--name">{step.name}</span>
              <span class="bc-gas-blender--sub bc-value">{step.added}</span>
            </span>
            <span class="bc-gas-blender--upto bc-value">{step.upTo}</span>
          </li>
        {/each}
      </ol>
    {/if}
  {:else if invalid}
    <p class="bc-gas-blender--notice" role="alert">{t('tools.blendInvalid')}</p>
  {/if}

  <p class="bc-gas-blender--caption">{t('tools.blendCooled')} {t('tools.blendOxygenClean')}</p>
  <p class="bc-gas-blender--analyse">
    <Icon name="warning" size={20} />
    <span>{t('tools.blendAnalyse')}</span>
  </p>
  <div class="bc-gas-blender--bottom"></div>
</Page>

<style>
  @layer bc.components {
    .bc-gas-blender--modes {
      margin: 8px 16px 0;
    }

    .bc-gas-blender--order {
      margin-top: 12px;
    }

    .bc-gas-blender--title {
      margin: 0;
      padding: 20px 20px 0;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    /* "Mélange voulu", "Dans la bouteille": small labels above the fields. */
    .bc-gas-blender--label {
      margin: 0;
      padding: 16px 20px 0;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: var(--bc-text);
    }

    .bc-gas-blender--pair {
      display: flex;
      gap: 12px;
      margin: 0 16px;
      align-items: flex-start;

      :global(.bc-text-field--field),
      :global(.bc-select-field--field) {
        flex: 1;
        min-width: 0;
        margin-left: 0;
        margin-right: 0;
      }
    }

    .bc-gas-blender--unit {
      display: block;
      padding: 24px 8px 0 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);

      :global(.bc-text-field--field:not(.bc-text-field--floated)) & {
        visibility: hidden;
      }
    }

    .bc-gas-blender--notice {
      margin: 20px 16px 0;
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid var(--bc-alarm);
      color: var(--bc-alarm);
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 14px;
      line-height: 20px;
    }

    .bc-gas-blender--steps {
      list-style: none;
      margin: 8px 16px 0;
      padding: 0;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;

      li {
        display: flex;
        align-items: center;
        gap: 16px;
        min-height: 64px;
        padding: 8px 20px 8px 16px;
        box-sizing: border-box;
      }
    }

    .bc-gas-blender--number {
      flex: none;
      width: 28px;
      height: 28px;
      border-radius: 14px;
      background: var(--bc-surface-2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
    }

    .bc-gas-blender--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-gas-blender--name {
      font-size: 16px;
      line-height: 24px;
    }

    .bc-gas-blender--sub {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-gas-blender--upto {
      font-size: 20px;
      font-weight: 700;
      white-space: nowrap;
    }

    .bc-gas-blender--caption {
      margin: 12px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* Amber banner: what waits for the diver (tertiary container, docs/system-design.md). */
    .bc-gas-blender--analyse {
      margin: 16px 16px 0;
      padding: 14px 16px;
      border-radius: 12px;
      background: var(--bc-tertiary-container);
      color: var(--bc-on-tertiary-container);
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      line-height: 20px;

      :global(svg) {
        flex: none;
      }
    }

    .bc-gas-blender--bottom {
      height: 32px;
    }
  }
</style>
