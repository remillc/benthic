<script>
  // @ts-check
  // « Plongées planifiées » on the desktop (task 2026-11-19-297, docs/mockups/bureau-plans.dc.html): the saved plans in a
  // side panel opened by « Plans enregistrés » in the planner, over the tools with a scrim. A row: the title, the first
  // gas and the date, the maximum depth and the duration; « Nouveau plan » starts a plan from scratch. Escape, ✕ or a
  // click on the scrim closes it. The phone and the tablet keep the page (pages/Plans.svelte).
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDepth, formatDuration, formatGasLong, formatShortDate, formatMixName } from '../lib/format.js';
  import { planRowTitle } from '../lib/plan-title.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ plans: import('opendives-core').PlannedDive[], openId?: number, onchoose: (id: number) => void, onnew: () => void, onclose: () => void }} */
  let { plans, openId = 0, onchoose, onnew, onclose } = $props();

  const prefs = $derived(logbook.prefs);
  /** @param {import('opendives-core').PlannedDive} plan */
  const title = (plan) => planRowTitle(plan.title, t('plans.fallbackTitle', { date: formatShortDate(plan.date) })).text;
  /** @param {import('opendives-core').PlannedDive} plan */
  function detail(plan) {
    const gas = plan.gases[0];
    const o2 = gas?.o2Permille ?? 209;
    const he = gas?.hePermille ?? 0;
    return [he === 0 && o2 >= 1000 ? formatGasLong(o2, he) : formatMixName(o2, he), formatShortDate(plan.date)].join(' · ');
  }

  /** @type {HTMLElement|undefined} */
  let panel = $state();
  onMount(() => {
    tick().then(() => /** @type {HTMLElement|null|undefined} */ (panel?.querySelector('button'))?.focus());
    /** @param {KeyboardEvent} e */
    const keydown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onclose();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
</script>

<div class="od-plans-panel--scrim" role="presentation" onclick={onclose}></div>
<aside class="od-plans-panel" role="dialog" aria-modal="true" aria-labelledby="od-plans-panel-title" bind:this={panel}>
  <header class="od-plans-panel--head">
    <h2 id="od-plans-panel-title">{t('plans.title')}</h2>
    <button type="button" class="od-plans-panel--close" aria-label={t('nav.close')} onclick={onclose}><Icon name="close" size={24} /></button>
  </header>
  <p class="od-plans-panel--intro">{t('plans.intro')}</p>
  {#if plans.length}
    <ul class="od-plans-panel--list">
      {#each plans as plan (plan.id)}
        <li>
          <button type="button" class="od-plans-panel--row" class:od-plans-panel--open={plan.id === openId} onclick={() => onchoose(plan.id)}>
            <span class="od-plans-panel--texts">
              <span class="od-plans-panel--name">{title(plan)}</span>
              <span class="od-plans-panel--detail">{detail(plan)}</span>
            </span>
            <span class="od-plans-panel--figures">
              <span class="od-plans-panel--depth">{formatDepth(plan.maxDepthMm, prefs)}</span>
              <span class="od-plans-panel--time">{formatDuration(plan.durationSeconds)}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="od-plans-panel--empty">{t('plans.empty')}</p>
  {/if}
  <button type="button" class="od-outlined-button od-plans-panel--new" onclick={onnew}>{t('plans.new')}</button>
</aside>

<style>
  @layer od.components {
    .od-plans-panel--scrim {
      position: fixed;
      inset: 0;
      z-index: 13000;
      background: rgb(0 0 0 / 0.4);
    }
    .od-plans-panel {
      position: fixed;
      z-index: 13001;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(440px, 100%);
      box-sizing: border-box;
      padding: 16px;
      overflow-y: auto;
      border-radius: 28px 0 0 28px;
      background: var(--od-background);
      color: var(--od-text);
      box-shadow: -8px 0 32px rgb(0 0 0 / 0.25);
    }
    .od-plans-panel--head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 4px 0 8px;
    }
    .od-plans-panel--head h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 500;
    }
    .od-plans-panel--close {
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 20px;
      background: none;
      color: var(--od-text);
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .od-plans-panel--intro {
      margin: 4px 8px 16px;
      color: var(--od-text-2);
      font-size: 14px;
    }
    .od-plans-panel--list {
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
      border-radius: 20px;
      overflow: hidden;
      background: var(--od-surface);
    }
    .od-plans-panel--list li + li {
      border-top: 1px solid var(--od-separator);
    }
    .od-plans-panel--row {
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: 0;
      display: flex;
      align-items: center;
      gap: 12px;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .od-plans-panel--row:hover {
      background: color-mix(in srgb, var(--od-text) 6%, transparent);
    }
    .od-plans-panel--open,
    .od-plans-panel--open:hover {
      background: var(--od-selected-container);
    }
    .od-plans-panel--texts,
    .od-plans-panel--figures {
      display: flex;
      flex-direction: column;
    }
    .od-plans-panel--texts {
      flex: 1;
      min-width: 0;
    }
    .od-plans-panel--figures {
      align-items: flex-end;
    }
    .od-plans-panel--name,
    .od-plans-panel--depth {
      font-size: 16px;
    }
    .od-plans-panel--depth {
      font-weight: 600;
    }
    .od-plans-panel--detail,
    .od-plans-panel--time {
      color: var(--od-text-2);
      font-size: 13px;
    }
    .od-plans-panel--empty {
      margin: 24px 8px;
      color: var(--od-text-2);
    }
    .od-plans-panel--new {
      width: auto;
    }
  }
</style>
