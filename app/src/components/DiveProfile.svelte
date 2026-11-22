<script>
  // @ts-check
  // <DiveProfile> (spec, section 4, "Profil", "Axes" and "Temperature curve"):
  // depth over time, surface at the top; water column; graduated depth and
  // time axes; finger cursor; filter chips for the layers: water temperature
  // (off by default like the others, todo 124), gas, ppO2, ceiling
  // and tissues, each offered only when the dive has the data.
  import Icon from './Icon.svelte';
  import { waterBottomColor } from '../lib/water-column.js';
  import { depthUnit, depthValue, formatDepth, formatDuration, formatMinSec, formatNumber, formatPartialPressure, formatTemperature, formatTimeOfDay } from '../lib/format.js';
  import { entryExitTimes, meanLabelY } from '../lib/profile-times.js';
  import { tissueColor } from '../lib/tissues.js';
  import { t } from '../lib/i18n.js';
  import { layout, desktopMac } from '../lib/layout.svelte.js';
  import { deviceStore } from '../lib/device-store.js';
  import { decimate, changesAt } from '../lib/profile-decimate.js';
  import { readLayers, saveLayers, sessionLayers, setLayer } from '../lib/profile-layers.js';

  /**
   * @type {{
   *   samples: import('opendives-core').DiveSamples,
   *   cylinders: import('opendives-core').Cylinder[],
   *   divemode: string,
   *   maxDepthMm: number,
   *   durationSeconds: number,
   *   startIso?: string,
   *   meanDepthMm?: number,
   *   prefs: import('opendives-core').Prefs,
   * }}
   */
  // `hover` (desktop, task 2026-11-15-169): the mouse pointer reads the values without a press:
  // a dashed line, a dot on the curve and a dark tooltip next to it.
  // `onenlarge` (desktop, task 2026-11-15-194): « Agrandir le profil », a button at the end of the chips
  // row and a double click on the profile. Desktop choices are kept between sessions; phone and tablet
  // choices are shared between profiles until the app closes.
  let { samples, cylinders, divemode, maxDepthMm, durationSeconds, startIso, meanDepthMm = 0, prefs, hover = false, onenlarge = undefined } = $props();

  let desktopLayers = $state(readLayers(deviceStore));
  const layersOn = $derived(hover ? desktopLayers : $sessionLayers);
  /** @param {import('../lib/profile-layers.js').Layer} layer @param {boolean} on */
  function remember(layer, on) {
    if (hover) {
      desktopLayers = setLayer(desktopLayers, layer, on);
      saveLayers(deviceStore, desktopLayers);
    } else {
      sessionLayers.update((layers) => setLayer(layers, layer, on));
    }
  }

  const uid = $props.id();
  let width = $state(320);
  /**
   * Keeps the width state at the element's width. A ResizeObserver reports it after the browser has laid the page out, so
   * the width is not read (forced layout) in the middle of a change of the page, as bind:clientWidth does.
   * @param {HTMLElement} node
   */
  function widthOf(node) {
    const observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[entries.length - 1].contentRect.width);
      if (w && w !== width) width = w;
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  const HEIGHT = 184;
  const MARGIN_LEFT = 30;
  const MARGIN_TOP = 6;
  // Under the plot: the time axis (21), then the row of entry and exit times (16).
  const MARGIN_BOTTOM = 37;
  const BAND = 22;

  const times = $derived(samples.timeSeconds);
  const depths = $derived(samples.depthMm);
  const tMax = $derived(Math.max(1, times.length ? times[times.length - 1] : durationSeconds));
  const dMax = $derived.by(() => {
    // A loop, not Math.max(...depths): a spread of a very long dive overflows the call stack.
    let deepest = Math.max(1, maxDepthMm);
    for (let i = 0; i < depths.length; i++) if (depths[i] > deepest) deepest = depths[i];
    return deepest;
  });

  // Depth axis: a labelled graduation with a grid line every 40 ft (10 m),
  // the first label with the unit; a 5 px tick every 10 ft (2 m).
  const ticks = $derived.by(() => {
    const feet = prefs.length === 'ft';
    const mmPerUnit = feet ? 304.8 : 1000;
    const major = feet ? 40 : 10;
    const minor = feet ? 10 : 2;
    const end = Math.floor(dMax / mmPerUnit / minor) * minor;
    /** @type {{ value: number, mm: number, major: boolean }[]} */
    const list = [];
    for (let v = 0; v <= end + 1e-9; v += minor) list.push({ value: v, mm: v * mmPerUnit, major: v % major === 0 });
    return { list };
  });

  // Time axis: labelled ticks every 20 min (10 or 5 for short dives), the
  // last label with the unit; minor ticks in between.
  const timeTicks = $derived.by(() => {
    const minutes = tMax / 60;
    const major = minutes >= 40 ? 20 : minutes >= 15 ? 10 : 5;
    const minor = major / 2;
    /** @type {{ m: number, major: boolean }[]} */
    const list = [];
    for (let m = 0; m * 60 <= tMax + 1e-9; m += minor) list.push({ m, major: m % major === 0 });
    const lastMajor = [...list].reverse().find((tick) => tick.major)?.m ?? 0;
    return { list, lastMajor };
  });

  // Water temperature: the samples (0 where unknown) in the display unit,
  // on their own scale, labelled on the right.
  const temperature = $derived.by(() => {
    const mk = samples.temperatureMk;
    if (!mk || !mk.some((v) => v > 0)) return null;
    const fahrenheit = prefs.temperature === 'F';
    /** @param {number} v */
    const unit = (v) => {
      const c = v / 1000 - 273.15;
      return fahrenheit ? (c * 9) / 5 + 32 : c;
    };
    const values = mk.filter((v) => v > 0).map(unit);
    let lo = Math.floor(Math.min(...values));
    let hi = Math.ceil(Math.max(...values));
    if (hi - lo < 2) {
      lo -= 1;
      hi = lo + 2;
    }
    return { mk, unit, lo, hi, symbol: fahrenheit ? '°F' : '°C' };
  });
  const temperatureAvailable = $derived(temperature !== null);
  const temperatureLayer = $derived(layersOn.includes('temperature'));
  const showTemperature = $derived(temperatureAvailable && temperatureLayer);

  // ppO2: the samples in bar, on their own 0 to 1.6 bar scale on the right,
  // with the 1.4 and 1.6 bar limits as light dashed lines.
  const PPO2_MAX = 1.6;
  const ppo2Available = $derived(samples.ppo2Mbar.some((v) => v > 0));
  const ppo2Layer = $derived(layersOn.includes('ppo2'));
  const showPpo2 = $derived(ppo2Available && ppo2Layer);

  // Only one right-hand scale is drawn: the last one turned on.
  const rightScale = $derived(
    [...layersOn].reverse().find((l) => (l === 'temperature' && showTemperature) || (l === 'ppo2' && showPpo2)) ?? null,
  );

  const MARGIN_RIGHT = $derived(rightScale ? 28 : 18);
  const plotWidth = $derived(Math.max(10, width - MARGIN_LEFT - MARGIN_RIGHT));
  const plotHeight = $derived(HEIGHT - MARGIN_TOP - MARGIN_BOTTOM);
  // The deepest point sits just above the time axis.
  const scaleHeight = $derived(plotHeight - 1);
  /** @param {number} s */
  const x = (s) => MARGIN_LEFT + (s / tMax) * plotWidth;
  /** @param {number} mm */
  const y = (mm) => MARGIN_TOP + (mm / dMax) * scaleHeight;

  // The samples each curve draws: all of them for a short profile, else a few per pixel column
  // (lib/profile-decimate.js). Worked out again when the plot's width changes, not at each cursor move.
  /** @param {ArrayLike<number>} values @param {(i: number) => boolean} [valid] @param {(i: number) => boolean} [must] */
  const drawn = (values, valid, must) => decimate(times, values, { width: plotWidth, tMax, valid, must }) ?? times.map((_, i) => i);
  const switches = $derived(changesAt(samples.cylinder));
  const depthIndices = $derived.by(() => {
    const ceiling = samples.ceilingMm;
    const violation = (/** @type {number} */ i) => !!ceiling && ceiling[i] > depths[i];
    return drawn(depths, undefined, (i) => switches(i) || (i > 0 && violation(i) !== violation(i - 1)));
  });

  const paths = $derived.by(() => {
    if (!times.length) return null;
    let line = '';
    for (const i of depthIndices) line += `${line ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(depths[i]).toFixed(1)}`;
    const last = times.length - 1;
    const water = `${line}L${x(times[last]).toFixed(1)},${y(0).toFixed(1)}L${x(times[0]).toFixed(1)},${y(0).toFixed(1)}Z`;
    return { line, water };
  });

  /** @param {number} millikelvin */
  function yTemperature(millikelvin) {
    if (!temperature) return MARGIN_TOP;
    const { unit, lo, hi } = temperature;
    return MARGIN_TOP + ((hi - unit(millikelvin)) / (hi - lo)) * scaleHeight;
  }

  const temperaturePath = $derived.by(() => {
    if (!temperature) return '';
    const { mk } = temperature;
    let d = '';
    let pen = false;
    for (const i of drawn(mk, (k) => mk[k] > 0, switches)) {
      if (!(mk[i] > 0)) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(times[i]).toFixed(1)},${yTemperature(mk[i]).toFixed(1)}`;
      pen = true;
    }
    return d;
  });
  /** @param {number} bar */
  const yPpo2 = (bar) => MARGIN_TOP + (1 - Math.min(bar, PPO2_MAX) / PPO2_MAX) * scaleHeight;
  const ppo2Path = $derived.by(() => {
    if (!ppo2Available) return '';
    let d = '';
    for (const i of drawn(samples.ppo2Mbar, undefined, switches)) d += `${d ? 'L' : 'M'}${x(times[i]).toFixed(1)},${yPpo2(samples.ppo2Mbar[i] / 1000).toFixed(1)}`;
    return d;
  });
  const ppo2Labels = $derived([
    { y: MARGIN_TOP + 4, text: formatNumber(1.6, 1) },
    { y: yPpo2(1.4) + 4, text: formatNumber(1.4, 1) },
    { y: MARGIN_TOP + scaleHeight + 4, text: '0' },
  ]);

  // Ceiling: the core's calculated ceiling (gradient factors of the settings),
  // an area from the surface down to it, as on the planner.
  const ceilingMm = $derived(samples.ceilingMm);
  // The computer's ceiling (or the computed one for a dive without deco data); with « Plafond
  // calculé » in Settings, the computed one is drawn beside it as a dashed line.
  const calcCeilingMm = $derived(samples.calcCeilingMm ?? null);
  const calcCeilingEdge = $derived.by(() => {
    if (!calcCeilingMm || !calcCeilingMm.some((v) => v > 0) || !times.length) return null;
    let edge = '';
    for (const i of drawn(calcCeilingMm)) edge += `${edge ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(calcCeilingMm[i]).toFixed(1)}`;
    return edge;
  });
  const ceilingAvailable = $derived((!!ceilingMm && ceilingMm.some((v) => v > 0)) || !!calcCeilingEdge);
  const ceilingLayer = $derived(layersOn.includes('ceiling'));
  const ceilingShape = $derived.by(() => {
    if (!ceilingAvailable || !ceilingMm || !times.length) return null;
    let edge = '';
    for (const i of drawn(ceilingMm)) edge += `${edge ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(ceilingMm[i]).toFixed(1)}`;
    const last = times.length - 1;
    return { edge, area: `${edge}L${x(times[last]).toFixed(1)},${y(0).toFixed(1)}L${x(times[0]).toFixed(1)},${y(0).toFixed(1)}Z` };
  });

  // Tissues: 16 compartments, flat in the samples; bars at the cursor, or at
  // the end of the dive.
  const tissueData = $derived(samples.tissues);
  const tissuesAvailable = $derived(!!tissueData && tissueData.length >= 16 && tissueData.length === times.length * 16);
  const tissuesLayer = $derived(layersOn.includes('tissues'));
  const T_HEIGHT = 56;
  const T_TOP = 4;
  const T_BOTTOM = 40;
  const T_GAP = 4;
  const tissuesWidth = $derived(Math.max(10, width - 24));
  const tissueBar = $derived((tissuesWidth - 15 * T_GAP) / 16);
  const tissueValues = $derived.by(() => {
    if (!tissuesAvailable || !tissueData) return [];
    const i = cursor ?? times.length - 1;
    return Array.from({ length: 16 }, (_, c) => tissueData[16 * i + c]);
  });
  /** @param {number} percent */
  const tissueHeight = (percent) => (Math.max(0, Math.min(percent, 110)) / 100) * (T_BOTTOM - T_TOP);

  const temperatureLabels = $derived.by(() => {
    if (!temperature) return [];
    const { lo, hi, symbol } = temperature;
    const mid = (lo + hi) / 2;
    return [
      { y: MARGIN_TOP + 4, text: `${hi}${symbol}` },
      { y: MARGIN_TOP + scaleHeight / 2 + 4, text: `${Number.isInteger(mid) ? mid : mid.toFixed(1)}°` },
      { y: MARGIN_TOP + scaleHeight + 4, text: `${lo}°` },
    ];
  });

  // Gas layer: one band per mix, from the cylinder being breathed.
  const gasSegments = $derived.by(() => {
    /** @type {{start: number, end: number, name: string, oxygen: boolean}[]} */
    const list = [];
    const rebreather = divemode === 'CCR' || divemode === 'PSCR';
    for (let i = 0; i < times.length; i++) {
      const c = samples.cylinder[i];
      const cyl = c >= 0 ? cylinders[c] : null;
      const name = cyl ? cyl.gas : rebreather ? t('profile.rebreather') : '';
      const oxygen = cyl ? cyl.o2Permille > 210 : false;
      const previous = list[list.length - 1];
      if (previous && previous.name === name) previous.end = times[i];
      else list.push({ start: times[i], end: times[i], name, oxygen });
    }
    return list.filter((s) => s.name);
  });
  const gasAvailable = $derived(gasSegments.length > 0);
  const gasLayer = $derived(layersOn.includes('gas'));

  // Cursor: a finger on the profile places a vertical line and shows time and depth.
  /** @type {number|null} */
  let cursor = $state(null);

  /** @param {PointerEvent} e */
  function placeCursor(e) {
    const svg = /** @type {SVGSVGElement} */ (e.currentTarget);
    const r = svg.getBoundingClientRect();
    const s = ((e.clientX - r.left - MARGIN_LEFT) / plotWidth) * tMax;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(times[lo - 1] - s) < Math.abs(times[lo] - s)) lo--;
    cursor = lo;
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (e.buttons || e.pointerType === 'touch' || (hover && e.pointerType === 'mouse')) placeCursor(e);
  }

  /** Desktop: the mouse leaving the profile hides the reading. */
  function leave(/** @type {PointerEvent} */ e) {
    if (hover && e.pointerType === 'mouse') cursor = null;
  }

  /** The tooltip under the mouse (desktop): its place in the frame and its two lines. */
  const tip = $derived.by(() => {
    if (!hover || cursor === null) return null;
    const px = x(times[cursor]);
    const water = showTemperature && temperature && temperature.mk[cursor] > 0 ? formatTemperature(temperature.mk[cursor], prefs) : '';
    return {
      left: px,
      top: y(depths[cursor]),
      flip: px > width * 0.62,
      first: `${formatMinSec(times[cursor])} · ${formatDepth(depths[cursor], prefs)}`,
      // The values of the curves turned on, as the phone's readout.
      second: [
        water,
        showPpo2 ? `${t('profile.ppo2')} ${formatPartialPressure(samples.ppo2Mbar[cursor] / 1000, 2)}` : '',
        ceilingLayer && ceilingMm ? `${t('profile.ceiling')} ${formatDepth(ceilingMm[cursor], prefs)}` : '',
        ceilingLayer && calcCeilingMm ? `${t('profile.ceilingCalc')} ${formatDepth(calcCeilingMm[cursor], prefs)}` : '',
        gasLayer ? (gasSegments.find((g) => times[cursor] >= g.start && times[cursor] <= g.end)?.name ?? '') : '',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  });

  // Entry and exit times (the exit is the last sample) and the average depth.
  const ends = $derived(entryExitTimes(startIso, tMax, formatTimeOfDay));
  const showMean = $derived(meanDepthMm > 0 && times.length > 0);
  const meanY = $derived(y(meanDepthMm));
  const meanLabel = $derived(
    meanLabelY(
      meanY,
      ticks.list.filter((tick) => tick.major).map((tick) => y(tick.mm)),
      MARGIN_TOP + 4,
      MARGIN_TOP + scaleHeight,
    ),
  );

  const description = $derived(
    [
      t('profile.description', { depth: formatDepth(maxDepthMm, prefs), duration: formatDuration(durationSeconds) }),
      ends && t('profile.descriptionTimes', ends),
      showMean && t('profile.descriptionMean', { depth: formatDepth(meanDepthMm, prefs) }),
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<div class="bc-dive-profile bc-dive-profile--profile bc-block no-swipeback">
  <!-- Desktop: the tooltip under the mouse carries the values. -->
  {#if !hover}
  <div class="bc-dive-profile--readout bc-value" aria-hidden="true">
    {#if cursor !== null}
      <span>{t('profile.time')} <strong>{formatMinSec(times[cursor])}</strong></span>
      <span>{t('profile.depth')} <strong>{formatDepth(depths[cursor], prefs)}</strong></span>
      {#if showTemperature && temperature && temperature.mk[cursor] > 0}
        <span>{t('profile.water')} <strong class="bc-dive-profile--water">{formatTemperature(temperature.mk[cursor], prefs)}</strong></span>
      {/if}
      {#if showPpo2}
        <span>{t('profile.ppo2')} <strong>{formatPartialPressure(samples.ppo2Mbar[cursor] / 1000, 2)}</strong></span>
      {/if}
      {#if ceilingLayer && ceilingMm}
        <span>{t('profile.ceiling')} <strong>{formatDepth(ceilingMm[cursor], prefs)}</strong></span>
      {/if}
      {#if ceilingLayer && calcCeilingMm}
        <span>{t('profile.ceilingCalc')} <strong>{formatDepth(calcCeilingMm[cursor], prefs)}</strong></span>
      {/if}
    {:else}
      <span class="bc-dive-profile--hint">{t('profile.hint')}</span>
    {/if}
  </div>
  {/if}

  <div class="bc-dive-profile--frame" use:widthOf>
    <svg
      {width}
      height={HEIGHT + (gasLayer ? BAND + 4 : 0)}
      role="img"
      aria-label={description}
      onpointerdown={placeCursor}
      onpointermove={move}
      onpointerleave={leave}
      ondblclick={onenlarge}
    >
      <defs>
        <linearGradient id="water-{uid}" x1="0" y1={y(0)} x2="0" y2={y(dMax)} gradientUnits="userSpaceOnUse">
          <stop offset="0" style="stop-color: var(--bc-water-top)" />
          <stop offset="1" style="stop-color: {waterBottomColor(maxDepthMm)}" />
        </linearGradient>
      </defs>

      {#each ticks.list as tick (tick.value)}
        {#if tick.major}
          <line class="bc-dive-profile--grid" x1={MARGIN_LEFT} x2={MARGIN_LEFT + plotWidth} y1={y(tick.mm)} y2={y(tick.mm)} />
          <text class="bc-dive-profile--tick bc-value" x={MARGIN_LEFT - 4} y={y(tick.mm) + 4} text-anchor="end"
            >{tick.value === 0 ? `0\u00A0${depthUnit(prefs)}` : tick.value}</text
          >
        {:else}
          <line class="bc-dive-profile--axis" x1={MARGIN_LEFT} x2={MARGIN_LEFT + 5} y1={y(tick.mm)} y2={y(tick.mm)} />
        {/if}
      {/each}

      {#if paths}
        <path d={paths.water} fill="url(#water-{uid})" />
        {#if ceilingLayer && ceilingShape}
          <path d={ceilingShape.area} class="bc-dive-profile--ceiling-area" />
          <path d={ceilingShape.edge} class="bc-dive-profile--ceiling-line" />
        {/if}
        {#if ceilingLayer && calcCeilingEdge}
          <path d={calcCeilingEdge} class="bc-dive-profile--ceiling-line bc-dive-profile--ceiling-calc" />
        {/if}
        {#if showMean && hover}
          <!-- Desktop (task 2026-11-15-185): above the water, under the curves and the cursor; the label just above its left end. -->
          <line class="bc-dive-profile--mean-desk" x1={MARGIN_LEFT} x2={MARGIN_LEFT + plotWidth} y1={meanY} y2={meanY} />
          <text class="bc-dive-profile--mean-desk-label bc-value" x={MARGIN_LEFT + 4} y={meanY - 4}>{t('desktopDetail.mean', { depth: formatDepth(meanDepthMm, prefs) })}</text>
        {/if}
        <path d={paths.line} class="bc-dive-profile--trace-outline" />
        <path d={paths.line} class="bc-dive-profile--trace" />
      {/if}

      <line class="bc-dive-profile--axis" x1={MARGIN_LEFT} x2={MARGIN_LEFT + plotWidth} y1={MARGIN_TOP + plotHeight} y2={MARGIN_TOP + plotHeight} />
      {#each timeTicks.list as tick (tick.m)}
        {@const tx = x(tick.m * 60)}
        <line class="bc-dive-profile--axis" x1={tx} x2={tx} y1={MARGIN_TOP + plotHeight} y2={MARGIN_TOP + plotHeight + (tick.major ? 6 : 4)} />
        {#if tick.major}
          <text class="bc-dive-profile--tick bc-value" x={tx} y={MARGIN_TOP + plotHeight + 17} text-anchor="middle"
            >{tick.m === timeTicks.lastMajor && tick.m > 0 ? `${tick.m}\u00A0${t('units.minutes')}` : tick.m}</text
          >
        {/if}
      {/each}

      {#if showMean && !hover}
        <line class="bc-dive-profile--mean" x1={MARGIN_LEFT} x2={MARGIN_LEFT + plotWidth} y1={meanY} y2={meanY} />
        <text class="bc-dive-profile--mean-label bc-value" x={MARGIN_LEFT - 4} y={meanLabel + 3} text-anchor="end"
          >{t('profile.mean', { depth: depthValue(meanDepthMm, prefs) })}</text
        >
      {/if}

      {#if ends}
        <!-- Second label row: the first digit of each time on its tick, the word to its left. -->
        {@const rowY = MARGIN_TOP + plotHeight + 32}
        <text class="bc-dive-profile--tick bc-value" x={MARGIN_LEFT - 7} y={rowY} text-anchor="end">{t('profile.entry')}</text>
        <text class="bc-dive-profile--tick bc-value" x={MARGIN_LEFT - 3} y={rowY}>{ends.entry}</text>
        <text class="bc-dive-profile--tick bc-value" x={MARGIN_LEFT + plotWidth - 7} y={rowY} text-anchor="end">{t('profile.exit')}</text>
        <text class="bc-dive-profile--tick bc-value" x={MARGIN_LEFT + plotWidth - 3} y={rowY}>{ends.exit}</text>
      {/if}

      {#if showPpo2}
        {#each [1.4, 1.6] as limit (limit)}
          <line class="bc-dive-profile--ppo2-limit" x1={MARGIN_LEFT} x2={MARGIN_LEFT + plotWidth} y1={yPpo2(limit)} y2={yPpo2(limit)} />
        {/each}
        <path d={ppo2Path} class="bc-dive-profile--ppo2" />
      {/if}
      {#if showTemperature}
        <path d={temperaturePath} class="bc-dive-profile--temperature" />
      {/if}
      {#if rightScale === 'temperature'}
        {#each temperatureLabels as label (label.y)}
          <text class="bc-dive-profile--temperature-label bc-value" x={MARGIN_LEFT + plotWidth + 2} y={label.y}>{label.text}</text>
        {/each}
      {:else if rightScale === 'ppo2'}
        {#each ppo2Labels as label (label.y)}
          <text class="bc-dive-profile--ppo2-label bc-value" x={MARGIN_LEFT + plotWidth + 2} y={label.y}>{label.text}</text>
        {/each}
      {/if}

      {#if gasLayer}
        {#each gasSegments as s, i (i)}
          {@const x1 = x(s.start)}
          {@const x2 = Math.max(x(s.end), x1 + 1)}
          <g class="bc-dive-profile--gas" class:bc-dive-profile--oxygen={s.oxygen}>
            <rect x={x1} y={HEIGHT + 2} width={x2 - x1} height={BAND} rx="3" />
            {#if x2 - x1 > 44}
              <text x={x1 + 6} y={HEIGHT + 2 + BAND / 2 + 4}>{s.name}</text>
            {/if}
          </g>
        {/each}
      {/if}

      {#if cursor !== null}
        <line class="bc-dive-profile--cursor" class:bc-dive-profile--cursor-hover={hover} x1={x(times[cursor])} x2={x(times[cursor])} y1={MARGIN_TOP} y2={MARGIN_TOP + scaleHeight} />
        {#if hover}<circle class="bc-dive-profile--depth-dot" cx={x(times[cursor])} cy={y(depths[cursor])} r="4" />{/if}
        {#if showTemperature && temperature && temperature.mk[cursor] > 0}
          <circle class="bc-dive-profile--temperature-dot" cx={x(times[cursor])} cy={yTemperature(temperature.mk[cursor])} r="4" />
        {/if}
      {/if}
    </svg>
    {#if tip}
      <div class="bc-dive-profile--tip bc-value" class:bc-dive-profile--tip-left={tip.flip} style:left="{tip.left}px" style:top="{tip.top}px" aria-hidden="true">
        <span>{tip.first}</span>
        {#if tip.second}<span>{tip.second}</span>{/if}
      </div>
    {/if}
  </div>

  {#if tissuesLayer && tissuesAvailable}
    <!-- Tissues: a separate drawing under the chart, so that the PDF sheet keeps the chart alone. -->
    <svg
      class="bc-dive-profile--tissues"
      width={tissuesWidth}
      height={T_HEIGHT}
      role="img"
      aria-label={t('profile.tissuesLabel')}
    >
      <path class="bc-dive-profile--tissue-limit" d="M0 {T_TOP} H{tissuesWidth}" />
      {#each tissueValues as percent, c (c)}
        {@const h = tissueHeight(percent)}
        <rect x={c * (tissueBar + T_GAP)} y={T_BOTTOM - h} width={tissueBar} height={h} rx="2" style:fill={tissueColor(percent)} />
      {/each}
      <text class="bc-dive-profile--tick bc-value" x="0" y={T_HEIGHT - 4}>{t('desaturation.fast')}</text>
      <text class="bc-dive-profile--tick bc-value" x={tissuesWidth} y={T_HEIGHT - 4} text-anchor="end">{t('desaturation.slow')}</text>
    </svg>
  {/if}

  {#if temperatureAvailable || gasAvailable || ppo2Available || ceilingAvailable || tissuesAvailable || onenlarge}
    <div class="bc-dive-profile--layers" class:bc-dive-profile--layers-desk={hover} role="group" aria-label={t('profile.layers')}>
      <!-- MD3 filter chips, 48 px targets around 32 px chips (spec, section 3); the row scrolls sideways. -->
      {#if temperatureAvailable}
        <button
          type="button"
          class="bc-dive-profile--filter"
          aria-pressed={temperatureLayer}
          onclick={() => remember('temperature', !temperatureLayer)}
        >
          <span class="chip bc-dive-profile--chip" class:bc-dive-profile--chip-outline={!temperatureLayer} class:bc-dive-profile--chip-temperature={temperatureLayer}>
            {#if temperatureLayer}<Icon name="check" size={18} weight={2.4} />{/if}<span class="chip-label">{t(layout.phone ? 'profile.temperatureShort' : 'profile.temperature')}</span>
          </span>
        </button>
      {/if}
      {#if gasAvailable}
        <button type="button" class="bc-dive-profile--filter" aria-pressed={gasLayer} onclick={() => remember('gas', !gasLayer)}>
          <span class="chip bc-dive-profile--chip" class:bc-dive-profile--chip-outline={!gasLayer} class:bc-dive-profile--chip-ink={gasLayer}>
            {#if gasLayer}<Icon name="check" size={18} weight={2.4} />{/if}<span class="chip-label">{t('profile.gas')}</span>
          </span>
        </button>
      {/if}
      {#if ppo2Available}
        <button
          type="button"
          class="bc-dive-profile--filter"
          aria-pressed={ppo2Layer}
          onclick={() => remember('ppo2', !ppo2Layer)}
        >
          <span class="chip bc-dive-profile--chip" class:bc-dive-profile--chip-outline={!ppo2Layer} class:bc-dive-profile--chip-ppo2={ppo2Layer}>
            {#if ppo2Layer}<Icon name="check" size={18} weight={2.4} />{/if}<span class="chip-label">{t('profile.ppo2')}</span>
          </span>
        </button>
      {/if}
      {#if ceilingAvailable}
        <button type="button" class="bc-dive-profile--filter" aria-pressed={ceilingLayer} onclick={() => remember('ceiling', !ceilingLayer)}>
          <span class="chip bc-dive-profile--chip" class:bc-dive-profile--chip-outline={!ceilingLayer} class:bc-dive-profile--chip-ceiling={ceilingLayer}>
            {#if ceilingLayer}<Icon name="check" size={18} weight={2.4} />{/if}<span class="chip-label">{t('profile.ceiling')}</span>
          </span>
        </button>
      {/if}
      {#if tissuesAvailable}
        <button type="button" class="bc-dive-profile--filter" aria-pressed={tissuesLayer} onclick={() => remember('tissues', !tissuesLayer)}>
          <span class="chip bc-dive-profile--chip" class:bc-dive-profile--chip-outline={!tissuesLayer} class:bc-dive-profile--chip-ink={tissuesLayer}>
            {#if tissuesLayer}<Icon name="check" size={18} weight={2.4} />{/if}<span class="chip-label">{t('profile.tissues')}</span>
          </span>
        </button>
      {/if}
      {#if onenlarge}
        <!-- « Agrandir le profil » (Ctrl+P): at the end of the row. -->
        <button type="button" class="bc-dive-profile--enlarge" aria-label={t('desktopDetail.enlarge')} title={t('desktopDetail.enlargeTip', { shortcut: desktopMac ? '⌘P' : 'Ctrl+P' })} onclick={onenlarge}><Icon name="fullscreen" size={20} /></button>
      {/if}
    </div>
  {/if}
</div>

<style>
  @layer od.components {
    /* On the phone the profile is a band from edge to edge (white in the light
       themes); a tablet pane keeps the rounded card (spec, "Profile chart full
       width on the phone"). */
    .bc-dive-profile--profile {
      margin: 14px 0 0;
      overflow: hidden;
    }

    :global(.views.bc-tablet) .bc-dive-profile--profile {
      margin: 14px 16px 0;
      border-radius: 16px;
    }

    svg {
      display: block;
      overflow: visible;
    }

    .bc-dive-profile--readout {
      display: flex;
      flex-wrap: wrap;
      gap: 0 16px;
      min-height: 24px;
      padding: 8px 20px 0;
      align-items: baseline;
      font-size: 14px;
      color: var(--bc-text-2);

      strong {
        color: var(--bc-text);

        &.bc-dive-profile--water {
          color: var(--bc-temperature);
        }
      }
    }

    :global(.views.bc-tablet) .bc-dive-profile--readout {
      padding: 8px 12px 0;
    }

    /* The hint line is centred; the cursor readout stays at the start. */
    .bc-dive-profile--hint {
      flex: 1;
      text-align: center;
      font-size: 12px;
    }

    /* The chart is as wide as the screen minus the room its axis labels need:
       about 14 dp for the depths on the left, 26 dp for the temperatures on the right. */
    .bc-dive-profile--frame {
      position: relative;
      margin: 0 26px 0 14px;
      touch-action: pan-y;
      user-select: none;
    }

    :global(.views.bc-tablet) .bc-dive-profile--frame {
      margin: 0 12px;
    }

    .bc-dive-profile--grid {
      stroke: var(--bc-chart-grid);
      stroke-width: 1;
    }

    .bc-dive-profile--axis {
      stroke: var(--bc-text-2);
      stroke-width: 1;
    }

    .bc-dive-profile--temperature {
      fill: none;
      stroke: var(--bc-temperature);
      stroke-width: var(--bc-profile-main-width, var(--bc-profile-line-width));
      stroke-linejoin: round;
    }

    .bc-dive-profile--ppo2 {
      fill: none;
      stroke: var(--bc-oxygen);
      stroke-width: var(--bc-profile-line-width);
      stroke-linejoin: round;
    }

    .bc-dive-profile--ppo2-limit {
      stroke: var(--bc-oxygen);
      stroke-opacity: 0.4;
      stroke-width: 1;
      stroke-dasharray: 4 4;
    }

    .bc-dive-profile--ppo2-label {
      font-size: 10px;
      fill: var(--bc-oxygen);
    }

    /* The ceiling (as on the planner): an exception to the rule that keeps
       --bc-alarm for violations (spec, section 4). */
    .bc-dive-profile--ceiling-calc {
      stroke-dasharray: 4 3;
    }

    .bc-dive-profile--ceiling-area {
      fill: var(--bc-alarm);
      fill-opacity: 0.35;
    }

    .bc-dive-profile--ceiling-line {
      fill: none;
      stroke: var(--bc-alarm);
      stroke-width: var(--bc-profile-line-width);
    }

    .bc-dive-profile--tissue-limit {
      stroke: var(--bc-text-2);
      stroke-width: 1;
      stroke-dasharray: 3 3;
    }

    .bc-dive-profile--tissues {
      display: block;
      margin: 6px 12px 0;
      touch-action: pan-y;
    }

    .bc-dive-profile--temperature-label {
      font-size: 10px;
      fill: var(--bc-temperature);
    }

    /* Average depth: a thin dashed line across the whole profile, in the axis grey; 1 dp (task 2026-11-15-190). */
    .bc-dive-profile--mean {
      stroke: var(--bc-text-2);
      stroke-width: 1;
      stroke-dasharray: 4 3;
    }

    .bc-dive-profile--mean-label {
      font-size: 9px;
      fill: var(--bc-text-2);
    }

    /* Desktop (task 2026-11-15-185): the average depth, 1.2 dp dashes of 5 and gaps of 4 in blue. */
    .bc-dive-profile--mean-desk {
      stroke: var(--bc-profile-mean);
      stroke-width: 1.2;
      stroke-dasharray: 5 4;
    }

    .bc-dive-profile--mean-desk-label {
      font-size: 11px;
      fill: var(--bc-profile-mean);
    }

    /* The desktop app, in the tablet layout too: no sideways scrolling a mouse cannot do. */
    :global(html.bc-desktop-app) .bc-dive-profile--layers {
      flex-wrap: wrap;
      overflow-x: visible;
    }

    .bc-dive-profile--layers.bc-dive-profile--layers-desk {
      align-items: center;
      padding: 4px 12px 0;
      /* Fluid layout: in a narrow detail pane the curve buttons wrap on a second line instead of scrolling sideways. */
      flex-wrap: wrap;
      overflow-x: visible;
      row-gap: 0;
    }

    .bc-dive-profile--layers-desk .bc-dive-profile--filter {
      min-height: 40px;
    }

    .bc-dive-profile--enlarge {
      flex: none;
      margin-inline-start: auto;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }

    .bc-dive-profile--tick {
      font-size: 11px;
      fill: var(--bc-text-2);
    }

    /* Dark mode: an outline twice the line's width under it keeps it readable on the bright water. */
    .bc-dive-profile--trace-outline {
      fill: none;
      stroke: var(--bc-trace-outline);
      stroke-width: var(--bc-profile-halo-width);
      stroke-linejoin: round;
    }

    .bc-dive-profile--trace {
      fill: none;
      stroke: var(--bc-trace);
      stroke-width: var(--bc-profile-main-width, var(--bc-profile-line-width));
      stroke-linejoin: round;
    }

    .bc-dive-profile--cursor {
      stroke: var(--bc-cursor);
      stroke-width: 2;
      stroke-linecap: round;
    }

    /* Desktop hover (task 2026-11-15-169): a thin dashed line, a dot on the curve, a dark tooltip. */
    .bc-dive-profile--cursor-hover {
      stroke-width: 1;
      stroke-dasharray: 3 3;
    }
    .bc-dive-profile--depth-dot {
      fill: var(--bc-cursor);
      stroke: var(--bc-surface);
      stroke-width: 2;
    }
    .bc-dive-profile--tip {
      position: absolute;
      transform: translate(12px, -50%);
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--bc-inverse-surface);
      color: var(--bc-inverse-on-surface);
      font-size: 12px;
      line-height: 1.3;
      white-space: nowrap;
      pointer-events: none;
    }
    .bc-dive-profile--tip-left {
      transform: translate(calc(-100% - 12px), -50%);
    }

    .bc-dive-profile--temperature-dot {
      fill: var(--bc-temperature);
      stroke: var(--bc-block);
      stroke-width: 2;
    }

    .bc-dive-profile--gas {
      rect {
        fill: var(--bc-tint);
      }

      &.bc-dive-profile--oxygen rect {
        stroke: var(--bc-oxygen);
        stroke-width: 2;
      }

      text {
        font-size: 12px;
        fill: var(--bc-on-tint);
      }
    }

    .bc-dive-profile--layers {
      display: flex;
      flex-wrap: nowrap;
      gap: 8px;
      padding: 0 12px 4px;
      overflow-x: auto;
    }

    .bc-dive-profile--chip {
      --bc-curve: var(--bc-trace);
      gap: 8px;

      &:not(.bc-dive-profile--chip-outline) {
        padding-left: 8px;
      }

      /* Selected curve button: text, check and border in the colour of its curve. */
      &:not(.bc-dive-profile--chip-outline) {
        background: var(--bc-curve-chip-bg);
        color: var(--bc-curve);
        box-shadow: inset 0 0 0 var(--bc-curve-chip-border-width) var(--bc-curve);

        .chip-label {
          color: var(--bc-curve);
        }
      }
    }

    .bc-dive-profile--chip-temperature {
      --bc-curve: var(--bc-temperature);
    }

    .bc-dive-profile--chip-ppo2 {
      --bc-curve: var(--bc-oxygen);
    }

    .bc-dive-profile--chip-ceiling {
      --bc-curve: var(--bc-alarm);
    }

    .bc-dive-profile--filter {
      flex: none;
      width: auto;
      min-height: 48px;
      min-width: 48px;
      display: flex;
      align-items: center;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      font: inherit;
    }
  }

  /* Framework7's variable, outside the layers. */
  .bc-dive-profile--layers {
    --f7-chip-outline-border-color: var(--bc-chip-outline);

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-dive-profile--chip {
        transition: box-shadow 120ms linear;
      }
      .bc-dive-profile--filter:hover .bc-dive-profile--chip {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-dive-profile--chip {
        transition: none;
      }
    }
  }
</style>
