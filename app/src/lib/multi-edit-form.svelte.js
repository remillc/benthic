// @ts-check
// The state and the actions of « Modifier ensemble… » (tasks 2026-11-15-178, 2026-11-24-384 and 385): what the diver sees
// for the selected dives (each field's value or « Plusieurs valeurs », with the spread under it), what they changed, and the
// one undoable change that applies it. The phone's sheet (pages/EditDivesTogether.svelte) and the desktop and tablet dialog
// (components/DesktopEditTogetherDialog.svelte) are two ways of drawing the same form. The pure rules are in lib/multi-dive.js.
import { BenthicCore } from 'benthic-core';
import { logbookValues } from './people.js';
import { editDivesTogether, isSubscriber, logbook } from './logbook.svelte.js';
import { isRelease } from './edition.js';
import { change as changeInventory, equipmentOf, gear, gearMap, loadInventory } from './inventory.svelte.js';
import { applyKit, cloneEquipment, diveKeyOf, sameEquipment } from './inventory.js';
import { multiEditChanges, multiEditState, spreadText, subtitleOf } from './multi-dive.js';
import { parseTyped, weightText } from './desktop-edit.js';
import { formatWeight } from './format.js';
import { WATER_TYPES, waterTypeName, waterTypeOfSalinity } from './tools.js';
import { liveDiveId } from './dive-ids.js';
import { t } from './i18n.js';

/** The tabs, as in a single dive's detail without « Carte ». */
export const MULTI_TABS = /** @type {const} */ (['info', 'equipment', 'gas', 'notes']);

/** The dive modes, in the order of the segmented button. */
export const MODES = /** @type {const} */ (['OC', 'CCR', 'PSCR', 'Freedive']);

const G_PER_LB = 453.59237;

export class MultiEditForm {
  /** @param {number[]} ids the selected dives (the core's ids) */
  constructor(ids) {
    this.ids = ids;
    this.n = ids.length;
  }

  /** @type {import('./multi-dive.js').MultiEditState|null} */
  state = $state(null);
  failed = $state(false);
  busy = $state(false);
  /** The dives as the core's getDive gives them, the most recent first. @type {import('benthic-core').DiveDetail[]} */
  details = $state([]);
  subtitle = $state('');
  known = $state({ guide: /** @type {string[]} */ ([]), buddy: /** @type {string[]} */ ([]), tag: /** @type {string[]} */ ([]), suit: /** @type {string[]} */ ([]) });

  // What the diver changed: a field is touched once they act on it.
  siteTouched = $state(false);
  siteName = $state('');
  siteUuid = $state(0);
  suitTouched = $state(false);
  suit = $state('');
  waterTouched = $state(false);
  waterType = $state('');
  ratingTouched = $state(false);
  rating = $state(0);
  visibilityTouched = $state(false);
  visibility = $state(0);
  kitTouched = $state(false);
  kitId = $state('');
  weightTouched = $state(false);
  weightInput = $state('');
  modeTouched = $state(false);
  mode = $state('OC');
  appendNotes = $state('');
  guides = $state(/** @type {string[]} */ ([]));
  buddies = $state(/** @type {string[]} */ ([]));
  tags = $state(/** @type {string[]} */ ([]));

  /** The kit field is Benthic+ only and needs the device's inventory (as the dive detail's Équipement tab). */
  get kitAvailable() {
    return isRelease && isSubscriber() && gear.ready;
  }

  /** The dives do not all use the same kit. */
  get kitMixed() {
    return new Set(this.details.map((d) => equipmentOf(d).kitId)).size > 1;
  }

  async load() {
    try {
      const details = await Promise.all(this.ids.map((id) => BenthicCore.getDive({ id: liveDiveId(id) })));
      details.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.number - a.number));
      const s = multiEditState(details);
      this.details = details;
      this.subtitle = subtitleOf(details);
      this.siteName = s.site.mixed ? '' : s.site.value;
      this.suit = s.suit.mixed ? '' : s.suit.value;
      this.waterType = s.salinity.mixed || !s.salinity.value ? '' : waterTypeOfSalinity(s.salinity.value);
      this.rating = s.rating.mixed ? 0 : s.rating.value;
      this.visibility = s.visibility.mixed ? 0 : s.visibility.value;
      this.mode = s.mode.mixed ? '' : s.mode.value;
      this.weightInput = s.weight.mixed ? '' : weightText(s.weight.value, logbook.prefs);
      this.guides = s.guides.map((c) => c.name);
      this.buddies = s.buddies.map((c) => c.name);
      this.tags = s.tags.map((c) => c.name);
      this.state = s;
    } catch (e) {
      console.error('Edit dives together', e);
      this.failed = true;
      return;
    }
    const [guide, buddy, tag, suit] = await Promise.all([logbookValues('guide'), logbookValues('buddy'), logbookValues('tag'), logbookValues('suit')]);
    this.known = { guide, buddy, tag, suit };
    if (isRelease && isSubscriber()) {
      await loadInventory().catch((e) => console.error('Inventory', e));
      const kits = new Set(this.details.map((d) => equipmentOf(d).kitId));
      this.kitId = kits.size === 1 ? ([...kits][0] ?? '') : '';
    }
  }

  // --- The spread under a field whose dives differ. -------------------------------------------------------------------

  /** @param {string} noneText */
  #names = (noneText) => (/** @type {string} */ v) => v || noneText;

  get spreads() {
    const d = this.details;
    const none = t('multiDive.none');
    return {
      site: spreadText(d.map((x) => x.site), this.#names(t('newDive.noSite'))),
      guide: spreadText(d.map((x) => (x.guides ?? []).join(', ')), this.#names(none)),
      suit: spreadText(d.map((x) => x.suit), this.#names(none)),
      water: spreadText(d.map((x) => x.userSalinity), (v) => (v ? waterTypeName(waterTypeOfSalinity(v)) : none)),
      kit: spreadText(d.map((x) => equipmentOf(x).kitId), (id) => gear.kits.find((k) => k.id === id)?.name ?? none),
      weight: spreadText(d.map((x) => (x.weights ?? []).reduce((sum, w) => sum + (w.grams ?? 0), 0)), (g) => (g ? formatWeight(g, logbook.prefs) : none)),
      mode: spreadText(d.map((x) => x.divemode || 'OC'), (m) => t(`multiDive.modes.${m}`)),
    };
  }

  /** The chip's « sur 2 plongées » notes of a list. @param {'guides'|'buddies'|'tags'} key @returns {Record<string, string>} */
  chipNotes(key) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const c of this.state?.[key] ?? []) if (!c.common) out[c.name] = t('multiDive.onSome', { n: c.count });
    return out;
  }

  // --- What the diver changed. ----------------------------------------------------------------------------------------

  /** The typed weight in grams: -1 when it is not a weight. */
  get weightGrams() {
    const pounds = logbook.prefs.weight === 'lbs';
    const v = parseTyped(this.weightInput);
    if (this.weightInput.trim() === '') return 0;
    if (!(v >= 0 && v <= (pounds ? 400 : 200))) return -1;
    return Math.round(pounds ? v * G_PER_LB : v * 1000);
  }

  /** The kit the diver chose, if any. */
  get kit() {
    return this.kitTouched ? gear.kits.find((k) => k.id === this.kitId) : undefined;
  }

  /** The name of the suit of the chosen kit (a kit fills the suit of each dive, the diver's own choice of suit wins). */
  get kitSuit() {
    const kit = this.kit;
    if (!kit) return '';
    const map = gearMap();
    return kit.gearIds.map((id) => map.get(id)).find((g) => g && g.type === 'suit' && !g.retired)?.name ?? '';
  }

  /** The edits, as lib/multi-dive.js takes them (the site by uuid). @returns {import('./multi-dive.js').MultiEdits} */
  edits() {
    /** @type {import('./multi-dive.js').MultiEdits} */
    const edits = { guides: this.guides, buddies: this.buddies, tags: this.tags };
    if (this.siteTouched) edits.site = this.siteUuid;
    if (this.suitTouched) edits.suit = this.suit.trim();
    else if (this.kitSuit) edits.suit = this.kitSuit;
    if (this.waterTouched) edits.salinity = WATER_TYPES.find((w) => w.id === this.waterType)?.salinity ?? 0;
    if (this.ratingTouched) edits.rating = this.rating;
    if (this.visibilityTouched) edits.visibility = this.visibility;
    if (this.modeTouched && this.mode) edits.mode = this.mode;
    if (this.weightTouched && this.weightGrams >= 0) edits.weightGrams = this.weightGrams;
    if (this.appendNotes.trim()) edits.notesAppend = this.appendNotes;
    return edits;
  }

  /** The weight typed is not a weight: « Appliquer » stays disabled. */
  get invalid() {
    return this.weightTouched && this.weightGrams < 0;
  }

  /** Whether anything differs from what the dives hold. */
  get changed() {
    if (!this.state || this.invalid) return false;
    return this.siteTouched || !!this.kit || Object.keys(multiEditChanges(this.state, this.edits())).length > 0;
  }

  // --- Applying. ------------------------------------------------------------------------------------------------------

  /**
   * Applies everything at once: the core's changes are one undoable step; a kit also fills what each dive used (the
   * device's inventory, not part of the core's history).
   * @param {number|null} [openId] the dive open in the detail pane (tablet), refreshed when it is one of them
   * @returns {Promise<{ coreStep: boolean, restoreKit: (() => Promise<void>)|null }>}
   *   `restoreKit` puts back what each dive used before the kit (the snackbar's « Annuler » runs it).
   */
  async apply(openId = null) {
    if (!this.state) throw new Error('NOT_READY');
    const changes = multiEditChanges(this.state, this.edits());
    const coreStep = Object.keys(changes).length > 0;
    if (coreStep) await editDivesTogether(this.ids.map(liveDiveId), changes, openId);
    return { coreStep, restoreKit: await this.#applyKit() };
  }

  /** @returns {Promise<(() => Promise<void>)|null>} */
  async #applyKit() {
    const kit = this.kit;
    if (!kit) return null;
    const before = this.details.map((d) => ({ key: diveKeyOf(d), equipment: cloneEquipment(equipmentOf(d)) }));
    const after = before.map(({ key, equipment }) => ({ key, equipment: applyKit(equipment, kit, gearMap()) }));
    await changeInventory(async (inv) => {
      for (const { key, equipment } of after) {
        const previous = before.find((b) => b.key === key)?.equipment;
        if (!previous || !sameEquipment(equipment, previous)) await inv.saveDiveEquipment(key, equipment);
      }
    });
    return () =>
      changeInventory(async (inv) => {
        for (const { key, equipment } of before) await inv.saveDiveEquipment(key, equipment);
      });
  }
}
