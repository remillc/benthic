<script>
  // @ts-check
  // The fields of the desktop detail pane's tabs Informations, Équipement, Gaz and Notes, edited in
  // place (tasks 2026-11-15-172, 184, 191). Each field is a <DesktopEditField>; a value kept is written
  // at once through the same core edit function as the phone's editor (saveDiveChanges →
  // BenthicCore.editDive), one undoable step, so Ctrl/⌘+Z undoes it. What the dive computer
  // recorded is plain text, editable only on a dive logged by hand (lib/desktop-edit.js).
  import { untrack } from 'svelte';
  import { cachedCylinderTypes, cachedPlannerSetup, cachedSites, cachedValues } from '../lib/core-cache.js';
  import DesktopEditField from './DesktopEditField.svelte';
  import DcTile from './DcTile.svelte';
  import { ownComputerPhoto } from '../lib/gear-photos.svelte.js';
  import ButtonGroup from './ButtonGroup.svelte';
  import DesktopWeights from './DesktopWeights.svelte';
  import DesktopOtherGear from './DesktopOtherGear.svelte';
  import DesktopEquipmentCard from './DesktopEquipmentCard.svelte';
  import DesktopChipsField from './DesktopChipsField.svelte';
  import DesktopStarsRow from './DesktopStarsRow.svelte';
  import GearIcon from './GearIcon.svelte';
  import AddEquipmentSheet from './AddEquipmentSheet.svelte';
  import DesktopGasCards from './DesktopGasCards.svelte';
  import DesktopSegments from './DesktopSegments.svelte';
  import DesktopKitField from './DesktopKitField.svelte';
  import DesktopPickField from './DesktopPickField.svelte';
  import DiveDateTimeDialogs from './DiveDateTimeDialogs.svelte';
  import DiveSignatures from './DiveSignatures.svelte';
  import DesktopConsumption from './DesktopConsumption.svelte';
  import SiteMap from './SiteMap.svelte';
  import Icon from './Icon.svelte';
  import { logbook, saveDiveChanges, isSubscriber } from '../lib/logbook.svelte.js';
  import { layout } from '../lib/layout.svelte.js';
  import { isRelease } from '../lib/edition.js';
  import { loadInventory, change as changeInventory, equipmentOf, gear, gearMap, visibleGear } from '../lib/inventory.svelte.js';
  import { applyKit, cloneEquipment, diveKeyOf, equipmentIsEmpty, removeFromEquipment, sameEquipment } from '../lib/inventory.js';
  import { BenthicCore } from 'benthic-core';
  import { openOver } from '../lib/navigation.svelte.js';
  import { siteChange } from '../lib/sites.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { cylinderChanges, fieldChanges, fieldValue, parseTyped, pressureMbarOf, siteChoice, weightChanges, weightText } from '../lib/desktop-edit.js';
  import { FEEDBACK_CHOICES, feedbackOf, withFeedback, withoutFeedbackTags } from '../lib/weight-feedback.js';
  import { WATER_TYPES, waterTypeName } from '../lib/tools.js';
  import { computerList } from '../lib/gas-summary.js';
  import { useKey } from '../lib/cylinder-use.js';
  import { formatCylinderSize, formatNumber, formatPressure, formatTemperature } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { computerRole, consumption, cylinderSpan, diveTypeOptions, gasCards, gasText, gasTiles, knownMode, parseGas, parsePressurePair, setpointsOf, weightChips } from '../lib/desktop-detail.js';
  import { KIT_MANAGE, KIT_PREVIOUS, kitMenuOptions } from '../lib/detail-pick.js';
  import { copyEquipment } from '../lib/inventory.js';
  import { formatDiveDay, formatTimeOfDay } from '../lib/format.js';
  import { benthicPlusSubscriber } from '../lib/benthic-plus-state.svelte.js';
  import { formatCoordinates } from '../lib/sites.svelte.js';
  import { focusSite } from '../lib/site-focus.svelte.js';
  import { goToSection } from '../lib/navigation.svelte.js';
  import { cylinderTypeLabel } from '../lib/cylinder-types.js';

  /**
   * `tab`: 'info', 'equipment', 'gas', 'notes' or 'map'. `location` and `trip` are the read-only lines of
   * the Informations tab; `sac` and `gasChanges` those of the Gaz tab.
   * @type {{
   *   dive: import('benthic-core').DiveDetail,
   *   tab: 'info'|'equipment'|'gas'|'notes'|'map',
   *   prefs: import('benthic-core').Prefs,
   *   trip?: string,
   *   sac?: string,
   *   gasChanges?: string,
   *   preview?: boolean,
   *   onsign?: () => void,
   *   hint?: boolean,
   * }}
   * `onsign`: « Faire signer » of the Signatures card. `hint`: the line above the fields (the phone's page shows it once).
   */
  let { dive, tab, prefs, trip = '', sac = '', gasChanges = '', preview = false, onsign = () => {}, hint = true } = $props();

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
  // Benthic+ only (tasks 2026-11-22-332 and 333): without it the kit, the undersuit, « Ce lest était » and « Autre équipement »
  // are not in the tab at all.
  const plus = $derived(isSubscriber());
  const undersuits = $derived(visibleGear().filter((g) => g.type === 'undersuit'));
  const undersuitOptions = $derived(undersuits.map((g) => ({ value: g.id, label: g.name })));
  /** The dive that comes just before this one in the logbook: « Plongée précédente » copies its equipment. */
  const previousDive = $derived(logbook.dives.filter((d) => d.date < dive.date).sort((x, y) => (x.date < y.date ? 1 : -1))[0] ?? null);
  /** The previous dive's weights: a weight type chosen here starts from them (components/DesktopWeights.svelte). */
  let previousWeights = $state(/** @type {{ grams: number, description: string }[]} */ ([]));
  $effect(() => {
    const id = previousDive?.id;
    previousWeights = [];
    if (id === undefined) return;
    let current = true;
    BenthicCore.getDive({ id }).then(
      (/** @type {any} */ d) => current && (previousWeights = Array.isArray(d?.weights) ? d.weights : []),
      () => {},
    );
    return () => (current = false);
  });
  const kitOptions = $derived(
    kitMenuOptions(gear.kits, previousDive ? { number: previousDive.number } : null, {
      previous: t('desktopDetail.kitMenu.previous'),
      previousLine: (n) => t('desktopDetail.kitMenu.previousLine', { n }),
      pieces: (n) => t('desktopDetail.kitPieces', { n }),
      manage: t('gear.diveGear.manageKits'),
    }),
  );
  const appliedKit = $derived(equipment ? gear.kits.find((kit) => kit.id === equipment.kitId) : undefined);

  /** The undersuit of this dive. @param {string|string[]|number} id */
  async function saveUndersuit(id) {
    if (!equipment) return;
    await saveEquipment({ ...equipment, undersuitGearId: String(id) });
  }

  /**
   * A choice of the kit menu. A kit fills the suit, the undersuit and the other gear as the phone's « Remplir avec un kit »
   * does (applyKit); « Plongée précédente » copies the previous dive's equipment and suit (copyEquipment); a message offers
   * « Annuler », which puts the previous equipment and suit back. « Gérer les kits » opens the inventory.
   * @param {string} id
   */
  async function chooseKit(id) {
    if (id === KIT_MANAGE) {
      openOver('/profile/gear/');
      return;
    }
    if (!equipment) return;
    const before = cloneEquipment(equipment);
    const beforeSuit = dive.suit ?? '';
    const beforeWeights = weightRows(dive.weights ?? []);
    /** @type {import('../lib/inventory.js').DiveEquipment} */
    let next;
    let message = '';
    if (id === KIT_PREVIOUS) {
      if (!previousDive) return;
      const previous = equipmentOf(previousDive);
      const previousFull = await BenthicCore.getDive({ id: previousDive.id }).catch(() => null);
      let suit = previous.suitGearId ? (gearMap().get(previous.suitGearId)?.name ?? '') : '';
      if (!suit) suit = previousFull?.suit ?? '';
      // The weights too: the same diver in the same gear carries the same lead.
      const copiedWeights = weightRows(previousFull?.weights ?? []);
      if (equipmentIsEmpty(previous) && !suit && !copiedWeights.length) {
        showSnackbar(t('gear.diveGear.previousEmpty'));
        return;
      }
      next = copyEquipment(previous);
      message = t('gear.diveGear.copied');
      await saveEquipment(next);
      if (suit !== beforeSuit) await save('suit', suit);
      if (copiedWeights.length) await saveWeights(copiedWeights);
    } else {
      const kit = gear.kits.find((k) => k.id === id);
      if (!kit) return;
      next = applyKit(equipment, kit, gearMap());
      message = t('gear.diveGear.kitApplied', { name: kit.name });
      await saveEquipment(next);
      const suit = next.suitGearId && next.suitGearId !== before.suitGearId ? (gearMap().get(next.suitGearId)?.name ?? '') : '';
      if (suit && suit !== beforeSuit) await save('suit', suit);
    }
    showSnackbar(message, {
      action: t('edit.undo'),
      timeout: 8000,
      onAction: async () => {
        await saveEquipment(before);
        if ((dive.suit ?? '') !== beforeSuit) await save('suit', beforeSuit);
        await saveWeights(beforeWeights);
      },
    });
  }
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
    if (preview) return;
    if (isRelease && tab === 'equipment') untrack(() => loadInventory().catch((e) => console.error('Inventory', e)));
  });

  /** @type {import('benthic-core').SiteSummary[]} */
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
      .then((/** @type {import('benthic-core').GasCylinderTypes} */ list) => (cylinderTypes = list.types))
      .catch((/** @type {unknown} */ e) => console.error('Cylinder types', e));
  }
  // Each tab reads what it shows when it is first shown; the cache makes a second tab or dive free.
  /** @type {Set<string>} */
  const needed = new Set();
  let neededFor = -1;
  $effect(() => {
    // The kept detail (lib/detail-snapshot.js) draws what it has: the lists for editing are read with the real dive.
    if (preview) return;
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
        once('tag', () => loadValues('tag'));
      }
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
  /**
   * Weights as the rows saveWeights takes, each kept to the gram (its text unchanged).
   * @param {{ grams: number, description: string }[]} list
   */
  const weightRows = (list) => list.map((w) => ({ description: w.description, text: weightText(w.grams, prefs), grams0: w.grams, text0: weightText(w.grams, prefs) }));
  /** @param {{ description: string, text: string, grams0: number, text0: string }[]} rows */
  async function saveWeights(rows) {
    const result = weightChanges(dive, rows, prefs);
    if (!result.ok) {
      showSnackbar(t('desktopDetail.invalid'));
      return false;
    }
    return result.changes ? write(result.changes) : true;
  }
  const weightsShown = $derived(weightChips(dive.weights, prefs));
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
  /** @param {import('benthic-core').Cylinder} c */
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
  /** The mix of a cylinder: always both parts, as the phone's editor sends them. @param {number} index @param {import('benthic-core').Cylinder} c @param {{ o2?: string, he?: string }} typed */
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

  // The dive type, the tiles it shows and the one chosen (task 2026-11-24-382). The cylinders stay in the dive whatever the
  // type: a freedive shows none, and back in another type they are there again.
  const mode = $derived(knownMode(dive.divemode));
  const rebreather = $derived(mode === 'CCR' || mode === 'PSCR');
  // The short labels (Ouvert, CCR, pSCR, Apnée) on a portrait tablet and on a phone.
  // Also when the card is too narrow for the long ones (the second column of a landscape tablet).
  let paneWidth = $state(1000);
  const columns = $derived(layout.split && !layout.desktop && !layout.portrait);
  const shortTypes = $derived(layout.phone || (layout.split && !layout.desktop && layout.portrait) || (!layout.desktop && paneWidth < (columns ? 1000 : 560)));
  const modeOptions = $derived(diveTypeOptions(shortTypes));
  /** Writes the dive's mode (the core keeps every cylinder). @param {string} value */
  const saveMode = (value) => write({ divemode: value });
  const tiles = $derived(gasTiles(dive.cylinders, mode, prefs));
  const cards = $derived(gasCards(dive.cylinders, prefs));
  let selectedKey = $state('');
  const activeKey = $derived(tiles.some((x) => x.key === selectedKey) ? selectedKey : (tiles[0]?.key ?? ''));
  const activeTile = $derived(tiles.find((x) => x.key === activeKey));
  /** The cylinder of an open-circuit or bailout tile. */
  const cylinderIndex = $derived(activeTile && activeTile.kind === 'cylinder' ? activeTile.indexes[0] : -1);
  const chosen = $derived(cylinderIndex >= 0 ? dive.cylinders[cylinderIndex] : undefined);
  const used = $derived(consumption(dive, Math.max(cylinderIndex, 0), prefs, reserveMbar));
  const setpoints = $derived(setpointsOf(dive.samples));
  const setpointText = (/** @type {number|undefined} */ bar) => (bar ? `${formatNumber(bar, 1)} ${t('units.bar')}` : '—');
  /** « de 0 à 78 min », the span a cylinder was breathed, as the header's second part. @param {number} index */
  const spanText = (index) => {
    const span = cylinderSpan(dive.samples, index);
    return span ? t('desktopDetail.cylinderSpan', { from: span.fromMin, to: span.toMin }) : '';
  };
  async function addCylinderAndSelect() {
    const at = dive.cylinders.length;
    const ok = await addCylinder();
    if (ok) selectedKey = `c${at}`;
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
  /** « 232 → 70 » as the Pression field holds it. @param {import('benthic-core').Cylinder} c */
  const pairText = (c) => (c.startMbar ? `${pressureText(c.startMbar)}${c.endMbar ? ` → ${pressureText(c.endMbar)}` : ''}` : '');
  const pairOk = (/** @type {string} */ text) => !text.trim() || parsePressurePair(text) !== null;
  const mixOk = (/** @type {string} */ text) => parseGas(text) !== null;

  // --- Informations: « Date et heure » (task 2026-11-24-386). The date and the entry time open the pickers; a dive of the
  // logbook keeps its Benthic id, so the equipment saved under it does not move (a dive with no id yet is re-keyed).
  /** @type {'date'|'time'|null} */
  let picking = $state(null);
  const startIso = $derived(dive.date.slice(0, 19));
  /** @param {string} next the dive's new start, `YYYY-MM-DDTHH:MM:SS` */
  async function saveDate(next) {
    if (next === startIso) return;
    const from = diveKeyOf({ date: startIso, benthicId: dive.benthicId });
    const to = diveKeyOf({ date: next, benthicId: dive.benthicId });
    if (!(await write({ date: next }))) return;
    if (isRelease && from !== to) {
      try {
        await changeInventory((inv) => inv.rekeyDive(from, to));
      } catch (e) {
        console.error('Dive date', e);
      }
    }
  }

  // --- Informations and Carte: the site card. -------------------------------------------------
  const siteRow = $derived(sites.find((x) => x.name === dive.site));
  const country = $derived(dive.siteLocation?.country || siteRow?.country || '');
  const siteNote = $derived(
    [
      [dive.siteLocation?.region, country].filter(Boolean).join(', '),
      dive.siteCoordinates ? formatCoordinates(dive.siteCoordinates.latUdeg, dive.siteCoordinates.lonUdeg) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
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
    window.addEventListener('bc-detail-focus-first', focusFirst);
    return () => window.removeEventListener('bc-detail-focus-first', focusFirst);
  });
</script>

<div class="bc-desktop-dive-fields" bind:clientWidth={paneWidth} class:bc-desktop-dive-fields--compact={!layout.desktop} class:bc-desktop-dive-fields--cols={layout.split && !layout.desktop && !layout.portrait} bind:this={root}>
  {#if hint}<p class="bc-desktop-dive-fields--hint">{t('desktopDetail.fieldsHint')}</p>{/if}

  {#if tab === 'info'}
    <!-- Informations (task 2026-11-23-376): five cards, laid out like the Équipement tab's: site, people, rating, conditions, tags. -->
    <div class="bc-desktop-dive-fields--equipment bc-desktop-dive-fields--info">
      <DesktopEquipmentCard name="datetime" title={t('desktopDetail.card.datetime')}>
        {#snippet icon()}<Icon name="calendar" size={22} />{/snippet}
        <div class="bc-desktop-dive-fields--two-columns">
          <DesktopPickField name="date" label={t('desktopDetail.label.date')} value={formatDiveDay(dive.date)} icon="calendar" disabled={preview} onclick={() => (picking = 'date')} />
          <DesktopPickField name="time" label={t('desktopDetail.label.entryTime')} value={formatTimeOfDay(dive.date)} icon="clock" disabled={preview} onclick={() => (picking = 'time')} />
        </div>
        <p class="bc-desktop-dive-fields--kit-note">{t(layout.desktop ? 'desktopDetail.dateNoteDesktop' : 'desktopDetail.dateNote')}</p>
      </DesktopEquipmentCard>

      <DesktopEquipmentCard name="site" title={t('desktopDetail.card.site')}>
        {#snippet icon()}<Icon name="place" size={22} />{/snippet}
        <DesktopEditField card noLead name="site" kind="site" label={t('desktopDetail.label.site')} value={dive.site} invitation={t('desktopDetail.invitation.site')} note={siteNote} known={sites.map((s) => ({ key: s.name, dives: s.dives }))} newLabel={t('desktopDetail.newSite')} onopen={siteRow ? openSite : undefined} openLabel={t('desktopDetail.openSite')} onsave={(v) => saveSite(/** @type {string} */ (v))} />
      </DesktopEquipmentCard>

      <DesktopEquipmentCard name="people" title={t('desktopDetail.card.people')}>
        {#snippet icon()}<Icon name="people" size={22} />{/snippet}
        <DesktopChipsField name="guides" label={t('desktopDetail.label.guideOfDive')} value={dive.guides} known={known.guide} newLabel={t('desktopDetail.newGuide')} onsave={(v) => save('guides', v)} />
        <DesktopChipsField name="buddies" label={t('desktopDetail.label.buddies')} value={dive.buddies} known={known.buddy} newLabel={t('desktopDetail.newBuddy')} onsave={(v) => save('buddies', v)} />
      </DesktopEquipmentCard>

      {#if !preview && benthicPlusSubscriber()}
        <DiveSignatures {dive} {onsign} />
      {/if}

      <DesktopEquipmentCard name="rating" title={t('desktopDetail.card.rating')}>
        {#snippet icon()}<Icon name="star" size={22} />{/snippet}
        <DesktopStarsRow name="rating" label={t('desktopDetail.label.note')} value={dive.rating} onsave={(v) => save('rating', v)} />
        <DesktopStarsRow name="visibility" label={t('desktopDetail.label.visibility')} value={dive.visibility} onsave={(v) => save('visibility', v)} />
      </DesktopEquipmentCard>

      <DesktopEquipmentCard name="conditions" title={t('desktopDetail.card.conditions')}>
        {#snippet icon()}<Icon name="waves" size={22} />{/snippet}
        <div class="bc-desktop-dive-fields--two-columns">
          <DesktopEditField stacked tall name="waterType" kind="choice" openChoiceOnClick label={t('desktopDetail.label.waterType')} value={waterValue} invitation={t('edit.notSet')} options={waterOptions} onsave={(v) => save('waterType', String(v))} />
          {#if manual}
            <DesktopEditField stacked name="airTemp" kind="text" label={t('desktopDetail.label.airTemp')} value={fieldValue(dive, 'airTemp', prefs)} unit={temperatureUnitText} invitation={t('desktopDetail.invitation.airTemp')} valid={checker('airTemp')} onsave={(v) => save('airTemp', v)} />
          {:else}
            <!-- What the dive computer recorded: plain text, no field (a dash when it recorded none). -->
            <DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.airTemp')} value={dive.airTempMk ? formatTemperature(dive.airTempMk, prefs) : '—'} />
          {/if}
          <DesktopEditField stacked name="surfacePressure" kind="text" label={t('desktopDetail.label.surfacePressure')} value={fieldValue(dive, 'surfacePressure', prefs)} unit="mbar" invitation={t('desktopDetail.invitation.surfacePressure')} valid={checker('surfacePressure')} onsave={(v) => save('surfacePressure', v)} />
          {#if manual}
            <!-- A dive logged by hand has no recorded values: they are edited like the others. -->
            <DesktopEditField stacked name="maxDepth" kind="text" label={t('desktopDetail.label.maxDepth')} value={fieldValue(dive, 'maxDepth', prefs)} unit={depthUnitText} invitation={t('desktopDetail.invitation.maxDepth')} valid={checker('maxDepth')} onsave={(v) => save('maxDepth', v)} />
            <DesktopEditField stacked name="duration" kind="text" label={t('desktopDetail.label.duration')} value={fieldValue(dive, 'duration', prefs)} unit={t('units.minutes')} invitation={t('desktopDetail.invitation.duration')} valid={checker('duration')} onsave={(v) => save('duration', v)} />
            <DesktopEditField stacked name="waterTemp" kind="text" label={t('desktopDetail.label.waterTemp')} value={fieldValue(dive, 'waterTemp', prefs)} unit={temperatureUnitText} invitation={t('desktopDetail.invitation.waterTemp')} valid={checker('waterTemp')} onsave={(v) => save('waterTemp', v)} />
          {:else if dive.waterTempMk}
            <DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.waterTemp')} value={formatTemperature(dive.waterTempMk, prefs)} />
          {/if}
          {#if dive.cns > 0}<DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.cns')} value={`${formatNumber(dive.cns, 0)} %`} />{/if}
          {#if dive.otu > 0}<DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.otu')} value={formatNumber(dive.otu, 0)} />{/if}
          {#if trip}<DesktopEditField stacked kind="text" readonly label={t('desktopDetail.label.trip')} value={trip} />{/if}
        </div>
      </DesktopEquipmentCard>

      <DesktopEquipmentCard name="tags" title={t('desktopDetail.card.tags')}>
        {#snippet icon()}<Icon name="tag" size={22} />{/snippet}
        <DesktopChipsField name="tags" variant="tag" showLabel={false} label={t('desktopDetail.label.tags')} value={/** @type {string[]} */ (fieldValue(dive, 'tags', prefs))} known={known.tag} newLabel={t('desktopDetail.newTag')} onsave={(v) => save('tags', v)} />
      </DesktopEquipmentCard>
    </div>
  {:else if tab === 'equipment'}
    <!-- Équipement (task 2026-11-23-366): one card per section. -->
    <div class="bc-desktop-dive-fields--equipment">
      {#if plus && equipment}
        <!-- Kit (Benthic+, task 2026-11-24-382): a grey field that opens the kit menu; the fields below stay editable. -->
        <DesktopEquipmentCard name="kit" title={t('desktopDetail.label.kit')}>
          {#snippet icon()}<Icon name="briefcase" size={22} />{/snippet}
          <DesktopKitField
            label={t('desktopDetail.label.kit')}
            name={appliedKit?.name ?? ''}
            pieces={appliedKit ? t('desktopDetail.kitPieces', { n: appliedKit.gearIds.length }) : ''}
            value={equipment.kitId}
            options={kitOptions}
            invitation={t('desktopDetail.invitation.kit')}
            onselect={chooseKit}
          />
          <p class="bc-desktop-dive-fields--kit-note">{appliedKit ? t('desktopDetail.kitFilled') : t('desktopDetail.kitNote')}</p>
        </DesktopEquipmentCard>
      {/if}

      <DesktopEquipmentCard name="computers" title={t('desktopDetail.section.computers')}>
        {#snippet icon()}<Icon name="diveComputer" size={22} />{/snippet}
        {#snippet noComputerPhoto()}{/snippet}
        {#each dive.diveComputers ?? [] as dc, i (i)}
          <div class="bc-desktop-dive-fields--computer" data-field="computer">
            <span class="bc-desktop-dive-fields--computer-tile" aria-hidden="true">{#if dc.model}<DcTile model={dc.model} size={48} radius={10} photo={ownComputerPhoto(dc.model, dc.serial)} fallback={dive.diveComputers?.length === 1 ? noComputerPhoto : undefined} />{/if}</span>
            <span class="bc-desktop-dive-fields--computer-text">
              <span class="bc-desktop-dive-fields--computer-name">{dc.nickname || dc.model}</span>
              <span class="bc-desktop-dive-fields--computer-role">{[computerRole(i), dc.serial ? t('desktopDetail.serial', { serial: dc.serial }) : ''].filter(Boolean).join(' · ')}</span>
            </span>
          </div>
        {/each}
        <!-- Computers join a dive when it is downloaded: nothing to type here. -->
        <button type="button" class="bc-desktop-dive-fields--text-button bc-desktop-dive-fields--add-computer" data-field="computer-add" disabled title={t('desktopDetail.addComputer')}>{t(computers.length ? 'desktopDetail.addSecondComputer' : 'desktopDetail.addFirstComputer')}</button>
      </DesktopEquipmentCard>

      <DesktopEquipmentCard name="protection" title={t('desktopDetail.section.protection')}>
        {#snippet icon()}<GearIcon type="suit" size={22} />{/snippet}
        <div class="bc-desktop-dive-fields--two-columns">
          <DesktopEditField stacked tall name="suit" kind="text" label={t('desktopDetail.label.suit')} value={dive.suit ?? ''} invitation={t('desktopDetail.invitation.suit')} onsave={(v) => save('suit', v)} />
          {#if plus && equipment && (undersuits.length || equipment.undersuitGearId)}
            <DesktopEditField stacked tall name="undersuit" kind="choice" label={t('desktopDetail.label.undersuit')} value={equipment.undersuitGearId} options={undersuitOptions} invitation={t('desktopDetail.invitation.undersuit')} showHint={false} onsave={(v) => saveUndersuit(v)} />
          {/if}
        </div>
      </DesktopEquipmentCard>

      <DesktopEquipmentCard name="weights" title={t('desktopDetail.label.weights')}>
        {#snippet icon()}<GearIcon type="weights" size={22} />{/snippet}
        {#snippet action()}
          {#if weightsShown.total}<span class="bc-desktop-dive-fields--total">{t('desktopDetail.weightTotal')}<strong>{weightsShown.total}</strong></span>{/if}
        {/snippet}
        <div data-field="weights">
          <DesktopWeights weights={dive.weights ?? []} previous={previousWeights} {prefs} label={t('desktopDetail.label.weights')} onsave={(rows) => saveWeights(rows)} />
        </div>
        {#if plus}
          <div class="bc-desktop-dive-fields--feedback">
            <span class="bc-desktop-dive-fields--feedback-label" id="bc-df-feedback">{t('weightFeedback.title')}</span>
            <div class="bc-desktop-dive-fields--feedback-group">
              <ButtonGroup options={feedbackOptions} value={feedback} onchange={(v) => saveFeedback(v)} ariaLabelledby="bc-df-feedback" clearable rail />
            </div>
          </div>
        {/if}
      </DesktopEquipmentCard>

      {#if plus && equipment}
        <DesktopEquipmentCard name="other-gear" title={t('desktopDetail.section.otherGear')}>
          {#snippet icon()}<GearIcon type="bcd" size={22} />{/snippet}
          {#snippet action()}
            <button type="button" class="bc-desktop-dive-fields--text-button" onclick={() => (addingGear = true)}><Icon name="plus" size={18} />{t('desktopDetail.add')}</button>
          {/snippet}
          <DesktopOtherGear items={otherItems} onremove={removeGear} />
        </DesktopEquipmentCard>
        <AddEquipmentSheet opened={addingGear} {equipment} onclose={() => (addingGear = false)} onadd={(next) => saveEquipment(next)} />
      {/if}
    </div>
  {:else if tab === 'gas'}
    <!-- Gaz (task 2026-11-24-382; mock-ups bureau-carnet-onglet-gaz and its CCR, pSCR and apnée variants): the dive type, then the cards of that type. -->
    <div class="bc-desktop-dive-fields--equipment bc-desktop-dive-fields--gas">
      <section class="bc-desktop-dive-fields--card bc-desktop-dive-fields--type" aria-label={t('desktopDetail.diveType.title')}>
        <h3 class="bc-desktop-dive-fields--card-title">{t('desktopDetail.diveType.title')}</h3>
        <div data-field="divemode">
          <DesktopSegments block options={modeOptions} value={mode} onchange={saveMode} ariaLabel={t('desktopDetail.diveType.title')} />
        </div>
      </section>

      {#if mode === 'Freedive'}
        <section class="bc-desktop-dive-fields--card bc-desktop-dive-fields--no-gas" data-field="no-gas">
          <h3 class="bc-desktop-dive-fields--card-title">{t('desktopDetail.noGas.title')}</h3>
          <p class="bc-desktop-dive-fields--no-gas-text">{t('desktopDetail.noGas.text')}</p>
        </section>
      {:else}
        <div class="bc-desktop-dive-fields--card">
          <DesktopGasCards {tiles} selected={activeKey} onselect={(key) => (selectedKey = key)} onadd={addCylinderAndSelect} />
        </div>

        {#if activeTile?.kind === 'cylinder' && chosen}
          <div class="bc-desktop-dive-fields--card bc-desktop-dive-fields--fields">
            {@render cylinderFields(cylinderIndex, '', true)}
          </div>
        {:else if activeTile}
          <!-- The rebreather unit: the diluent (or the mix), then the oxygen. -->
          <div class="bc-desktop-dive-fields--card bc-desktop-dive-fields--fields">
            {#each activeTile.parts as part, i (part.role)}
              {@render cylinderFields(activeTile.indexes[i], part.title, false)}
            {/each}
          </div>
        {/if}

        {#if mode === 'OC'}
          <DesktopConsumption data={used} />
        {:else if mode === 'CCR'}
          <DesktopEquipmentCard name="rebreather" title={t('desktopDetail.rebreatherCard.title')}>
            {#snippet icon()}<Icon name="tune" size={22} />{/snippet}
            <div class="bc-desktop-dive-fields--two-columns">
              <DesktopEditField stacked kind="text" readonly name="setpoint-low" label={t('desktopDetail.rebreatherCard.low')} value={setpointText(setpoints?.low)} />
              <DesktopEditField stacked kind="text" readonly name="setpoint-high" label={t('desktopDetail.rebreatherCard.high')} value={setpointText(setpoints?.high)} />
            </div>
          </DesktopEquipmentCard>
        {/if}
      {/if}
      {#if gasChanges && mode === 'OC'}<DesktopEditField kind="text" readonly label={t('desktopDetail.label.gasChanges')} value={gasChanges} />{/if}
    </div>
  {:else if tab === 'notes'}
    <!-- Notes (task 2026-11-23-376): the notes; the rating and the tags are in the Informations tab's cards. -->
    <DesktopEditField name="notes" kind="multiline" label={t('desktopDetail.label.notes')} value={dive.notes} invitation={t('desktopDetail.invitation.notes')} onsave={(v) => save('notes', v)} />
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

{#if picking}
  <DiveDateTimeDialogs date={startIso} kind={picking} onconfirm={saveDate} onclose={() => (picking = null)} />
{/if}

{#snippet cylinderFields(/** @type {number} */ index, /** @type {string} */ role, /** @type {boolean} */ own)}
  {@const c = dive.cylinders[index]}
  {#if c}
    {@const span = spanText(index)}
    <div class="bc-desktop-dive-fields--cylinder" data-cylinder={index}>
      <header class="bc-desktop-dive-fields--cylinder-head">
        <p class="bc-desktop-dive-fields--cylinder-title">{role || t('desktopDetail.cylinder', { n: index + 1 })}<span class="bc-desktop-dive-fields--cylinder-sub">{[role ? '' : t(useKey(c.use, dive.divemode)), span].filter(Boolean).map((x, i) => (i ? x : ' · ' + x)).join(', ')}</span></p>
        {#if own}
          <button type="button" class="bc-desktop-dive-fields--icon" aria-label={t('desktopDetail.moveUp')} title={t('desktopDetail.moveUp')} disabled={index === 0} onclick={async () => { if (await moveCylinder(index, -1)) selectedKey = `c${index - 1}`; }}><Icon name="arrowUp" size={20} /></button>
          <button type="button" class="bc-desktop-dive-fields--icon" aria-label={t('desktopDetail.moveDown')} title={t('desktopDetail.moveDown')} disabled={index === dive.cylinders.length - 1} onclick={async () => { if (await moveCylinder(index, 1)) selectedKey = `c${index + 1}`; }}><Icon name="arrowDown" size={20} /></button>
          <button type="button" class="bc-desktop-dive-fields--icon" aria-label={t('desktopDetail.removeCylinder')} title={c.protected ? t('edit.cylinderInUse') : t('desktopDetail.removeCylinder')} disabled={c.protected} onclick={() => removeCylinder(index)}><Icon name="delete" size={20} /></button>
        {/if}
      </header>
      {#key index}
        <DesktopEditField name="cylinder-type" kind="choice" label={t('desktopDetail.label.cylinderType')} value={c.description} options={typeOptions(c)} note={[c.sizeMl ? formatCylinderSize(c.sizeMl, c.workingPressureMbar, prefs) : '', c.workingPressureMbar ? formatPressure(c.workingPressureMbar, prefs) : ''].filter(Boolean).join(' · ')} invitation={t('desktopDetail.invitation.cylinderType')} onsave={(v) => chooseType(index, /** @type {string} */ (v))} />
        <DesktopEditField name="cylinder-mix" kind="text" label={t('desktopDetail.label.mix')} value={gasText(c.o2Permille, c.hePermille)} display={cards[index]?.gas} note={t('desktopDetail.mixNote', { o2: percentText(c.o2Permille || 210), he: percentText(c.hePermille) })} invitation={t('desktopDetail.invitation.mix')} valid={mixOk} onsave={(v) => saveMix(index, /** @type {string} */ (v))} />
        {#if manual}
          <DesktopEditField name="cylinder-pressure" kind="text" label={t('desktopDetail.label.pressure')} value={pairText(c)} display={c.startMbar ? cards[index]?.range : ''} note={t('desktopDetail.pressureNote')} invitation={t('desktopDetail.invitation.pressure')} valid={pairOk} onsave={(v) => savePair(index, /** @type {string} */ (v))} />
        {:else}
          <DesktopEditField name="cylinder-pressure" kind="text" readonly label={t('desktopDetail.label.pressure')} value={cards[index]?.range ?? ''} />
        {/if}
        {#if own}
          <DesktopEditField name="cylinder-use" kind="choice" label={t('desktopDetail.label.use')} value={c.use} options={useOptions} onsave={(v) => saveCylinder(index, { use: /** @type {string} */ (v) || 'OC-gas' })} />
        {/if}
      {/key}
    </div>
  {/if}
{/snippet}

<style>
  @layer bc.components {
    .bc-desktop-dive-fields {
      display: flex;
      flex-direction: column;
      margin: 0 24px 24px;
    }

    /* On a tablet and a phone the cards run closer to the screen's edges. */
    .bc-desktop-dive-fields--compact {
      margin: 0 16px 16px;
    }

    /* One line above the fields: the grey ones can be edited with a click. */
    .bc-desktop-dive-fields--hint {
      margin: 16px 0 12px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* The Équipement tab (task 2026-11-23-366): the cards, 14 px apart. 64 px at the end, plus the pane's 24 px margin, leave
       88 px so the + floating button never covers the last row. */
    .bc-desktop-dive-fields--equipment {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-bottom: 64px;
    }

    /* A tablet in landscape lays the cards out in two columns (task 2026-11-24-382); a card never splits across them. */
    .bc-desktop-dive-fields--cols .bc-desktop-dive-fields--equipment {
      display: block;
      column-count: 2;
      column-gap: 14px;
      padding-bottom: 64px;
      & > :global(*) {
        break-inside: avoid;
        margin-bottom: 14px;
      }
    }

    /* The Informations tab uses the same cards; the people's rows and the ratings sit in the card's body. */
    .bc-desktop-dive-fields--info {
      & :global([data-card='rating'] .bc-desktop-equipment-card--body) {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 12px 32px;
      }
    }

    /* A text button of a card: « Changer de kit », « + Ajouter ». */
    .bc-desktop-dive-fields--text-button {
      width: auto;
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 0 12px;
      border: 0;
      border-radius: 20px;
      background: none;
      color: var(--bc-on-table-selected);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      &:disabled {
        opacity: 0.55;
        cursor: default;
      }
      &:hover:not(:disabled) {
        background: color-mix(in srgb, currentColor 8%, transparent);
      }
    }

    .bc-desktop-dive-fields--add-computer {
      align-self: flex-start;
      padding-inline-start: 4px;
    }

    .bc-desktop-dive-fields--kit-note {
      margin: 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* A dive computer: 64 px grey row, its photo on a 48 px white tile, its name and its role. */
    .bc-desktop-dive-fields--computer {
      box-sizing: border-box;
      height: 64px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 8px;
      border-radius: 12px;
      background: var(--bc-field-rest);
    }

    .bc-desktop-dive-fields--computer-tile {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 10px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-desktop-dive-fields--computer-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-desktop-dive-fields--computer-name {
      font-size: 15px;
      line-height: 20px;
      font-weight: 500;
      color: var(--bc-text);
    }

    .bc-desktop-dive-fields--computer-role {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* The suit and the undersuit: two equal columns. */
    .bc-desktop-dive-fields--two-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      align-items: start;
    }

    /* The weights total, in the card's header. */
    .bc-desktop-dive-fields--total {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      font-size: 13px;
      color: var(--bc-text-2);
      & strong {
        font-size: 22px;
        font-weight: 600;
        color: var(--bc-text);
        font-variant-numeric: tabular-nums;
      }
    }

    /* « Ce lest était »: the label with the chips, the three-way selector narrower and centred. */
    .bc-desktop-dive-fields--feedback {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-desktop-dive-fields--feedback-label {
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-desktop-dive-fields--feedback-group {
      width: min(360px, 100%);
      align-self: center;
    }

    .bc-desktop-dive-fields--card {
      box-sizing: border-box;
      padding: 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      border: 1px solid var(--bc-surface-container-highest);
    }

    .bc-desktop-dive-fields--card-title {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-text);
    }

    .bc-desktop-dive-fields--no-gas-text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* The cylinders' fields: the diluent's, then the oxygen's, as two blocks of the same card. */
    .bc-desktop-dive-fields--cylinder + .bc-desktop-dive-fields--cylinder {
      margin-top: 16px;
      padding-top: 4px;
      border-top: 1px solid var(--bc-separator);
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
      &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
        color: var(--bc-text);
      }
      &:disabled {
        opacity: 0.38;
        cursor: default;
      }
    }
  }
</style>
