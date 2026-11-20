<script>
  // @ts-check
  // The top of « Équipement » in « Modifier une plongée » (task 2026-11-17-267,
  // docs/mockups-release/edition-equipement-plus-android.dc.html and edition-kit-menu-android.dc.html): the
  // tonal buttons « Appliquer un kit » and « Comme la précédente », then Combinaison and Sous-vêtement as menus
  // that pick from the inventory. Applying a kit or copying the previous dive fills the equipment, and a message
  // offers « Annuler », which puts the previous equipment back. Without any suit in the inventory, Combinaison
  // stays the free text it is elsewhere.
  import SelectField from './SelectField.svelte';
  import ComboField from './ComboField.svelte';
  import Icon from './Icon.svelte';
  import { gear, gearMap, visibleGear, evaluations } from '../lib/inventory.svelte.js';
  import { diveWarnings } from '../lib/maintenance.js';
  import { taskInline } from '../lib/maintenance-text.js';
  import { applyKit, copyEquipment, cloneEquipment, kitSummary, equipmentIsEmpty } from '../lib/inventory.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { OpenDivesCore } from 'opendives-core';
  import { equipmentOf } from '../lib/inventory.svelte.js';
  import { f7 } from 'framework7-svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   equipment: import('../lib/inventory.js').DiveEquipment,
   *   suitText: string,
   *   suitOptions: string[],
   *   diveDate: string,
   * }}
   * equipment, suitText: the edited values (the dive's Subsurface `suit` text follows the suit chosen);
   * suitOptions: the suits of the logbook, for the free text; diveDate: this dive's start, to find the previous one.
   */
  let { equipment = $bindable(), suitText = $bindable(), suitOptions, diveDate } = $props();

  /** The overdue services of the pieces this dive uses, for the reminders that ask to warn. */
  const warnings = $derived(diveWarnings(equipment, evaluations()));

  const NONE = '';
  const TEXT = '__text__';
  const suits = $derived(visibleGear().filter((g) => g.type === 'suit'));
  const undersuits = $derived(visibleGear().filter((g) => g.type === 'undersuit'));

  /** The options of Combinaison: none, each suit, and the text the dive already has when it is not a piece. */
  const suitChoices = $derived([
    { value: NONE, label: t('gear.diveGear.none') },
    ...suits.map((g) => ({ value: g.id, label: g.name })),
    ...(suitText.trim() && !equipment.suitGearId && !suits.some((g) => g.name === suitText) ? [{ value: TEXT, label: suitText }] : []),
  ]);
  const suitValue = $derived(equipment.suitGearId || (suitText.trim() ? (suits.some((g) => g.name === suitText) ? suits.find((g) => g.name === suitText)?.id ?? TEXT : TEXT) : NONE));
  const undersuitChoices = $derived([{ value: NONE, label: t('gear.diveGear.none') }, ...undersuits.map((g) => ({ value: g.id, label: g.name }))]);

  /** @param {string} v */
  function chooseSuit(v) {
    if (v === TEXT) return;
    equipment = { ...equipment, suitGearId: v };
    suitText = v ? (gearMap().get(v)?.name ?? '') : '';
  }

  /** @param {string} v */
  function chooseUndersuit(v) {
    equipment = { ...equipment, undersuitGearId: v };
  }

  /** « Annuler »: the equipment and the suit text as they were. @param {string} message @param {import('../lib/inventory.js').DiveEquipment} before @param {string} beforeSuit */
  function offer(message, before, beforeSuit) {
    showSnackbar(message, {
      action: t('edit.undo'),
      timeout: 8000,
      onAction: () => {
        equipment = cloneEquipment(before);
        suitText = beforeSuit;
      },
    });
  }

  /** @param {{ id: string, name: string, gearIds: string[] }} kit */
  function useKit(kit) {
    const before = cloneEquipment(equipment);
    const beforeSuit = suitText;
    const next = applyKit(equipment, kit, gearMap());
    equipment = next;
    if (next.suitGearId && next.suitGearId !== before.suitGearId) suitText = gearMap().get(next.suitGearId)?.name ?? suitText;
    offer(t('gear.diveGear.kitApplied', { name: kit.name }), before, beforeSuit);
  }

  /** @param {MouseEvent} e */
  function kitMenu(e) {
    const map = gearMap();
    /** @type {import('../lib/popup-menu.js').MenuItem[]} */
    const items = gear.kits.map((kit) => ({
      label: kit.name,
      supporting: t('gear.diveGear.kitLine', { n: kit.gearIds.length, summary: kitSummary(kit, map) }),
      onclick: () => useKit(kit),
    }));
    if (!items.length) items.push({ label: t('gear.diveGear.noKits'), onclick: () => {}, disabled: true });
    items.push({ label: t('gear.diveGear.manageKits'), onclick: () => f7.views.current.router.navigate('/profile/gear/'), divider: true });
    openPopupMenu(/** @type {HTMLElement} */ (e.currentTarget), items, t('gear.diveGear.kitMenu'));
  }

  /** The dive that comes just before this one in the logbook. */
  const previous = $derived(
    logbook.dives
      .filter((d) => d.date < diveDate)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0],
  );

  async function likePrevious() {
    if (!previous) {
      showSnackbar(t('gear.diveGear.noPrevious'));
      return;
    }
    const before = cloneEquipment(equipment);
    const beforeSuit = suitText;
    const prevEquipment = equipmentOf(previous);
    let prevSuit = prevEquipment.suitGearId ? (gearMap().get(prevEquipment.suitGearId)?.name ?? '') : '';
    if (!prevSuit) {
      try {
        prevSuit = (await OpenDivesCore.getDive({ id: previous.id })).suit ?? '';
      } catch {
        prevSuit = '';
      }
    }
    if (equipmentIsEmpty(prevEquipment) && !prevSuit) {
      showSnackbar(t('gear.diveGear.previousEmpty'));
      return;
    }
    equipment = copyEquipment(prevEquipment);
    suitText = prevSuit;
    offer(t('gear.diveGear.copied'), before, beforeSuit);
  }
</script>

<div class="bc-dive-gear--fill">
  <span class="bc-dive-gear--fill-label" id="od-fill-with">{t('gear.diveGear.fillWith')}</span>
  <div class="bc-dive-gear--group" role="group" aria-labelledby="od-fill-with">
    <button type="button" class="bc-dive-gear--segment" disabled={gear.readOnly} onclick={kitMenu} aria-haspopup="menu">
      <Icon name="briefcase" size={20} />{t('gear.diveGear.oneKit')}<Icon name="expand" size={18} />
    </button>
    <button type="button" class="bc-dive-gear--segment" disabled={gear.readOnly} onclick={likePrevious}>
      <Icon name="copy" size={20} />{t('gear.diveGear.previousDive')}
    </button>
  </div>
</div>

{#if suits.length || equipment.suitGearId}
  <SelectField label={t('gear.diveGear.suit')} value={suitValue} options={suitChoices} onchange={chooseSuit} disabled={gear.readOnly} />
{:else}
  <ComboField label={t('gear.diveGear.suit')} bind:value={suitText} options={suitOptions} />
{/if}
{#if undersuits.length || equipment.undersuitGearId}
  <SelectField label={t('gear.diveGear.undersuit')} value={equipment.undersuitGearId} options={undersuitChoices} onchange={chooseUndersuit} disabled={gear.readOnly} />
{/if}
{#if warnings.length}
  <ul class="bc-dive-gear--warnings" aria-label={t('maintenance.diveWarningTitle')}>
    {#each warnings as w (w.item.id)}
      <li><Icon name="warning" size={20} /><span>{t('maintenance.diveWarning', { what: `${gear.pieces.find((g) => g.id === w.item.gearId)?.name ?? ''} · ${taskInline(w.item)}` })}</span></li>
    {/each}
  </ul>
{/if}

<style>
  @layer od.components {
    .bc-dive-gear--warnings {
      margin: 8px 16px 0;
      padding: 0;
      list-style: none;

      li {
        padding: 8px 12px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        line-height: 20px;
        color: var(--bc-alarm);
        background: var(--bc-alarm-tint);
      }

      li + li {
        margin-top: 4px;
      }
    }

    .bc-dive-gear--fill {
      margin: 4px 16px 8px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
    }

    .bc-dive-gear--fill-label {
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    /* Connected button group (Material 3 Expressive): 2 dp between the buttons, outer ends fully rounded, inner corners 8 dp. */
    .bc-dive-gear--group {
      display: flex;
      gap: 2px;
      max-width: 100%;
    }

    .bc-dive-gear--segment {
      flex: none;
      width: auto;
      min-width: 0;
      box-sizing: border-box;
      height: 40px;
      padding: 0 16px 0 12px;
      border: none;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--bc-tonal);
      color: var(--bc-on-secondary-container);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-dive-gear--segment:first-child {
      border-radius: 20px 8px 8px 20px;
    }

    .bc-dive-gear--segment:last-child {
      border-radius: 8px 20px 20px 8px;
    }

    .bc-dive-gear--segment:disabled {
      opacity: 0.38;
    }
  }
</style>
