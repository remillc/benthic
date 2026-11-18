<script>
  // @ts-check
  // « Ajouter de l'équipement » (task 2026-11-17-267, docs/mockups-release/equipement-ajout-android.dc.html): a
  // bottom sheet with a search, a « Kits » row (a kit chip checks all its pieces), the inventory by type with
  // checkboxes, and the card « Pièce hors inventaire »: a name typed there is added to this dive only, never to
  // the inventory. « Ajouter à la plongée » puts the choice in the dive's equipment (saved with the dive).
  import { Sheet } from 'framework7-svelte';
  import GearPicker from './GearPicker.svelte';
  import Icon from './Icon.svelte';
  import TextField from './TextField.svelte';
  import { gear, visibleGear } from '../lib/inventory.svelte.js';
  import { addToEquipment, groupGear, searchGear, adhocProblem } from '../lib/inventory.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   opened: boolean,
   *   equipment: import('../lib/inventory.js').DiveEquipment,
   *   onclose: () => void,
   *   onadd: (next: import('../lib/inventory.js').DiveEquipment) => void,
   * }}
   */
  let { opened, equipment, onclose, onadd } = $props();

  let query = $state('');
  /** @type {string[]} */
  let selected = $state([]);
  let adhocName = $state('');

  $effect(() => {
    if (opened) {
      query = '';
      selected = [];
      adhocName = '';
    }
  });

  /** What can be added: no computers (a dive's come from its data), suits (they have their own menus), nor what the dive already has. */
  const available = $derived(visibleGear().filter((g) => g.type !== 'computer' && g.type !== 'suit' && g.type !== 'undersuit' && !equipment.gearIds.includes(g.id)));
  const groups = $derived(groupGear(searchGear(available, query), { picker: true }));
  const ids = $derived(new Set(available.map((g) => g.id)));
  const kits = $derived(gear.kits.map((k) => ({ ...k, ours: k.gearIds.filter((id) => ids.has(id)) })).filter((k) => k.ours.length));
  const canAdd = $derived(selected.length > 0 || adhocProblem(adhocName) === '' && !!adhocName.trim());

  /** A kit chip checks all its pieces, or clears them when they are all checked. @param {string[]} ours */
  function toggleKit(ours) {
    selected = ours.every((id) => selected.includes(id)) ? selected.filter((id) => !ours.includes(id)) : [...new Set([...selected, ...ours])];
  }

  function add() {
    if (!canAdd) return;
    onadd(addToEquipment(equipment, { gearIds: selected, adhocName }));
    onclose();
  }
</script>

<Sheet class="od-add-equipment" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={t('gear.addSheet.title')}>
  <div class="od-add-equipment--content">
    <h2 class="od-add-equipment--title">{t('gear.addSheet.title')}</h2>
    <div class="od-add-equipment--search">
      <Icon name="search" size={20} />
      <input type="search" bind:value={query} placeholder={t('gear.addSheet.search')} aria-label={t('gear.addSheet.search')} />
    </div>

    <div class="od-add-equipment--scroll">
      {#if kits.length}
        <h3 class="od-add-equipment--group">{t('gear.addSheet.kits')}</h3>
        <div class="od-add-equipment--chips">
          {#each kits as kit (kit.id)}
            {@const all = kit.ours.every((id) => selected.includes(id))}
            <button type="button" class="od-add-equipment--chip" class:od-add-equipment--chip-on={all} aria-pressed={all} onclick={() => toggleKit(kit.ours)}>
              <Icon name={all ? 'check' : 'briefcase'} size={18} />{t('gear.addSheet.kitChip', { name: kit.name, n: kit.ours.length })}
            </button>
          {/each}
        </div>
      {/if}

      {#if groups.length}
        <GearPicker {groups} bind:selected picker />
      {:else}
        <p class="od-add-equipment--none">{t(query.trim() ? 'gear.addSheet.noResults' : 'gear.addSheet.empty')}</p>
      {/if}

      <div class="od-add-equipment--adhoc">
        <h3>{t('gear.addSheet.adhocTitle')}</h3>
        <p>{t('gear.addSheet.adhocText')}</p>
        <TextField label={t('gear.addSheet.adhocName')} bind:value={adhocName} />
      </div>
    </div>

    <div class="od-add-equipment--actions">
      <button type="button" class="od-add-equipment--text" onclick={onclose}>{t('gear.addSheet.cancel')}</button>
      <button type="button" class="od-add-equipment--main" disabled={!canAdd} onclick={add}>{t('gear.addSheet.confirm')}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.sheet-modal.od-add-equipment) {
      --f7-sheet-bg-color: var(--od-drawer);
      height: auto;
      max-height: 90%;
      border-radius: 28px 28px 0 0;
    }

    .od-add-equipment--content {
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      padding: 20px 0 calc(12px + env(safe-area-inset-bottom));
    }

    .od-add-equipment--title {
      margin: 0 24px 12px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .od-add-equipment--search {
      margin: 0 16px;
      height: 48px;
      padding: 0 16px;
      border-radius: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--od-surface-2);
      color: var(--od-text-2);

      input {
        flex: 1;
        min-width: 0;
        border: none;
        background: none;
        color: var(--od-text);
        font: inherit;
        font-size: 16px;
        outline: none;
      }
    }

    .od-add-equipment--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .od-add-equipment--group {
      margin: 16px 16px 4px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-add-equipment--chips {
      padding: 0 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .od-add-equipment--chip {
      width: auto;
      height: 40px;
      padding: 0 14px 0 10px;
      border: var(--od-outline-width) solid var(--od-outline);
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-add-equipment--chip-on {
      border-color: transparent;
      background: var(--od-selected-container);
    }

    .od-add-equipment--none {
      margin: 24px 24px 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-add-equipment--adhoc {
      margin: 20px 16px 8px;
      padding: 16px 0 8px;
      border-radius: 20px;
      background: var(--od-surface);

      h3 {
        margin: 0 16px;
        font-size: 16px;
        line-height: 22px;
        font-weight: 600;
      }

      p {
        margin: 2px 16px 8px;
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
      }
    }

    .od-add-equipment--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 16px 0;
    }

    .od-add-equipment--text,
    .od-add-equipment--main {
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-add-equipment--main {
      background: var(--od-secondary);
      color: var(--od-on-secondary);
    }

    .od-add-equipment--main:disabled {
      opacity: 0.38;
    }
  }
</style>
