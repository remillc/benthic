<script>
  // @ts-check
  // « Plongées planifiées » on the desktop (task 2026-11-19-297, docs/mockups/bureau-plans.dc.html): the saved plans in a
  // side panel opened by « Plans enregistrés » in the planner, over the tools with a scrim. A row: the title, the first
  // gas and the date, the maximum depth and the duration; « Nouveau plan » starts a plan from scratch. Escape, ✕ or a
  // click on the scrim closes it. The phone and the tablet keep the page (pages/Plans.svelte).
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDepth, formatDuration, formatGasLong, formatDate, formatMixName } from '../lib/format.js';
  import { planRowTitle } from '../lib/plan-title.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ plans: import('benthic-core').PlannedDive[], openId?: number, onchoose: (id: number) => void, onnew: () => void, onclose: () => void }} */
  let { plans, openId = 0, onchoose, onnew, onclose } = $props();

  const prefs = $derived(logbook.prefs);
  /** @param {import('benthic-core').PlannedDive} plan */
  const title = (plan) => planRowTitle(plan.title, t('plans.fallbackTitle', { date: formatDate(plan.date) })).text;
  /** @param {import('benthic-core').PlannedDive} plan */
  function detail(plan) {
    const gas = plan.gases[0];
    const o2 = gas?.o2Permille ?? 209;
    const he = gas?.hePermille ?? 0;
    return [he === 0 && o2 >= 1000 ? formatGasLong(o2, he) : formatMixName(o2, he), formatDate(plan.date)].join(' · ');
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

<div class="bc-plans-panel--scrim" role="presentation" onclick={onclose}></div>
<aside class="bc-plans-panel" role="dialog" aria-modal="true" aria-labelledby="od-plans-panel-title" bind:this={panel}>
  <header class="bc-plans-panel--head">
    <h2 id="od-plans-panel-title">{t('plans.title')}</h2>
    <button type="button" class="bc-plans-panel--close" aria-label={t('nav.close')} onclick={onclose}><Icon name="close" size={24} /></button>
  </header>
  <p class="bc-plans-panel--intro">{t('plans.intro')}</p>
  {#if plans.length}
    <ul class="bc-plans-panel--list">
      {#each plans as plan (plan.id)}
        <li>
          <button type="button" class="bc-plans-panel--row" class:bc-plans-panel--open={plan.id === openId} onclick={() => onchoose(plan.id)}>
            <span class="bc-plans-panel--texts">
              <span class="bc-plans-panel--name">{title(plan)}</span>
              <span class="bc-plans-panel--detail">{detail(plan)}</span>
            </span>
            <span class="bc-plans-panel--figures">
              <span class="bc-plans-panel--depth">{formatDepth(plan.maxDepthMm, prefs)}</span>
              <span class="bc-plans-panel--time">{formatDuration(plan.durationSeconds)}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="bc-plans-panel--empty">{t('plans.empty')}</p>
  {/if}
  <button type="button" class="bc-outlined-button bc-plans-panel--new" onclick={onnew}>{t('plans.new')}</button>
</aside>

<style>
  @layer od.components {
    .bc-plans-panel--scrim {
      position: fixed;
      inset: 0;
      z-index: 13000;
      background: rgb(0 0 0 / 0.4);
    }
    .bc-plans-panel {
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
      background: var(--bc-background);
      color: var(--bc-text);
      box-shadow: -8px 0 32px rgb(0 0 0 / 0.25);
    }
    .bc-plans-panel--head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 4px 0 8px;
      & h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 500;
      }
    }
    .bc-plans-panel--close {
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 20px;
      background: none;
      color: var(--bc-text);
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    .bc-plans-panel--intro {
      margin: 4px 8px 16px;
      color: var(--bc-text-2);
      font-size: 14px;
    }
    .bc-plans-panel--list {
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
      border-radius: 20px;
      overflow: hidden;
      background: var(--bc-surface);
      & li + li {
        border-top: 1px solid var(--bc-separator);
      }
    }
    .bc-plans-panel--row {
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: 0;
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
    .bc-plans-panel--open,
    .bc-plans-panel--open:hover {
      background: var(--bc-selected-container);
    }
    .bc-plans-panel--texts,
    .bc-plans-panel--figures {
      display: flex;
      flex-direction: column;
    }
    .bc-plans-panel--texts {
      flex: 1;
      min-width: 0;
    }
    .bc-plans-panel--figures {
      align-items: flex-end;
    }
    .bc-plans-panel--name,
    .bc-plans-panel--depth {
      font-size: 16px;
    }
    .bc-plans-panel--depth {
      font-weight: 600;
    }
    .bc-plans-panel--detail,
    .bc-plans-panel--time {
      color: var(--bc-text-2);
      font-size: 13px;
    }
    .bc-plans-panel--empty {
      margin: 24px 8px;
      color: var(--bc-text-2);
    }
    .bc-plans-panel--new {
      width: auto;
    }
  }
</style>
