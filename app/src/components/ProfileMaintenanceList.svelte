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

<section class="bc-maintenance-list" aria-label={t('maintenance.title')}>
  <header class="bc-maintenance-list--head"><h1>{t('maintenance.title')}</h1></header>
  <div class="bc-maintenance-list--scroll">
    <div class="bc-maintenance-list--figures">
      {#each keys as key (key)}
        <span class="bc-maintenance-list--figure bc-maintenance-list--figure-{key}">
          <span class="bc-maintenance-list--value">{sections.counts[key]}</span>
          <span class="bc-maintenance-list--legend">{t(`maintenance.figures.${key}`)}</span>
        </span>
      {/each}
    </div>
    {#if empty}
      <div class="bc-maintenance-list--empty">
        <h2>{t('maintenance.emptyTitle')}</h2>
        <p>{t('maintenance.emptyText')}</p>
      </div>
    {/if}
    {#each keys as key (key)}
      {#if sections[key].length}
        <h2 class="bc-maintenance-list--group">{t(`maintenance.sections.${key}`)}</h2>
        {#each sections[key] as e (e.item.id)}
          {@const p = piece(e)}
          {#if p}
            <button type="button" class="bc-maintenance-list--row" class:bc-maintenance-list--on={selected === p.id} onclick={() => showProfilePath(`/profile/gear/${p.id}/maintenance`)}>
              <span class="bc-maintenance-list--tile"><GearIcon type={p.type} name={p.name} size={22} piece={p} tile={40} /></span>
              <span class="bc-maintenance-list--texts">
                <span class="bc-maintenance-list--name">{p.name} · {taskInline(e.item)}</span>
                <span class="bc-maintenance-list--line">{lineText(e, formatDate)}</span>
              </span>
              <span class="bc-maintenance-list--tag bc-maintenance-list--tag-{key}">{tagText(e)}</span>
            </button>
          {/if}
        {/each}
      {/if}
    {/each}
    <p class="bc-maintenance-list--note"><Icon name="info" size={18} /><span>{t('maintenance.listNote')}</span></p>
  </div>
</section>

<style>
  @layer od.components {
    .bc-maintenance-list {
      flex: none;
      width: var(--bc-pf-list);
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      background: var(--bc-surface);
      border-right: 1px solid var(--bc-separator);
    }
    .bc-maintenance-list--head {
      flex: none;
      height: 64px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      & h1 {
        margin: 0;
        font-size: 22px;
        font-weight: 500;
      }
    }
    .bc-maintenance-list--scroll {
      flex: 1;
      overflow-y: auto;
      padding: 0 8px 16px;
    }
    .bc-maintenance-list--figures {
      padding: 12px 16px;
      border-radius: 20px;
      display: flex;
      justify-content: space-between;
      background: var(--bc-background);
    }
    .bc-maintenance-list--figure {
      display: flex;
      flex-direction: column;
    }
    .bc-maintenance-list--value {
      font-size: 24px;
      font-weight: 500;
    }
    .bc-maintenance-list--figure-overdue .bc-maintenance-list--value {
      color: var(--bc-alarm);
    }
    .bc-maintenance-list--legend {
      color: var(--bc-text-2);
      font-size: 13px;
    }
    .bc-maintenance-list--group {
      margin: 16px 12px 4px;
      color: var(--bc-text-2);
      font-size: 14px;
      font-weight: 600;
    }
    .bc-maintenance-list--row {
      width: 100%;
      min-height: 64px;
      padding: 8px 12px;
      border: 0;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
    }
    .bc-maintenance-list--on,
    .bc-maintenance-list--on:hover {
      background: var(--bc-selected-container);
    }
    .bc-maintenance-list--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
    }
    .bc-maintenance-list--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .bc-maintenance-list--name {
      font-size: 15px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-maintenance-list--line {
      color: var(--bc-text-2);
      font-size: 13px;
    }
    .bc-maintenance-list--tag {
      flex: none;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--bc-background);
      font-size: 12px;
      font-weight: 500;
    }
    .bc-maintenance-list--tag-overdue {
      background: var(--bc-alarm-tint);
      color: var(--bc-alarm);
    }
    .bc-maintenance-list--note,
    .bc-maintenance-list--empty {
      margin: 16px 12px;
      display: flex;
      gap: 8px;
      color: var(--bc-text-2);
      font-size: 13px;
    }
    .bc-maintenance-list--empty {
      display: block;
      text-align: center;
    }
  }
</style>
