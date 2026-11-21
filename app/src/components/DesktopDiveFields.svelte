<script>
  // @ts-check
  // The fields of the desktop detail pane's tabs Informations, Équipement, Gaz and Notes, edited in
  // place (tasks 2026-11-15-172, 184, 191). Each field is a <DesktopEditField>; a value kept is written
  // at once through the same core edit function as the phone's editor (saveDiveChanges →
  // OpenDivesCore.editDive), one undoable step, so Ctrl/⌘+Z undoes it. What the dive computer
  // recorded is plain text, editable only on a dive logged by hand (lib/desktop-edit.js).
  import { untrack } from 'svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { cachedCylinderTypes, cachedPlannerSetup, cachedSites, cachedValues } from '../lib/core-cache.js';
  import DesktopEditField from './DesktopEditField.svelte';
  import DcTile from './DcTile.svelte';
  import { ownComputerPhoto } from '../lib/gear-photos.svelte.js';
  import ButtonGroup from './ButtonGroup.svelte';
  import DesktopWeights from './DesktopWeights.svelte';
  import DesktopOtherGear from './DesktopOtherGear.svelte';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import AddEquipmentSheet from './AddEquipmentSheet.svelte';
  import DesktopGasCards from './DesktopGasCards.svelte';
  import DesktopConsumption from './DesktopConsumption.svelte';
  import SiteMap from './SiteMap.svelte';
  import Icon from './Icon.svelte';
  import { logbook, saveDiveChanges, isSubscriber } from '../lib/logbook.svelte.js';
  import { isRelease } from '../lib/edition.js';
  import { loadInventory, change as changeInventory, equipmentOf, gear, gearMap } from '../lib/inventory.svelte.js';
  import { diveKeyOf, removeFromEquipment, sameEquipment } from '../lib/inventory.js';
  import { siteChange } from '../lib/sites.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { cylinderChanges, fieldChanges, fieldValue, parseTyped, pressureMbarOf, siteChoice, weightChanges, weightText } from '../lib/desktop-edit.js';
  import { FEEDBACK_CHOICES, feedbackOf, withFeedback, withoutFeedbackTags } from '../lib/weight-feedback.js';
  import { WATER_TYPES, waterTypeName } from '../lib/tools.js';
  import { computerList } from '../lib/gas-summary.js';
  import { useKey } from '../lib/cylinder-use.js';
  import { formatCylinderSize, formatNumber, formatPressure, formatTemperature } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';
  import { computerRole, consumption, cylinderSpan, gasCards, gasText, parseGas, parsePressurePair } from '../lib/desktop-detail.js';
  import { formatCoordinates } from '../lib/sites.svelte.js';
  import { focusSite } from '../lib/site-focus.svelte.js';
  import { goToSection } from '../lib/navigation.svelte.js';
  import { cylinderTypeLabel } from '../lib/cylinder-types.js';

  /**
   * `tab`: 'info', 'equipment', 'gas', 'notes' or 'map'. `location` and `trip` are the read-only lines of
   * the Informations tab; `sac` and `gasChanges` those of the Gaz tab.
   * @type {{
   *   dive: import('opendives-core').DiveDetail,
   *   tab: 'info'|'equipment'|'gas'|'notes'|'map',
   *   prefs: import('opendives-core').Prefs,
   *   trip?: string,
   *   sac?: string,
   *   gasChanges?: string,
   * }}
   */
  let { dive, tab, prefs, trip = '', sac = '', gasChanges = '' } = $props();

  // « Autre équipement »: in the release edition the pieces of the device's inventory used by this dive
  // (the same record as the phone's editor); in the alpha the list stays inert.
  const equipment = $derived(isRelease && gear.ready ? equipmentOf(dive) : null);
  const otherItems = $derived(
    equipment
      ? [
          ...equipment.gearIds.flatMap((id) => {
            const g = gearMap().get(id);
            return g ? [{ id: `g:${id}`, name: g.name, type: g.type }] : [];
          }),
          ...equipment.adhoc.map((p) => ({ id: `a:${p.id}`, name: p.name, type: /** @type {'other'} */ ('other') })),
        ]
      : [],
  );
  const plus = $derived(isSubscriber());
  let addingGear = $state(false);
  /** @param {import('../lib/inventory.js').DiveEquipment} next */
  async function saveEquipment(next) {
    if (!equipment || sameEquipment(next, equipment)) return;
    try {
      await changeInventory((inv) => inv.saveDiveEquipment(diveKeyOf(dive), next));
    } catch (e) {
      console.error('Dive equipment', e);
      showSnackbar(t('desktopDetail.otherGearFailed'));
    }
  }
  /** @param {string} id */
  function removeGear(id) {
    if (!equipment) return;
    saveEquipment(id.startsWith('g:') ? removeFromEquipment(equipment, { gearId: id.slice(2) }) : removeFromEquipment(equipment, { adhocId: id.slice(2) }));
  }
  $effect(() => {
    if (isRelease && tab === 'equipment') untrack(() => loadInventory().catch((e) => console.error('Inventory', e)));
  });

  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  let known = $state({ buddy: /** @type {{ key: string, dives: number }[]} */ ([]), guide: /** @type {{ key: string, dives: number }[]} */ ([]), tag: /** @type {{ key: string, dives: number }[]} */ ([]) });
  let cylinderTypes = $state(/** @type {{ name: string, ml: number, workingPressureMbar: number }[]} */ ([]));

  // Answers that do not depend on the dive come from lib/core-cache.js (one call for all the panes and
  // dives, read again after a change) and are read when a tab needs them, not for each dive shown.
  /** @param {'buddy'|'guide'|'tag'} field */
  async function loadValues(field) {
    try {
      /** @type {{ key: string, dives: number }[]} */
      const values = await cachedValues(field);
      known[field] = withoutFeedbackTags(values.filter((v) => v.key));
    } catch (e) {
      console.error('Logbook values', field, e);
    }
  }
  async function loadSites() {
    try {
      sites = await cachedSites();
    } catch (e) {
      console.error('Sites', e);
    }
  }
  /** The planner's reserve, for the Consommation card's mark; 0 until read. */
  let reserveMbar = $state(0);
  function loadReserve() {
    cachedPlannerSetup()
      .then((/** @type {{ reserveMbar?: number }} */ setup) => (reserveMbar = Number(setup?.reserveMbar) || 0))
      .catch((/** @type {unknown} */ e) => console.error('Planner setup', e));
  }
  function loadCylinderTypes() {
    cachedCylinderTypes()
      .then((/** @type {import('opendives-core').GasCylinderTypes} */ list) => (cylinderTypes = list.types))
      .catch((/** @type {unknown} */ e) => console.error('Cylinder types', e));
  }
  // Each tab reads what it shows when it is first shown; the cache makes a second tab or dive free.
  /** @type {Set<string>} */
  const needed = new Set();
  let neededFor = -1;
  $effect(() => {
    const shown = tab;
    const version = logbook.sitesVersion; // sites merged, renamed or deleted: read again
    untrack(() => {
      if (version !== neededFor) needed.clear();
      neededFor = version;
      /** @param {string} key @param {() => void} load */
      const once = (key, load) => {
        if (!needed.has(key)) {
          needed.add(key);
          load();
        }
      };
      if (shown === 'info' || shown === 'map') once('sites', loadSites);
      if (shown === 'info') {
        once('buddy', () => loadValues('buddy'));
        once('guide', () => loadValues('guide'));
      }
      if (shown === 'notes') once('tag', () => loadValues('tag'));
      if (shown === 'equipment' || shown === 'gas') once('cylinders', loadCylinderTypes);
      if (shown === 'gas') once('reserve', loadReserve);
    });
  });

  /** @param {unknown} e */
  function failure(e) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('Edit in place', code);
    showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : code.startsWith('CYLINDER_IN_USE') ? t('edit.cylinderInUse') : t('desktop.changeFailed'));
  }

  /**
   * Writes changes to this dive (one undoable step) and reads the list again so that the table shows
   * them. Returns false when it failed (the field goes back to its value).
   * @param {Record<string, string|number|string[]>} changes
   */
  async function write(changes) {
    try {
      await saveDiveChanges(dive.id, changes);
      logbook.dives = await OpenDivesCore.listLoadedDives();
      return true;
    } catch (e) {
      failure(e);
      return false;
    }
  }

  /**
   * A field kept: what it changes, then written. Unchanged: nothing is written.
   * @param {string} key
   * @param {string|string[]|number} value
   */
  async function save(key, value) {
    const result = fieldChanges(dive, key, value, prefs);
    if (!result.ok) {
      showSnackbar(t(result.error === 'readonly' ? 'desktopDetail.readOnly' : 'desktopDetail.invalid'));
      return false;
    }
    if (!result.changes) return true;
    const ok = await write(result.changes);
    if (ok && (key === 'buddies' || key === 'guides' || key === 'tags')) loadValues(key === 'buddies' ? 'buddy' : key === 'guides' ? 'guide' : 'tag');
    return ok;
  }

  /** @param {string} name */
  async function saveSite(name) {
    const choice = siteChoice(name, dive.site, sites);
    if (choice.action === 'none') return true;
    let steps = 1;
    try {
      let uuid = 0;
      if (choice.action === 'existing') uuid = choice.uuid;
      else if (choice.action === 'create') {
        const created = await siteChange({ action: 'create', value: choice.name });
        steps++;
        uuid = created.site?.uuid ?? 0;
      }
      const ok = await write({ site: uuid });
      if (ok && steps > 1) offerUndo(t('edit.saved'), undefined, 6000, steps);
      loadSites();
      return ok;
    } catch (e) {
      failure(e);
      return false;
    }
  }

  const waterOptions = $derived(WATER_TYPES.map((water) => ({ value: water.id, label: waterTypeName(water.id) })));
  const waterValue = $derived(/** @type {string} */ (fieldValue(dive, 'waterType', prefs)) || dive.waterType || '');
  const computers = $derived(computerList(dive.diveComputers));
  const manual = $derived(!!dive.manual);

  const depthUnitText = $derived(prefs.length === 'ft' ? t('units.feet') : t('units.meters'));
  const temperatureUnitText = $derived(prefs.temperature === 'F' ? t('units.fahrenheit') : t('units.celsius'));

  /** Live check of a number typed in a field. @param {string} key */
  const checker = (key) => (/** @type {string} */ text) => fieldChanges(dive, key, text, prefs).ok;

  // --- Équipement: the weights, « Ce lest était ». -----------------------------------------------
  /** @param {{ description: string, text: string, grams0: number, text0: string }[]} rows */
  async function saveWeights(rows) {
    const result = weightChanges(dive, rows, prefs);
    if (!result.ok) {
      showSnackbar(t('desktopDetail.invalid'));
      return false;
    }
    return result.changes ? write(result.changes) : true;
  }
  const feedback = $derived(feedbackOf(dive.tags));
  const feedbackOptions = $derived(FEEDBACK_CHOICES.map((value) => ({ value, label: t(`weightFeedback.${value === 'too-light' ? 'tooLight' : value === 'ok' ? 'ok' : 'tooHeavy'}`) })));
  /** @param {string} value */
  const saveFeedback = (value) => write({ tags: withFeedback(dive.tags, /** @type {import('../lib/weight-feedback.js').WeightFeedback|''} */ (value)) });

  // --- Gaz: the cylinders. ----------------------------------------------------------------------
  const cylinderRows = $derived(dive.cylinders.map((_, index) => ({ index, patch: /** @type {Record<string, string|number>} */ ({}) })));
  const USES = ['OC-gas', 'diluent', 'oxygen', 'not used'];
  const useOptions = $derived(USES.map((value) => ({ value, label: t(useKey(value, dive.divemode)) })));
  /** @param {{ index: number, patch: Record<string, string|number> }[]} rows */
  async function saveCylinders(rows) {
    const result = cylinderChanges(dive, rows);
    if (!result.ok) {
      showSnackbar(t(result.error === 'readonly' ? 'desktopDetail.readOnly' : 'desktopDetail.invalid'));
      return false;
    }
    return result.changes ? write(result.changes) : true;
  }
  /** One cylinder's field changed. @param {number} index @param {Record<string, string|number>} patch */
  const saveCylinder = (index, patch) => saveCylinders(cylinderRows.map((r) => (r.index === index ? { ...r, patch } : r)));
  const addCylinder = () => saveCylinders([...cylinderRows, { index: -1, patch: {} }]);
  /** @param {number} index */
  const removeCylinder = (index) => saveCylinders(cylinderRows.filter((r) => r.index !== index));
  /** @param {number} from @param {number} step */
  function moveCylinder(from, step) {
    const to = from + step;
    if (to < 0 || to >= cylinderRows.length) return;
    const rows = [...cylinderRows];
    [rows[from], rows[to]] = [rows[to], rows[from]];
    return saveCylinders(rows);
  }
  /** @param {import('opendives-core').Cylinder} c */
  const typeOptions = (c) => {
    const list = cylinderTypes.map((x) => ({ value: x.name, label: cylinderTypeLabel(x.name) }));
    if (c.description && !list.some((o) => o.value === c.description)) list.unshift({ value: c.description, label: cylinderTypeLabel(c.description) });
    return list;
  };
  /** @param {number} index @param {string} name */
  function chooseType(index, name) {
    const type = cylinderTypes.find((x) => x.name === name);
    return saveCylinder(index, type ? { description: name, sizeMl: type.ml, workingPressureMbar: type.workingPressureMbar } : { description: name });
  }
  /** The mix of a cylinder: always both parts, as the phone's editor sends them. @param {number} index @param {import('opendives-core').Cylinder} c @param {{ o2?: string, he?: string }} typed */
  function saveGas(index, c, typed) {
    const o2 = typed.o2 !== undefined ? parseTyped(typed.o2) * 10 : c.o2Permille || 210;
    const he = typed.he !== undefined ? parseTyped(typed.he) * 10 : c.hePermille;
    return saveCylinder(index, { o2Permille: Math.round(o2), hePermille: Math.round(he) });
  }
  /** A percentage as typed back. @param {number} permille */
  const percentText = (permille) => String(Number((permille / 10).toFixed(1))).replace('.', ',');
  /** @param {string} text @param {number} lo @param {number} hi */
  const percentOk = (text, lo, hi) => {
    const v = parseTyped(text);
    return v >= lo && v <= hi;
  };
  /** Pressure as typed back, in the diver's unit. @param {number} mbar */
  const pressureText = (mbar) => (mbar ? String(Number((prefs.pressure === 'psi' ? mbar / 68.9476 : mbar / 1000).toFixed(0))) : '');
  /** @param {number} index @param {'startMbar'|'endMbar'} field @param {string} text */
  function savePressure(index, field, text) {
    const mbar = text.trim() ? pressureMbarOf(text, prefs) : 0;
    if (Number.isNaN(mbar)) return false;
    return saveCylinder(index, { [field]: mbar });
  }
  const pressureUnitText = $derived(prefs.pressure === 'psi' ? t('units.psi') : t('units.bar'));

  /** The selected cylinder of the Gaz tab; kept inside the list when the dive changes. */
  let selectedCylinder = $state(0);
  const cylinderIndex = $derived(Math.min(Math.max(selectedCylinder, 0), Math.max(dive.cylinders.length - 1, 0)));
  const cards = $derived(gasCards(dive.cylinders, prefs));
  const chosen = $derived(dive.cylinders[cylinderIndex]);
  const used = $derived(consumption(dive, cylinderIndex, prefs, reserveMbar));
  const span = $derived(cylinderSpan(dive.samples, cylinderIndex));
  const cylinderSub = $derived(chosen ? ' · ' + [t(useKey(chosen.use, dive.divemode)), span ? t('desktopDetail.cylinderSpan', { from: span.fromMin, to: span.toMin }) : ''].filter(Boolean).join(', ') : '');
  async function addCylinderAndSelect() {
    const ok = await addCylinder();
    if (ok) selectedCylinder = dive.cylinders.length;
  }
  /** The mix typed in Mélange. @param {number} index @param {string} text */
  function saveMix(index, text) {
    const mix = parseGas(text);
    return mix ? saveCylinder(index, mix) : false;
  }
  /** The pressures typed in Pression (a dive logged by hand). @param {number} index @param {string} text */
  function savePair(index, text) {
    const pair = parsePressurePair(text);
    if (!pair) return false;
    const mbar = (/** @type {number} */ v) => (v ? pressureMbarOf(String(v), prefs) : 0);
    return saveCylinder(index, { startMbar: mbar(pair.start), endMbar: mbar(pair.end) });
  }
  /** « 232 → 70 » as the Pression field holds it. @param {import('opendives-core').Cylinder} c */
  const pairText = (c) => (c.startMbar ? `${pressureText(c.startMbar)}${c.endMbar ? ` → ${pressureText(c.endMbar)}` : ''}` : '');
  const pairOk = (/** @type {string} */ text) => !text.trim() || parsePressurePair(text) !== null;
  const mixOk = (/** @type {string} */ text) => parseGas(text) !== null;

  // --- Informations and Carte: the site card. -------------------------------------------------
  const siteRow = $derived(sites.find((x) => x.name === dive.site));
  const country = $derived(dive.siteLocation?.country || siteRow?.country || '');
  const siteNote = $derived([country, siteRow ? t('desktopDetail.diveCount', { n: siteRow.dives }) : ''].filter(Boolean).join(' · '));
  /** Opens the Sites section on this dive's site. */
  function openSite() {
    if (!siteRow) return;
    focusSite(siteRow.uuid);
    goToSection('sites');
  }

  /** Ctrl/⌘+E: the first editable field of the tab takes the focus (and starts its edit). */
  let root = $state(/** @type {HTMLElement|undefined} */ (undefined));
  $effect(() => {
    const focusFirst = () => /** @type {HTMLElement|null|undefined} */ (root?.querySelector('.bc-desktop-edit-field--rest'))?.focus();
    window.addEventListener('od-detail-focus-first', focusFirst);
    return () => window.removeEventListener('od-detail-focus-first', focusFirst);
  });
</script>

<div class="bc-desktop-dive-fields" bind:this={root}>
  <p class="bc-desktop-dive-fields--hint">{t('desktopDetail.fieldsHint')}</p>

  {#if tab === 'info'}
    <!-- Informations (mock-up bureau-carnet-colonnes): the site card, then two columns with the label above. -->
    <div class="bc-desktop-dive-fields--stack">
      <DesktopEditField card name="site" kind="site" label={t('desktopDetail.label.site')} value={dive.site} invitation={t('desktopDetail.invitation.site')} note={siteNote} known={sites.map((s) => ({ key: s.name, dives: s.dives }))} newLabel={t('desktopDetail.newSite')} onopen={siteRow ? openSite : undefined} openLabel={t('desktopDetail.openSite')} onsave={(v) => saveSite(/** @type {string} */ (v))} />
      <div class="bc-desktop-dive-fields--columns">
        <DesktopEditField stacked name="buddies" kind="list" label={t('desktopDetail.label.buddies')} value={dive.buddies} invitation={t('desktopDetail.invitation.buddies')} known={known.buddy} newLabel={t('desktopDetail.newBuddy')} onsave={(v) => save('buddies', v)} />
        <DesktopEditField stacked name="guides" kind="list" label={t('desktopDetail.label.guides')} value={dive.guides} invitation={t('desktopDetail.invitation.guides')} known={known.guide} newLabel={t('desktopDetail.newGuide')} onsave={(v) => save('guides', v)} />
        <DesktopEditField stacked name="waterType" kind="choice" label={t('desktopDetail.label.waterType')} value={waterValue} invitation={t('edit.notSet')} options={waterOptions} onsave={(v) => save('waterType', String(v))} />
        <DesktopEditField stacked name="visibility" kind="stars" label={t('desktopDetail.label.visibility')} value={dive.visibility} emptyText={t('desktopDetail.notRated')} invitation={t('desktopDetail.invitation.visibility')} onsave={(v) => save('visibility', v)} />
        <DesktopEditField stacked name="surfacePressure" kind="text" label={t('desktopDetail.label.surfacePressure')} value={fieldValue(dive, 'surfacePressure', prefs)} unit="mbar" invitation={t('desktopDetail.invitation.surfacePressure')} valid={checker('surfacePressure')} onsave={(v) => save('surfacePressure', v)} />
        {#if manual}
          <!-- A dive logged by hand has no recorded values: they are edited like the others. -->
          <DesktopEditField stacked name="maxDepth" kind="text" label={t('desktopDetail.label.maxDepth')} value={fieldValue(dive, 'maxDepth', prefs)} unit={depthUnitText} invitation={t('desktopDetail.invitation.maxDepth')} valid={checker('maxDepth')} onsave={(v) => save('maxDepth', v)} />
          <DesktopEditField stacked name="duration" kind="text" label={t('desktopDetail.label.duration')} value={fieldValue(dive, 'duration', prefs)} unit={t('units.minutes')} invitation={t('desktopDetail.invitation.duration')} valid={checker('duration')} onsave={(v) => save('duration', v)} />
          <DesktopEditField stacked name="waterTemp" kind="text" label={t('desktopDetail.label.waterTemp')} value={fieldValue(dive, 'waterTemp', prefs)} unit={temperatureUnitText} invitation={t('desktopDetail.invitation.waterTemp')} valid={checker('waterTemp')} onsave={(v) => save('waterTemp', v)} />
          <DesktopEditField stacked name="airTemp" kind="text" label={t('desktopDetail.label.airTemp')} value={fieldValue(dive, 'airTemp', prefs)} unit={temperatureUnitText} invitation={t('desktopDetail.invitation.airTemp')} valid={checker('airTemp')} onsave={(v) => save('airTemp', v)} />
        {:else}
          <!-- What the dive computer recorded: plain text, no field. -->
          {#if dive.airTempMk}<DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.airTemp')} value={formatTemperature(dive.airTempMk, prefs)} />{/if}
          {#if dive.waterTempMk}<DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.waterTemp')} value={formatTemperature(dive.waterTempMk, prefs)} />{/if}
        {/if}
        <DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.mode')} value={tIfExists(`detail.modes.${dive.divemode}`) ?? dive.divemode} />
        {#if dive.cns > 0}<DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.cns')} value={`${formatNumber(dive.cns, 0)} %`} />{/if}
        {#if dive.otu > 0}<DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.otu')} value={formatNumber(dive.otu, 0)} />{/if}
        {#if trip}<DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.trip')} value={trip} />{/if}
      </div>
    </div>
  {:else if tab === 'equipment'}
    <!-- Équipement (mock-up bureau-carnet-onglet-equipement). -->
    <h3 class="bc-desktop-dive-fields--heading">{t('desktopDetail.section.computers')}</h3>
    {#snippet noComputerPhoto()}{/snippet}
    {#each dive.diveComputers ?? [] as dc, i (i)}
      <DesktopEditField name="computer" kind="text" readonly label={computerRole(i)} value={dc.nickname || dc.model} display={[dc.nickname || dc.model, dc.serial ? t('desktopDetail.serial', { serial: dc.serial }) : ''].filter(Boolean).join(' · ')}>
        {#snippet leading()}
          {#if dc.model}<DcTile model={dc.model} size={32} radius={8} photo={ownComputerPhoto(dc.model, dc.serial)} fallback={dive.diveComputers?.length === 1 ? noComputerPhoto : undefined} />{/if}
        {/snippet}
      </DesktopEditField>
    {/each}
    <!-- Computers join a dive when it is downloaded: nothing to type here. -->
    <DesktopEditField name="computer-add" kind="text" disabled label={computerRole(computers.length)} value="" invitation={t('desktopDetail.addComputer')} />

    <h3 class="bc-desktop-dive-fields--heading">{t('desktopDetail.section.protection')}</h3>
    <DesktopEditField name="suit" kind="text" label={t('desktopDetail.label.suit')} value={dive.suit ?? ''} invitation={t('desktopDetail.invitation.suit')} onsave={(v) => save('suit', v)} />
    <div class="bc-desktop-dive-fields--row" data-field="weights">
      <span class="bc-desktop-dive-fields--row-label">{t('desktopDetail.label.weights')}</span>
      <DesktopWeights weights={dive.weights ?? []} {prefs} label={t('desktopDetail.label.weights')} onsave={(rows) => saveWeights(rows)} />
    </div>
    {#if dive.weights?.some((w) => w.grams > 0)}
      <div class="bc-desktop-dive-fields--row">
        <span class="bc-desktop-dive-fields--row-label" id="od-df-feedback">{t('weightFeedback.title')}</span>
        <ButtonGroup options={feedbackOptions} value={feedback} onchange={(v) => saveFeedback(v)} ariaLabelledby="od-df-feedback" clearable rail />
      </div>
    {/if}

    <h3 class="bc-desktop-dive-fields--heading">{t('desktopDetail.section.otherGear')}{#if equipment && !plus}<BenthicPlusChip onLight />{/if}</h3>
    {#if equipment && plus}
      <DesktopOtherGear items={otherItems} onadd={() => (addingGear = true)} onremove={removeGear} />
      <AddEquipmentSheet opened={addingGear} {equipment} onclose={() => (addingGear = false)} onadd={(next) => saveEquipment(next)} />
    {:else if equipment}
      <!-- Without an OpenDives+ account the list shows, with the chip, and cannot change. -->
      <DesktopOtherGear items={otherItems} locked />
    {:else}
      <!-- Alpha edition: the list is not stored anywhere. -->
      <DesktopOtherGear />
    {/if}
  {:else if tab === 'gas'}
    <!-- Gaz (mock-up bureau-carnet-onglet-gaz): one card per cylinder, the selected one's fields, Consommation. -->
    <div class="bc-desktop-dive-fields--card">
      <DesktopGasCards {cards} selected={cylinderIndex} onselect={(i) => (selectedCylinder = i)} onadd={addCylinderAndSelect} />
      {#if chosen}
        <header class="bc-desktop-dive-fields--cylinder-head">
          <p class="bc-desktop-dive-fields--cylinder-title">{t('desktopDetail.cylinder', { n: cylinderIndex + 1 })}<span class="bc-desktop-dive-fields--cylinder-sub">{cylinderSub}</span></p>
          <button type="button" class="bc-desktop-dive-fields--icon" aria-label={t('desktopDetail.moveUp')} title={t('desktopDetail.moveUp')} disabled={cylinderIndex === 0} onclick={async () => { if (await moveCylinder(cylinderIndex, -1)) selectedCylinder = cylinderIndex - 1; }}><Icon name="arrowUp" size={20} /></button>
          <button type="button" class="bc-desktop-dive-fields--icon" aria-label={t('desktopDetail.moveDown')} title={t('desktopDetail.moveDown')} disabled={cylinderIndex === dive.cylinders.length - 1} onclick={async () => { if (await moveCylinder(cylinderIndex, 1)) selectedCylinder = cylinderIndex + 1; }}><Icon name="arrowDown" size={20} /></button>
          <button type="button" class="bc-desktop-dive-fields--icon" aria-label={t('desktopDetail.removeCylinder')} title={chosen.protected ? t('edit.cylinderInUse') : t('desktopDetail.removeCylinder')} disabled={chosen.protected} onclick={() => removeCylinder(cylinderIndex)}><Icon name="delete" size={20} /></button>
        </header>
        {#key cylinderIndex}
          <DesktopEditField name="cylinder-type" kind="choice" label={t('desktopDetail.label.cylinderType')} value={chosen.description} options={typeOptions(chosen)} note={[chosen.sizeMl ? formatCylinderSize(chosen.sizeMl, chosen.workingPressureMbar, prefs) : '', chosen.workingPressureMbar ? formatPressure(chosen.workingPressureMbar, prefs) : ''].filter(Boolean).join(' · ')} invitation={t('desktopDetail.invitation.cylinderType')} onsave={(v) => chooseType(cylinderIndex, /** @type {string} */ (v))} />
          <DesktopEditField name="cylinder-mix" kind="text" label={t('desktopDetail.label.mix')} value={gasText(chosen.o2Permille, chosen.hePermille)} display={cards[cylinderIndex]?.gas} note={t('desktopDetail.mixNote', { o2: percentText(chosen.o2Permille || 210), he: percentText(chosen.hePermille) })} invitation={t('desktopDetail.invitation.mix')} valid={mixOk} onsave={(v) => saveMix(cylinderIndex, /** @type {string} */ (v))} />
          {#if manual}
            <DesktopEditField name="cylinder-pressure" kind="text" label={t('desktopDetail.label.pressure')} value={pairText(chosen)} display={chosen.startMbar ? cards[cylinderIndex]?.range : ''} note={t('desktopDetail.pressureNote')} invitation={t('desktopDetail.invitation.pressure')} valid={pairOk} onsave={(v) => savePair(cylinderIndex, /** @type {string} */ (v))} />
          {:else}
            <DesktopEditField name="cylinder-pressure" kind="text" readonly label={t('desktopDetail.label.pressure')} value={cards[cylinderIndex]?.range ?? ''} />
          {/if}
          <DesktopEditField name="cylinder-use" kind="choice" label={t('desktopDetail.label.use')} value={chosen.use} options={useOptions} onsave={(v) => saveCylinder(cylinderIndex, { use: /** @type {string} */ (v) || 'OC-gas' })} />
        {/key}
      {/if}
    </div>
    <DesktopConsumption data={used} />
    {#if gasChanges}<DesktopEditField kind="text" readonly label={t('desktopDetail.label.gasChanges')} value={gasChanges} />{/if}
  {:else if tab === 'notes'}
    <!-- Notes (mock-up bureau-carnet-onglet-notes): the rating, the notes, the tags. -->
    <DesktopEditField name="rating" kind="stars" label={t('desktopDetail.label.rating')} value={dive.rating} emptyText={t('desktopDetail.notRated')} invitation={t('desktopDetail.invitation.rating')} onsave={(v) => save('rating', v)} />
    <DesktopEditField name="notes" kind="multiline" label={t('desktopDetail.label.notes')} value={dive.notes} invitation={t('desktopDetail.invitation.notes')} onsave={(v) => save('notes', v)} />
    <DesktopEditField name="tags" kind="list" label={t('desktopDetail.label.tags')} value={/** @type {string[]} */ (fieldValue(dive, 'tags', prefs))} invitation={t('desktopDetail.invitation.tags')} known={known.tag} newLabel={t('desktopDetail.newTag')} onsave={(v) => save('tags', v)} />
  {:else if tab === 'map'}
    <!-- Carte (mock-up bureau-carnet-onglet-carte): the map keeps its height, then the site and its position. -->
    {#if dive.siteCoordinates}
      <div class="bc-desktop-dive-fields--map"><SiteMap pin={dive.siteCoordinates} height="300px" /></div>
    {:else}
      <p class="bc-desktop-dive-fields--no-map">{t('desktop.noMap')}</p>
    {/if}
    <DesktopEditField name="site" kind="site" label={t('desktopDetail.label.site')} value={dive.site} invitation={t('desktopDetail.invitation.site')} note={country} known={sites.map((s) => ({ key: s.name, dives: s.dives }))} newLabel={t('desktopDetail.newSite')} onsave={(v) => saveSite(/** @type {string} */ (v))} />
    {#if dive.siteCoordinates}
      <DesktopEditField kind="text" readonly label={t('desktopDetail.label.coordinates')} value={formatCoordinates(dive.siteCoordinates.latUdeg, dive.siteCoordinates.lonUdeg)} />
    {/if}
    {#if siteRow}<button type="button" class="bc-desktop-dive-fields--link" onclick={openSite}>{t('desktopDetail.openSiteLink')}</button>{/if}
  {/if}
</div>

<style>
  @layer od.components {
    .bc-desktop-dive-fields {
      display: flex;
      flex-direction: column;
      margin: 0 24px 24px;
    }

    /* One line above the fields: the grey ones can be edited with a click. */
    .bc-desktop-dive-fields--hint {
      margin: 16px 0 12px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-desktop-dive-fields--heading :global(.bc-plus-chip) {
      margin-inline-start: 10px;
      vertical-align: middle;
      letter-spacing: 0;
      text-transform: none;
    }

    .bc-desktop-dive-fields--stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    /* Two columns that follow the pane's width: one column when it is narrow. */
    .bc-desktop-dive-fields--columns {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
      gap: 12px 16px;
      min-width: 0;
    }

    .bc-desktop-dive-fields--cell {
      display: grid;
      row-gap: 4px;
      align-content: start;
      min-width: 0;
    }

    .bc-desktop-dive-fields--cell-label {
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-desktop-dive-fields--heading {
      margin: 18px 0 8px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--bc-text-2);
    }

    .bc-desktop-dive-fields--row {
      display: grid;
      grid-template-columns: 140px minmax(0, 1fr);
      align-items: start;
      column-gap: 12px;
      margin-bottom: 8px;
    }

    .bc-desktop-dive-fields--row-label {
      min-height: 40px;
      display: flex;
      align-items: center;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-desktop-dive-fields--card {
      margin-top: 12px;
      padding: 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      border: 1px solid var(--bc-surface-container-highest);
    }

    .bc-desktop-dive-fields--cylinder-head {
      display: flex;
      align-items: center;
      gap: 2px;
      margin: 12px 0 8px;
    }

    .bc-desktop-dive-fields--cylinder-title {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .bc-desktop-dive-fields--cylinder-sub {
      font-weight: 400;
      color: var(--bc-text-2);
    }

    /* The map keeps its height: it never shrinks in the pane. */
    .bc-desktop-dive-fields--map {
      flex: none;
      height: 300px;
      margin-bottom: 8px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--bc-surface-container-highest);
    }

    .bc-desktop-dive-fields--no-map {
      margin: 8px 0 12px;
      color: var(--bc-text-2);
    }

    .bc-desktop-dive-fields--link {
      align-self: flex-start;
      width: auto;
      min-height: 40px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--bc-code-active);
      font: inherit;
      font-size: 14px;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }

    .bc-desktop-dive-fields--icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-text-2);
      cursor: pointer;
    }

    .bc-desktop-dive-fields--icon:hover:not(:disabled) {
      background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      color: var(--bc-text);
    }

    .bc-desktop-dive-fields--icon:disabled {
      opacity: 0.38;
      cursor: default;
    }
  }
</style>
