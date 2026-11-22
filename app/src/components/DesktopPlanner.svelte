<script>
  // @ts-check
  // Planificateur de plongée on the desktop (task 2026-11-15-196, mock-up bureau-outils and
  // bureau-outils-groupe): the parameters on the left, the totals, the planned profile and the
  // stops on the right, in the right pane of the Outils section. It is the phone's planner
  // (pages/Planner.svelte) with a new layout: the same state (lib/planner.svelte.js), the same
  // plan request to the core, the same rows (lib/plan-rows.js), the same saving and sharing.
  import { untrack } from 'svelte';
  import { BenthicCore } from 'benthic-core';
  import DesktopField from './DesktopField.svelte';
  import DesktopContextMenu from './DesktopContextMenu.svelte';
  import PlanTitleDialog from './PlanTitleDialog.svelte';
  import PlanSlate from './PlanSlate.svelte';
  import ShareSheet from './ShareSheet.svelte';
  import DesktopPlansPanel from './DesktopPlansPanel.svelte';
  import QrShare from './QrShare.svelte';
  import Icon from './Icon.svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { cleanPlanTitle } from '../lib/plan-title.js';
  import { logbook, savePlan } from '../lib/logbook.svelte.js';
  import { planner, loadSetup, adoptUnitDefaults, planRequest, startFromDive, startNewDive, requestOfPlan, applyRequest, nextGas, planSettings } from '../lib/planner.svelte.js';
  import { desktopTools } from '../lib/desktop-tools.svelte.js';
  import { GAS_PRESETS, gasChoiceValue, gasRuns, parseGradientFactors } from '../lib/desktop-tools.js';
  import { openOver } from '../lib/navigation.svelte.js';
  import { planRows } from '../lib/plan-rows.js';
  import { waterBottomColor } from '../lib/water-column.js';
  import { formatDateTime, formatDuration, formatGasVolume, formatGasLong, formatMixName, formatNumber, formatPartialPressure, depthUnit, locale } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { WATER_TYPES, formatHoursMinutes, pressureToAltitudeMm, waterTypeName, waterTypeOfSalinity } from '../lib/tools.js';
  import { sharePlanPdf, sharePlanSummary } from '../lib/share.js';
  import { planShareRows, sharePlanFile, sharePlanTableImage } from '../lib/slate-share.js';
  import { qrSummary } from '../lib/qr-send.js';
  import { parseSac, sacText } from '../lib/sac-field.js';
  import { settings } from '../lib/settings.svelte.js';
  import { MM_PER_FT, ML_PER_CUFT, depthToMm, gasTotalMl, gasValid, modAlarm, mmToDepth, roundSacMl } from '../lib/planner-rules.js';

  const prefs = $derived(logbook.prefs);
  const feet = $derived(prefs.length === 'ft');
  const cuft = $derived(prefs.volume === 'cuft');

  let result = $state(/** @type {import('benthic-core').PlanResult|null} */ (null));
  let failed = $state(false);
  let ready = $state(false);
  let started = $state(false);
  let saving = $state(false);
  let titling = $state(false);
  let sharing = $state(false);
  let slating = $state(false);
  let qrSharing = $state(false);
  let slateRequest = $state(/** @type {import('benthic-core').PlanRequest|null} */ (null));
  /** The saved plans, while the choice is open. */
  let savedPlans = $state(/** @type {import('benthic-core').PlannedDive[]|null} */ (null));
  let moreAt = $state(/** @type {{ x: number, y: number }|null} */ (null));

  /** Reads the shared settings again (they may have changed in Settings), then plans. */
  async function refresh() {
    try {
      await loadSetup();
      await adoptUnitDefaults(prefs);
      ready = true;
      planner.version++;
    } catch (e) {
      console.error('Planner setup', e);
      failed = true;
    }
  }

  /** The card of the dive a plan starts from. @param {number} id */
  async function sourceOf(id) {
    const summary = logbook.dives.find((d) => d.id === id);
    const dive = await BenthicCore.getDive({ id });
    return {
      dive,
      source: { id, number: dive.number, durationSeconds: dive.durationSeconds, date: dive.date, site: dive.site, maxDepthMm: dive.maxDepthMm, profile: summary?.profile ?? [] },
    };
  }

  /** @param {number} id */
  async function startFrom(id) {
    try {
      const { dive, source } = await sourceOf(id);
      startFromDive(dive, source, prefs);
    } catch (e) {
      console.error('Planner source', e);
      failed = true;
    }
  }

  /** @param {number} id */
  async function reopenPlan(id) {
    try {
      const plans = await BenthicCore.listPlans();
      const plan = plans.find((p) => p.id === id);
      if (!plan) throw new Error('No such plan');
      const request = requestOfPlan(plan, prefs);
      const stillThere = request.sourceDiveId && logbook.dives.some((d) => d.id === request.sourceDiveId);
      if (request.sourceDiveId && !stillThere) {
        delete request.sourceDiveId;
        request.levels = plan.levels;
      }
      const source = stillThere ? (await sourceOf(/** @type {number} */ (request.sourceDiveId))).source : null;
      applyRequest(request, id, source, plan.title ?? '');
    } catch (e) {
      console.error('Reopening a plan', e);
      failed = true;
    }
  }

  /** The start asked by the Carnet or the tools list, else the plan in progress, else a new dive. */
  async function begin() {
    await refresh();
    const start = desktopTools.plannerStart;
    desktopTools.plannerStart = null;
    if (start?.kind === 'dive') await startFrom(start.id);
    else if (start?.kind === 'plan') await reopenPlan(start.id);
    else if (start || !desktopTools.plannerStarted) {
      planner.planId = 0;
      planner.kept = null;
      startNewDive(prefs);
    }
    desktopTools.plannerStarted = true;
    started = true;
  }
  begin();

  // A start asked while the planner is already shown (« Planifier à partir de cette plongée »).
  $effect(() => {
    if (desktopTools.plannerStart && started) untrack(begin);
  });

  // The plan is computed again at each change of the dive or the settings.
  let run = 0;
  $effect(() => {
    planner.version;
    if (!ready || !started) return;
    const request = planRequest();
    const mine = ++run;
    BenthicCore.planDive(request)
      .then((r) => {
        if (mine !== run) return;
        result = r;
        failed = false;
        if (!planner.when && !planner.source) planner.when = r.when;
      })
      .catch((e) => {
        console.error('Plan', e);
        if (mine === run) failed = true;
      });
  });

  /** Whole metres or feet. @param {number} mm */
  const depthText = (mm) => `${formatNumber(mmToDepth(mm, feet), 0)} ${depthUnit(prefs)}`;
  /** Minutes rounded as Subsurface's plan table. @param {number} seconds */
  const minutes = (seconds) => `${formatNumber(Math.floor((seconds + 30) / 60), 0)} ${t('units.minutes')}`;
  /** The name of a gas: EAN32, Oxygène, (18/45). @param {number} o2 @param {number} he */
  const gasName = (o2, he) => (he === 0 && o2 >= 1000 ? formatGasLong(o2, he) : formatMixName(o2, he));

  // --- The fields: edited in place, the plan is computed again as soon as one changes. ---

  /** A number as typed back: no thousands separator. @param {number} value @param {number} decimals */
  const show = (value, decimals = 0) => new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: decimals }).format(value);
  /** "12,5" or "12.5" → 12.5; NaN when empty or not a number. @param {string} text */
  const parse = (text) => (text.trim() === '' ? NaN : Number(text.trim().replace(',', '.')));

  let levelFields = $state(/** @type {{ key: number, depth: string, time: string }[]} */ ([]));
  let gasFields = $state(/** @type {{ key: number, choice: string, o2: string, he: string }[]} */ ([]));
  let gfField = $state('');
  let sacField = $state('');
  let decoSacField = $state('');
  /** @type {Record<string, boolean>} */
  let invalid = $state({});
  let nextKey = 0;

  const sacUnit = $derived(t(cuft ? 'units.cubicFeetPerMinute' : 'units.litersPerMinute'));

  /** The fields from the plan: on opening, and when another plan is loaded. */
  function fillFields() {
    if (planner.source) {
      planner.bottomSacMlMin = roundSacMl(planner.bottomSacMlMin, cuft);
      planner.decoSacMlMin = roundSacMl(planner.decoSacMlMin, cuft);
    }
    levelFields = planner.levels.map((l) => ({ key: nextKey++, depth: show(mmToDepth(l.depthMm, feet)), time: show(l.durationSeconds / 60) }));
    gasFields = planner.gases.map((g) => ({ key: nextKey++, choice: gasChoiceValue(g.o2Permille, g.hePermille), o2: show(g.o2Permille / 10), he: show(g.hePermille / 10) }));
    gfField = `${planner.deco.gfLow} / ${planner.deco.gfHigh}`;
    sacField = sacText(planner.bottomSacMlMin, cuft, locale);
    decoSacField = sacText(planner.decoSacMlMin, cuft, locale);
    invalid = {};
  }
  $effect(() => {
    planner.loaded;
    ready;
    untrack(fillFields);
  });

  /** A typed number into the plan, when it is within its range. @param {string} key @param {string} text @param {number} min @param {number} max @param {(v: number) => void} set */
  function typed(key, text, min, max, set) {
    const v = parse(text);
    invalid[key] = !(v >= min && v <= max);
    if (invalid[key]) return;
    set(v);
    planner.version++;
  }

  /** @param {number} i */
  const levelDepth = (i) => typed(`depth-${levelFields[i].key}`, levelFields[i].depth, 1, feet ? 980 : 300, (v) => (planner.levels[i].depthMm = depthToMm(v, feet)));
  /** @param {number} i */
  const levelTime = (i) => typed(`time-${levelFields[i].key}`, levelFields[i].time, 1, 360, (v) => (planner.levels[i].durationSeconds = Math.round(v * 60)));

  function addLevel() {
    const last = planner.levels[planner.levels.length - 1];
    const step = feet ? MM_PER_FT : 1000;
    const depthMm = Math.max(step, Math.round((last.depthMm * 0.6) / step) * step);
    planner.levels.push({ depthMm, durationSeconds: 10 * 60 });
    levelFields.push({ key: nextKey++, depth: show(depthMm / step), time: show(10) });
    planner.version++;
  }

  /** @param {number} i */
  function removeLevel(i) {
    planner.levels.splice(i, 1);
    delete invalid[`depth-${levelFields[i].key}`];
    delete invalid[`time-${levelFields[i].key}`];
    levelFields.splice(i, 1);
    planner.version++;
  }

  // --- Gases: a dropdown of usual mixes, « Autre mélange » shows the two percentages. ---

  const gasOptions = (/** @type {number} */ i) => [
    ...GAS_PRESETS.map((g) => ({ value: `${g.o2}/${g.he}`, label: gasName(g.o2, g.he) })),
    { value: 'custom', label: gasFields[i]?.choice === 'custom' ? gasName(planner.gases[i]?.o2Permille ?? 0, planner.gases[i]?.hePermille ?? 0) : t('desktopTools.otherGas') },
  ];

  /** @param {number} i @param {string} choice */
  function gasChosen(i, choice) {
    const f = gasFields[i];
    if (choice === 'custom') {
      f.o2 = show(planner.gases[i].o2Permille / 10);
      f.he = show(planner.gases[i].hePermille / 10);
      return;
    }
    const [o2, he] = choice.split('/').map(Number);
    planner.gases[i].o2Permille = o2;
    planner.gases[i].hePermille = he;
    f.o2 = show(o2 / 10);
    f.he = show(he / 10);
    invalid[`gas-${f.key}`] = false;
    planner.version++;
  }

  /** Oxygen and helium typed: valid each, and 100 % at most together. @param {number} i */
  function gasTyped(i) {
    const f = gasFields[i];
    const o2 = parse(f.o2);
    const he = parse(f.he);
    const good = gasValid(o2, he);
    invalid[`gas-${f.key}`] = !good;
    if (!good) return;
    planner.gases[i].o2Permille = Math.round(o2 * 10);
    planner.gases[i].hePermille = Math.round(he * 10);
    planner.version++;
  }

  function addGas() {
    const gas = nextGas();
    planner.gases.push(gas);
    gasFields.push({ key: nextKey++, choice: gasChoiceValue(gas.o2Permille, 0), o2: show(gas.o2Permille / 10), he: show(0) });
    planner.version++;
  }

  /** @param {number} i */
  function removeGas(i) {
    planner.gases.splice(i, 1);
    delete invalid[`gas-${gasFields[i].key}`];
    gasFields.splice(i, 1);
    planner.version++;
  }

  // --- Gradient factors and SAC. ---

  const gfInvalid = $derived(gfField.trim() !== '' && !parseGradientFactors(gfField));
  function gfTyped() {
    const gf = parseGradientFactors(gfField);
    if (!gf) return;
    planner.deco.gfLow = gf.low;
    planner.deco.gfHigh = gf.high;
    planner.version++;
  }
  /** @param {string} text @param {(ml: number) => void} set @param {string} key */
  function sacTyped(text, set, key) {
    const ml = parseSac(text, cuft);
    invalid[key] = ml === null || ml <= 0;
    if (ml === null || ml <= 0) return;
    set(ml);
    planner.version++;
  }

  // --- Conditions (read-only here: the defaults come from Réglages, Conditions des outils). ---

  const altitude = $derived(Math.max(0, Math.round(mmToDepth(pressureToAltitudeMm(planner.surfacePressureMbar), feet))));
  const conditions = $derived(
    t('desktopTools.conditions', {
      model: planner.deco.decoModel === 'vpmb' ? t('settings.deco.vpmb') : t('desktopTools.modelBuehlmann'),
      water: waterTypeName(waterTypeOfSalinity(planner.salinity)).toLowerCase(),
      altitude: `${formatNumber(altitude)} ${depthUnit(prefs)}`,
    }),
  );

  // --- The result. ---

  const errorText = $derived(result?.error ? t(`plan.errors.${result.error}`) : '');

  const rows = $derived(result?.stops?.length ? planRows(result) : []);
  const tableRows = $derived(
    rows
      .filter((r) => r.kind === 'level' || r.kind === 'stop')
      .map((r) => ({
        depth: depthText(r.depthMm),
        duration: minutes(r.durationMinutes * 60),
        gas: r.breathed ? gasName(r.breathed.o2Permille, r.breathed.hePermille) : '',
        gasIndex: r.breathed ? planner.gases.findIndex((g) => g.o2Permille === r.breathed?.o2Permille && g.hePermille === r.breathed?.hePermille) : -1,
      })),
  );

  const stopsTotal = $derived((result?.stops ?? []).reduce((sum, s) => sum + s.durationSeconds, 0));

  /** @param {number} i the plan's gas */
  const gasClass = (i) => `bc-desktop-planner--gas-${Math.max(0, i) % 4}`;

  // The profile, in its own units: x in minutes, y in depth.
  const W = 560;
  const H = 210;
  const LEFT = 44;
  const RIGHT = 8;
  const TOP = 12;
  const BOTTOM = 26;
  const shape = $derived.by(() => {
    const points = result?.points ?? [];
    if (points.length < 2 || !result) return null;
    const tMax = points[points.length - 1][0] || 1;
    const stepMm = feet ? MM_PER_FT * 20 : 15000;
    const dMax = Math.max(stepMm, Math.ceil(result.maxDepthMm / stepMm) * stepMm);
    /** @param {number} s */
    const x = (s) => LEFT + (s / tMax) * (W - LEFT - RIGHT);
    /** @param {number} mm */
    const y = (mm) => TOP + (mm / dMax) * (H - TOP - BOTTOM);
    const line = 'M' + points.map(([s, mm]) => `${x(s).toFixed(1)} ${y(mm).toFixed(1)}`).join(' L');
    const area = `${line} L${x(tMax).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
    const yTicks = [];
    for (let mm = 0; mm <= dMax; mm += stepMm) yTicks.push({ y: y(mm), text: depthText(mm) });
    const xStepMin = tMax / 60 > 60 ? 20 : tMax / 60 > 25 ? 10 : 5;
    const xTicks = [];
    for (let m = 0; m <= tMax / 60 + 0.001; m += xStepMin) xTicks.push({ x: x(m * 60), text: `${m} ${t('units.minutes')}` });
    const runs = gasRuns(planRows(result), planner.gases).map((r) => ({ gas: r.gas, x: x(r.start * 60), w: Math.max(2, x(r.end * 60) - x(r.start * 60)) }));
    return { line, area, yTicks, xTicks, runs, bottom: waterBottomColor(result.maxDepthMm) };
  });

  const profileLabel = $derived(
    result
      ? t(result.stops?.length ? 'plan.profileLabelStops' : 'plan.profileLabel', {
          depth: depthText(result.maxDepthMm),
          time: minutes(result.runtimeSeconds),
          stops: (result.stops ?? []).map((s) => depthText(s.depthMm)).join(', '),
        })
      : '',
  );

  /** The volume needed for each gas: what is breathed plus the reserve. */
  const volumeTiles = $derived(
    (result?.cylinders ?? []).map((c, i) => ({ key: i, label: gasName(c.o2Permille, c.hePermille), value: formatGasVolume(gasTotalMl(c), prefs) })),
  );

  const modRow = $derived.by(() => {
    const bottom = result?.cylinders[0];
    if (!result || !bottom || !modAlarm(result.maxDepthMm, bottom.bottomModMm)) return null;
    return t('plan.modText', { po2: formatPartialPressure((result.setup.bottomPo2Mbar ?? 1400) / 1000, 1), depth: depthText(bottom.bottomModMm) });
  });

  const anyInvalid = $derived(Object.values(invalid).some(Boolean) || gfInvalid);
  const canSave = $derived(!!result && !result.error && !failed && !saving && !anyInvalid);

  // --- The start: a new dive, or a dive of the logbook. ---

  /** Logbook dives to start from, newest first. */
  const startOptions = $derived([
    { value: '', label: t('plan.newDive') },
    ...[...logbook.dives]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 300)
      .map((d) => ({
        value: String(d.id),
        label: [d.number ? t('detail.number', { number: String(d.number) }) : '', d.site || t('dive.siteNotSet'), formatDateTime(d.date), d.durationSeconds ? formatDuration(d.durationSeconds) : ''].filter(Boolean).join(' · '),
      })),
  ]);
  let startChoice = $state('');
  $effect(() => {
    startChoice = planner.source ? String(planner.source.id) : '';
  });
  /** @param {string} value */
  async function startChanged(value) {
    if (value === '') startNewDive(prefs);
    else await startFrom(Number(value));
  }

  const title = $derived(planner.title || (planner.source ? planner.source.site || t('dive.siteNotSet') : t('desktopTools.newPlan')));

  // --- Saved plans, saving, sharing. ---

  async function openSaved() {
    try {
      // The side panel shows an empty list too (« Nouveau plan » is in it).
      savedPlans = await BenthicCore.listPlans();
    } catch (e) {
      console.error('Planned dives', e);
      showSnackbar(t('plans.failed'));
    }
  }
  /** @param {string} id */
  async function savedChosen(id) {
    savedPlans = null;
    await reopenPlan(Number(id));
  }

  function save() {
    if (!canSave) return;
    if (planner.planId) saveWith(planner.title);
    else titling = true;
  }

  /** @param {string} wanted */
  async function saveWith(wanted) {
    titling = false;
    if (!canSave || !result) return;
    saving = true;
    try {
      planner.title = cleanPlanTitle(wanted);
      const id = await savePlan({ ...planRequest(), ...planSettings(), when: result.when }, planner.planId, planner.title);
      if (id) planner.planId = id;
      showSnackbar(t('plan.saved'));
    } catch (e) {
      console.error('Saving the plan', e);
      showSnackbar(t('plan.saveFailed'));
    } finally {
      saving = false;
    }
  }

  function printSlate() {
    if (!result) return;
    slateRequest = planRequest();
    slating = true;
  }

  /** @param {'slate'|'pdf'|'image'|'ssrf'|'summary'|'qr'} kind */
  async function share(kind) {
    sharing = false;
    if (!result) return;
    if (kind === 'qr') {
      qrSharing = true;
      return;
    }
    if (kind === 'slate') {
      printSlate();
      return;
    }
    const name = planner.title || (planner.source ? planner.source.site || t('dive.siteNotSet') : t('plan.noStartDive'));
    try {
      if (kind === 'pdf') await sharePlanPdf(result, planRequest(), prefs, name);
      else if (kind === 'image') await sharePlanTableImage(result, planRequest(), prefs, name);
      else if (kind === 'ssrf') await sharePlanFile(planner.planId, name, result);
      else await sharePlanSummary(result, planRequest(), prefs, name);
    } catch (e) {
      console.error('Sharing the plan', e);
      showSnackbar(t('plan.shareFailed'));
    }
  }

  /** @param {MouseEvent} e */
  function openMore(e) {
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    moreAt = { x: r.right - 280, y: r.bottom + 4 };
  }
  const moreEntries = [
    { key: 'share', label: 'desktopTools.sharePlan', icon: 'share' },
    { key: 'settings', label: 'plannerSettings.open', icon: 'tune' },
  ];
  /** @param {string} key */
  function moreChoose(key) {
    moreAt = null;
    if (key === 'share') sharing = true;
    else if (key === 'settings') openOver('/settings/planner');
  }
</script>

<div class="bc-desktop-planner">
  <header class="bc-desktop-planner--head">
    <h2 class="bc-desktop-planner--title">{title}</h2>
    <div class="bc-desktop-planner--actions">
      <button type="button" class="bc-desktop-planner--button" onclick={openSaved}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 4h10v16l-5-4-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>{t('desktopTools.savedPlans')}
      </button>
      <button type="button" class="bc-desktop-planner--button" disabled={!result || !!result.error} onclick={printSlate}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>{t('desktopTools.printSlate')}
      </button>
      <button type="button" class="bc-desktop-planner--button bc-desktop-planner--filled" disabled={!canSave} onclick={save}>{t('desktopTools.savePlan')}</button>
      <button type="button" class="bc-desktop-planner--more" aria-label={t('desktopTools.moreOptions')} title={t('desktopTools.moreOptions')} aria-haspopup="menu" onclick={openMore}>
        <Icon name="more" size={22} />
      </button>
    </div>
  </header>

  <div class="bc-desktop-planner--body">
    <section class="bc-desktop-planner--params" aria-label={t('plan.title')}>
      <div class="bc-desktop-planner--pair">
        <div class="bc-desktop-planner--wide"><DesktopField label={t('desktopTools.startFrom')} bind:value={startChoice} options={startOptions} onchange={startChanged} /></div>
        {#each levelFields as level, i (level.key)}
          <DesktopField label={t('plan.depth')} bind:value={level.depth} unit={depthUnit(prefs)} invalid={invalid[`depth-${level.key}`]} oninput={() => levelDepth(i)} />
          <div class="bc-desktop-planner--with-remove">
            <DesktopField label={t(i === 0 ? 'desktopTools.bottomTime' : 'plan.duration')} bind:value={level.time} unit={t('units.minutes')} invalid={invalid[`time-${level.key}`]} oninput={() => levelTime(i)} />
            {#if i > 0}<button type="button" class="bc-desktop-planner--remove" aria-label={t('plan.removeLevel')} onclick={() => removeLevel(i)}><Icon name="close" size={18} /></button>{/if}
          </div>
        {/each}
        {#if levelFields.length < 20}
          <button type="button" class="bc-desktop-planner--add bc-desktop-planner--wide" onclick={addLevel}><Icon name="plus" size={18} />{t('plan.addLevel')}</button>
        {/if}

        {#each gasFields as gas, i (gas.key)}
          <div class="bc-desktop-planner--wide bc-desktop-planner--gas-field">
            <DesktopField
              label={t(i === 0 ? 'desktopTools.bottomGas' : 'desktopTools.decoGas')}
              bind:value={gas.choice}
              options={gasOptions(i)}
              onchange={(v) => gasChosen(i, v)}
              invalid={invalid[`gas-${gas.key}`]}
              helper={invalid[`gas-${gas.key}`] ? t('tools.gasInvalid') : ''}
            />
            {#if i > 0}<button type="button" class="bc-desktop-planner--remove" aria-label={t('plan.removeGas')} onclick={() => removeGas(i)}><Icon name="close" size={18} /></button>{/if}
          </div>
          {#if gas.choice === 'custom'}
            <DesktopField label={t('plan.oxygenPercent')} bind:value={gas.o2} unit={t('units.percent')} invalid={invalid[`gas-${gas.key}`]} oninput={() => gasTyped(i)} />
            <DesktopField label={t('plan.heliumPercent')} bind:value={gas.he} unit={t('units.percent')} invalid={invalid[`gas-${gas.key}`]} oninput={() => gasTyped(i)} />
          {/if}
        {/each}
        <button type="button" class="bc-desktop-planner--add bc-desktop-planner--wide" onclick={addGas}><Icon name="plus" size={18} />{t('plan.addGas')}</button>

        <DesktopField label={t('desktopTools.gradientFactors')} bind:value={gfField} invalid={gfInvalid} inputmode="text" oninput={gfTyped} helper={gfInvalid ? t('desktopTools.gradientInvalid') : ''} />
        <DesktopField
          label={t('desktopTools.sac')}
          bind:value={sacField}
          unit={sacUnit}
          invalid={invalid['sac']}
          oninput={() => sacTyped(sacField, (ml) => (planner.bottomSacMlMin = ml), 'sac')}
        />
        <DesktopField
          label={t('plan.sacDeco')}
          bind:value={decoSacField}
          unit={sacUnit}
          invalid={invalid['decoSac']}
          oninput={() => sacTyped(decoSacField, (ml) => (planner.decoSacMlMin = ml), 'decoSac')}
        />
      </div>
      <p class="bc-desktop-planner--conditions">{conditions}</p>
    </section>

    <section class="bc-desktop-planner--outcome" aria-live="polite">
      {#if failed}
        <p class="bc-desktop-planner--note">{t('plan.failed')}</p>
      {:else if result}
        {#if errorText}<p class="bc-desktop-planner--error" role="alert">{errorText}</p>{/if}
        <div class="bc-desktop-planner--totals">
          <div class="bc-desktop-planner--total">
            <span class="bc-desktop-planner--total-label">{t('plan.totalTime')}</span>
            <span class="bc-desktop-planner--total-value bc-value">{minutes(result.runtimeSeconds)}</span>
          </div>
          <div class="bc-desktop-planner--total">
            <span class="bc-desktop-planner--total-label">{t('desktopTools.stops')}</span>
            <span class="bc-desktop-planner--total-value bc-value">{minutes(stopsTotal)}</span>
          </div>
          {#each volumeTiles as tile (tile.key)}
            <div class="bc-desktop-planner--total">
              <span class="bc-desktop-planner--total-label">{tile.label}</span>
              <span class="bc-desktop-planner--total-value bc-value">{tile.value}</span>
            </div>
          {/each}
          <div class="bc-desktop-planner--total">
            <span class="bc-desktop-planner--total-label">{t('tools.oxygen')}</span>
            <span class="bc-desktop-planner--total-value bc-value">{t('plan.cnsValue', { cns: result.cns })}</span>
          </div>
        </div>
        {#if modRow}<p class="bc-desktop-planner--error" role="alert">{modRow}</p>{/if}

        {#if shape}
          <div class="bc-desktop-planner--card">
            <svg class="bc-desktop-planner--profile" viewBox="0 0 {W} {H}" role="img" aria-label={profileLabel}>
              <defs>
                <linearGradient id="od-desktop-plan-water" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style="stop-color: var(--bc-water-top)" />
                  <stop offset="1" style="stop-color: {shape.bottom}" />
                </linearGradient>
              </defs>
              {#each shape.yTicks as tick (tick.text)}
                <path class="bc-desktop-planner--grid" d="M{LEFT} {tick.y} H{W - RIGHT}" />
                <text class="bc-desktop-planner--axis" x={LEFT - 6} y={tick.y + 4} text-anchor="end">{tick.text}</text>
              {/each}
              <path d={shape.area} fill="url(#od-desktop-plan-water)" opacity="0.9" />
              <path d={shape.line} class="bc-desktop-planner--line" />
              {#each shape.xTicks as tick (tick.text)}
                <text class="bc-desktop-planner--axis" x={tick.x} y={H - 8} text-anchor="middle">{tick.text}</text>
              {/each}
              {#each shape.runs as run, i (i)}
                <rect class={gasClass(run.gas)} x={run.x} y={H - BOTTOM - 4} width={run.w} height="6" rx="3" />
              {/each}
            </svg>
            <ul class="bc-desktop-planner--legend">
              {#each planner.gases as gas, i (i)}
                <li><i class="bc-desktop-planner--swatch {gasClass(i)}"></i>{gasName(gas.o2Permille, gas.hePermille)}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="bc-desktop-planner--card">
          {#if tableRows.length}
            <table class="bc-desktop-planner--table bc-value">
              <thead>
                <tr>
                  <th scope="col" class="bc-desktop-planner--num">{t('plan.depth')}</th>
                  <th scope="col" class="bc-desktop-planner--num">{t('plan.duration')}</th>
                  <th scope="col">{t('plan.gasColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {#each tableRows as row, i (i)}
                  <tr>
                    <td class="bc-desktop-planner--num">{row.depth}</td>
                    <td class="bc-desktop-planner--num">{row.duration}</td>
                    <td>{row.gas}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p class="bc-desktop-planner--no-stop"><Icon name="check" size={20} />{t('plan.noStopShort')}</p>
          {/if}
        </div>
        <p class="bc-desktop-planner--note">{t(planner.source ? 'plan.noteFromDive' : 'plan.note')}</p>
      {:else}
        <p class="bc-desktop-planner--note" aria-busy="true">{t('plan.computing')}</p>
      {/if}
    </section>
  </div>
</div>

{#if moreAt}
  <DesktopContextMenu x={moreAt.x} y={moreAt.y} heading="" entries={moreEntries} onchoose={moreChoose} onclose={() => (moreAt = null)} />
{/if}
{#if savedPlans}
  <DesktopPlansPanel plans={savedPlans} openId={planner.planId} onchoose={(id) => savedChosen(String(id))} onnew={() => ((savedPlans = null), startNewDive(prefs))} onclose={() => (savedPlans = null)} />
{/if}
{#if titling}
  <PlanTitleDialog title={planner.title} oncancel={() => (titling = false)} onsave={saveWith} />
{/if}
{#if sharing}
  <ShareSheet heading={t('plan.share')} rows={planShareRows(planner.planId > 0, share)} onclose={() => (sharing = false)} />
{/if}
{#if qrSharing && result}
  <QrShare
    id={planner.planId}
    kind="p"
    summary={qrSummary({ site: planner.title || (planner.source ? planner.source.site : ''), date: new Date(result.when * 1000).toISOString().slice(0, 19), maxDepthMm: result.maxDepthMm, durationSeconds: result.runtimeSeconds }, prefs)}
    onclose={() => (qrSharing = false)}
  />
{/if}
{#if slating && result && slateRequest}
  <PlanSlate {result} request={slateRequest} {prefs} title={planner.title || (planner.source ? planner.source.site || t('dive.siteNotSet') : t('plan.noStartDive'))} onclose={() => (slating = false)} />
{/if}

<style>
  @layer od.components {
    .bc-desktop-planner {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .bc-desktop-planner--head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
      min-height: 48px;
    }
    .bc-desktop-planner--title {
      margin: 0;
      min-width: 0;
      font-family: var(--bc-title-font);
      font-size: 24px;
      font-weight: 500;
      color: var(--bc-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-desktop-planner--actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
    }
    .bc-desktop-planner--button {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 42px;
      padding: 0 20px;
      border: 1px solid var(--bc-text-2);
      border-radius: 21px;
      background: none;
      font: inherit;
      font-size: 15px;
      color: var(--bc-text);
      cursor: pointer;
      white-space: nowrap;
      &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
    }
    .bc-desktop-planner--filled,
    .bc-desktop-planner--filled:hover:not(:disabled) {
      border-color: transparent;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
    }
    .bc-desktop-planner--more {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }
    .bc-desktop-planner--body {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      gap: 32px;
      align-items: start;
    }
    /* Fluid layout: in a narrow pane the results go under the inputs. */
    @container od-tool (max-width: 659px) {
      .bc-desktop-planner--body {
        grid-template-columns: minmax(0, 1fr);
        gap: 20px;
      }
    }
    .bc-desktop-planner--pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 16px;
      align-items: start;
    }
    .bc-desktop-planner--wide {
      grid-column: 1 / -1;
    }
    .bc-desktop-planner--with-remove,
    .bc-desktop-planner--gas-field {
      position: relative;
    }
    .bc-desktop-planner--remove {
      position: absolute;
      top: 0;
      right: 0;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text-2);
      cursor: pointer;
    }
    .bc-desktop-planner--add {
      display: flex;
      align-items: center;
      gap: 6px;
      justify-self: start;
      padding: 4px 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 14px;
      color: var(--bc-desktop-selected-ink);
      cursor: pointer;
    }
    .bc-desktop-planner--conditions {
      margin: 14px 0 0;
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-planner--outcome {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    .bc-desktop-planner--totals {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 32px;
    }
    .bc-desktop-planner--total {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .bc-desktop-planner--total-label {
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-desktop-planner--total-value {
      font-family: var(--bc-title-font);
      font-size: 24px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-planner--card {
      padding: 16px 20px;
      border-radius: 16px;
      background: var(--bc-surface);
    }
    .bc-desktop-planner--profile {
      display: block;
      width: 100%;
    }
    .bc-desktop-planner--grid {
      stroke: var(--bc-separator);
      stroke-width: 1;
    }
    .bc-desktop-planner--axis {
      font-size: 11px;
      fill: var(--bc-text-2);
    }
    .bc-desktop-planner--line {
      fill: none;
      stroke: var(--bc-desktop-selected-ink);
      stroke-width: 1.5;
    }
    .bc-desktop-planner--gas-0 {
      fill: var(--bc-gas-helium);
      background: var(--bc-gas-helium);
    }
    .bc-desktop-planner--gas-1 {
      fill: var(--bc-gas-topup);
      background: var(--bc-gas-topup);
    }
    .bc-desktop-planner--gas-2 {
      fill: var(--bc-gas-oxygen);
      background: var(--bc-gas-oxygen);
    }
    .bc-desktop-planner--gas-3 {
      fill: var(--bc-text-2);
      background: var(--bc-text-2);
    }
    .bc-desktop-planner--legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      font-size: 13px;
      color: var(--bc-text-2);
      & li {
        display: flex;
        align-items: center;
        gap: 6px;
      }
    }
    .bc-desktop-planner--swatch {
      width: 10px;
      height: 10px;
      border-radius: 5px;
    }
    .bc-desktop-planner--table {
      width: 100%;
      border-collapse: collapse;
      font-size: 15px;
      & th {
        padding: 6px 12px 8px;
        border-bottom: 1px solid var(--bc-separator);
        font-size: 13px;
        font-weight: 500;
        text-align: left;
        color: var(--bc-text-2);
      }
      & td {
        padding: 9px 12px;
        color: var(--bc-text);
      }
    }
    .bc-desktop-planner--num {
      text-align: right !important;
    }
    .bc-desktop-planner--no-stop {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--bc-status-ok);
    }
    .bc-desktop-planner--note {
      margin: 0;
      font-size: 12px;
      color: var(--bc-text-2);
    }
    .bc-desktop-planner--error {
      margin: 0;
      padding: 10px 14px;
      border-radius: 12px;
      background: var(--bc-alarm-tint);
      font-size: 14px;
      color: var(--bc-text);
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-planner--filled {
        transition: box-shadow 120ms linear;
        &:hover:not(:disabled) {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
      .bc-desktop-planner--add:hover {
        text-decoration: underline;
      }
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-planner--remove {
        transition: box-shadow 120ms linear;
        &:not(:disabled):hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-desktop-planner--remove {
        transition: none;
      }
    }
  }
</style>
