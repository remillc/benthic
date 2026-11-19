<script>
  // @ts-check
  // The list pane of « Entretien » on a wide screen (tasks 2026-11-18-275 and 277, docs/mockups-release/bureau-profil-entretien):
  // the three figures, then « En retard », « Bientôt » and « À jour ». The chosen piece is lit; its maintenance opens
  // in the pane to the right. The phone's page (pages/ProfileMaintenance.svelte) has the same content in one column.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import GearIcon from './GearIcon.svelte';
  import { gear, loadInventory, maintenanceSections } from '../lib/inventory.svelte.js';
  import { taskInline, tagText, lineText } from '../lib/maintenance-text.js';
  import { formatDate } from '../lib/format.js';
  import { showProfilePath } from '../lib/profile-frame.js';
  import { t } from '../lib/i18n.js';

  /** `selected`: the piece whose maintenance is open on the right. @type {{ selected?: string|null }} */
  let { selected = null } = $props();

  onMount(loadInventory);

  const sections = $derived(maintenanceSections());
  const empty = $derived(gear.ready && sections.counts.overdue + sections.counts.soon + sections.counts.ok === 0);
  const keys = /** @type {const} */ (['overdue', 'soon', 'ok']);

  /** @param {import('../lib/maintenance.js').Evaluation} e */
  const piece = (e) => gear.pieces.find((g) => g.id === e.item.gearId);
</script>

<section class="od-maintenance-list" aria-label={t('maintenance.title')}>
  <header class="od-maintenance-list--head"><h1>{t('maintenance.title')}</h1></header>
  <div class="od-maintenance-list--scroll">
    <div class="od-maintenance-list--figures">
      {#each keys as key (key)}
        <span class="od-maintenance-list--figure od-maintenance-list--figure-{key}">
          <span class="od-maintenance-list--value">{sections.counts[key]}</span>
          <span class="od-maintenance-list--legend">{t(`maintenance.figures.${key}`)}</span>
        </span>
      {/each}
    </div>
    {#if empty}
      <div class="od-maintenance-list--empty">
        <h2>{t('maintenance.emptyTitle')}</h2>
        <p>{t('maintenance.emptyText')}</p>
      </div>
    {/if}
    {#each keys as key (key)}
      {#if sections[key].length}
        <h2 class="od-maintenance-list--group">{t(`maintenance.sections.${key}`)}</h2>
        {#each sections[key] as e (e.item.id)}
          {@const p = piece(e)}
          {#if p}
            <button type="button" class="od-maintenance-list--row" class:od-maintenance-list--on={selected === p.id} onclick={() => showProfilePath(`/profile/gear/${p.id}/maintenance`)}>
              <span class="od-maintenance-list--tile"><GearIcon type={p.type} name={p.name} size={22} piece={p} tile={40} /></span>
              <span class="od-maintenance-list--texts">
                <span class="od-maintenance-list--name">{p.name} · {taskInline(e.item)}</span>
                <span class="od-maintenance-list--line">{lineText(e, formatDate)}</span>
              </span>
              <span class="od-maintenance-list--tag od-maintenance-list--tag-{key}">{tagText(e)}</span>
            </button>
          {/if}
        {/each}
      {/if}
    {/each}
    <p class="od-maintenance-list--note"><Icon name="info" size={18} /><span>{t('maintenance.listNote')}</span></p>
  </div>
</section>

<style>
  @layer od.components {
    .od-maintenance-list {
      flex: none;
      width: var(--od-pf-list);
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: var(--od-surface);
      border-right: 1px solid var(--od-separator);
    }
    .od-maintenance-list--head {
      flex: none;
      height: 64px;
      padding: 0 20px;
      display: flex;
      align-items: center;
    }
    .od-maintenance-list--head h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 500;
    }
    .od-maintenance-list--scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0 8px 16px;
    }
    .od-maintenance-list--figures {
      padding: 12px 16px;
      border-radius: 20px;
      display: flex;
      justify-content: space-between;
      background: var(--od-background);
    }
    .od-maintenance-list--figure {
      display: flex;
      flex-direction: column;
    }
    .od-maintenance-list--value {
      font-size: 24px;
      font-weight: 500;
    }
    .od-maintenance-list--figure-overdue .od-maintenance-list--value {
      color: var(--od-alarm);
    }
    .od-maintenance-list--legend {
      color: var(--od-text-2);
      font-size: 13px;
    }
    .od-maintenance-list--group {
      margin: 16px 12px 4px;
      color: var(--od-text-2);
      font-size: 14px;
      font-weight: 600;
    }
    .od-maintenance-list--row {
      width: 100%;
      min-height: 64px;
      padding: 8px 12px;
      border: 0;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .od-maintenance-list--row:hover {
      background: color-mix(in srgb, var(--od-text) 6%, transparent);
    }
    .od-maintenance-list--on,
    .od-maintenance-list--on:hover {
      background: var(--od-selected-container);
    }
    .od-maintenance-list--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
    }
    .od-maintenance-list--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .od-maintenance-list--name {
      font-size: 15px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-maintenance-list--line {
      color: var(--od-text-2);
      font-size: 13px;
    }
    .od-maintenance-list--tag {
      flex: none;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--od-background);
      font-size: 12px;
      font-weight: 500;
    }
    .od-maintenance-list--tag-overdue {
      background: var(--od-alarm-tint);
      color: var(--od-alarm);
    }
    .od-maintenance-list--note,
    .od-maintenance-list--empty {
      margin: 16px 12px;
      display: flex;
      gap: 8px;
      color: var(--od-text-2);
      font-size: 13px;
    }
    .od-maintenance-list--empty {
      display: block;
      text-align: center;
    }
  }
</style>
