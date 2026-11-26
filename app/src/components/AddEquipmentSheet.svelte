<script>
  // @ts-check
  // « Ajouter de l'équipement » (task 2026-11-17-267, docs/mockups-release/equipement-ajout-android.dc.html): a
  // bottom sheet with a search, a « Kits » row (a kit chip checks all its pieces), the inventory by type with
  // checkboxes, and the card « Pièce hors inventaire »: a name typed there is added to this dive only, never to
  // the inventory. « Ajouter à la plongée » puts the choice in the dive's equipment (saved with the dive).
  import { Sheet } from 'framework7-svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import { layout } from '../lib/layout.svelte.js';
  import GearPicker from './GearPicker.svelte';
  import Icon from './Icon.svelte';
  import SearchClear from './SearchClear.svelte';
  import TextField from './TextField.svelte';
  import { gear, visibleGear, evaluations } from '../lib/inventory.svelte.js';
  import { taskLabel } from '../lib/maintenance-text.js';
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

  /** The overdue reminders that warn in a dive, by piece: shown under the piece, which stays selectable (task 2026-11-19-308). */
  const lateOf = $derived.by(() => {
    /** @type {Map<string, string>} */
    const map = new Map();
    for (const e of evaluations()) {
      if (e.status !== 'overdue' || !e.item.warnInDive) continue;
      const text = t('maintenance.late', { task: taskLabel(e.item) });
      map.set(e.item.gearId, map.has(e.item.gearId) ? `${map.get(e.item.gearId)} · ${text}` : text);
    }
    return map;
  });

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

{#snippet fields()}
    <div class="bc-add-equipment--search">
      <Icon name="search" size={20} />
      <input type="search" bind:value={query} placeholder={t('gear.addSheet.search')} aria-label={t('gear.addSheet.search')} />
      {#if query}<SearchClear onclear={() => (query = '')} />{/if}
    </div>

    <div class="bc-add-equipment--scroll" data-bc-scroll>
      {#if kits.length}
        <h3 class="bc-add-equipment--group">{t('gear.addSheet.kits')}</h3>
        <div class="bc-add-equipment--chips">
          {#each kits as kit (kit.id)}
            {@const all = kit.ours.every((id) => selected.includes(id))}
            <button type="button" class="bc-add-equipment--chip" class:bc-add-equipment--chip-on={all} aria-pressed={all} onclick={() => toggleKit(kit.ours)}>
              <Icon name={all ? 'check' : 'briefcase'} size={18} />{t('gear.addSheet.kitChip', { name: kit.name, n: kit.ours.length })}
            </button>
          {/each}
        </div>
      {/if}

      {#if groups.length}
        <GearPicker {groups} bind:selected picker warning={(g) => lateOf.get(g.id) ?? ''} />
      {:else}
        <p class="bc-add-equipment--none">{t(query.trim() ? 'gear.addSheet.noResults' : 'gear.addSheet.empty')}</p>
      {/if}

      <div class="bc-add-equipment--adhoc">
        <h3>{t('gear.addSheet.adhocTitle')}</h3>
        <p>{t('gear.addSheet.adhocText')}</p>
        <TextField label={t('gear.addSheet.adhocName')} bind:value={adhocName} />
      </div>
    </div>
{/snippet}

{#snippet buttons()}
  <button type="button" class="bc-add-equipment--text" onclick={onclose}>{t('gear.addSheet.cancel')}</button>
  <button type="button" class="bc-add-equipment--main" disabled={!canAdd} onclick={add}>{t('gear.addSheet.confirm')}</button>
{/snippet}

<!-- A phone: the bottom sheet. A tablet or a desktop: a dialog (task 2026-11-26-404, mock-ups android-tablette-profil-plongee-ajout-paysage and bureau-profil-plongee-ajout). -->
{#if layout.phone}
  <Sheet class="bc-add-equipment" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={t('gear.addSheet.title')}>
    <div class="bc-add-equipment--content">
      <h2 class="bc-add-equipment--title">{t('gear.addSheet.title')}</h2>
      {@render fields()}
      <div class="bc-add-equipment--actions">{@render buttons()}</div>
    </div>
  </Sheet>
{:else if opened}
  <Md3Dialog title={t('gear.addSheet.title')} class="bc-add-equipment-dialog" oncancel={onclose}>
    <div class="bc-add-equipment--dialog-body">{@render fields()}</div>
    {#snippet actions()}{@render buttons()}{/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer bc.components {
    :global(.sheet-modal.bc-add-equipment) {
      --f7-sheet-bg-color: var(--bc-drawer);
      height: auto;
      max-height: 90%;
      border-radius: 28px 28px 0 0;
    }

    .bc-add-equipment--content {
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      padding: 20px 0 calc(12px + var(--bc-safe-bottom));
    }

    .bc-add-equipment--title {
      margin: 0 24px 12px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .bc-add-equipment--dialog-body {
      display: flex;
      flex-direction: column;
      min-height: 0;
      max-height: min(560px, 70vh);
    }

    :global(.bc-add-equipment-dialog) {
      width: 560px;
      max-width: calc(100vw - 48px);
    }

    .bc-add-equipment--search {
      margin: 0 16px;
      height: 48px;
      padding: 0 16px;
      border-radius: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bc-surface-2);
      color: var(--bc-text-2);

      input {
        flex: 1;
        min-width: 0;
        border: none;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 16px;
        outline: none;
      }
    }

    .bc-add-equipment--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .bc-add-equipment--group {
      margin: 16px 16px 4px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-add-equipment--chips {
      padding: 0 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .bc-add-equipment--chip {
      width: auto;
      height: 40px;
      padding: 0 14px 0 10px;
      border: var(--bc-outline-width) solid var(--bc-outline);
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-add-equipment--chip-on {
      border-color: transparent;
      background: var(--bc-selected-container);
    }

    .bc-add-equipment--none {
      margin: 24px 24px 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-add-equipment--adhoc {
      margin: 20px 16px 8px;
      padding: 16px 0 8px;
      border-radius: 20px;
      background: var(--bc-surface);

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
        color: var(--bc-text-2);
      }
    }

    .bc-add-equipment--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 16px 0;
    }

    .bc-add-equipment--text,
    .bc-add-equipment--main {
      width: auto;
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-add-equipment--main {
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      &:disabled {
        opacity: 0.38;
      }
    }
  }
</style>
