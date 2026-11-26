<script>
  // @ts-check
  // The « Types de lest » card of the desktop Réglages › Équipement (task 2026-11-26-403, mock-ups bureau-reglages-equipement and
  // bureau-reglages-equipement-lest), under « Types de bouteilles »: the explanation, the diver's weight types sorted by name with
  // the count of dives and the weight at the right, then « Ajouter un type ». A row opens the 560 px dialog « Modifier le type de
  // lest » (DesktopWeightTypeDialog). Same layout as DesktopCylinderTypes.
  import { onMount } from 'svelte';
  import { readWeightTypeRows } from '../lib/weight-types.svelte.js';
  import DesktopWeightTypeDialog from './DesktopWeightTypeDialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { weightPlaceName } from '../lib/desktop-detail.js';
  import { formatNumber, formatWeight } from '../lib/format.js';

  /** @type {import('../lib/weight-type-files.js').WeightTypeRow[]} */
  let types = $state([]);
  /** The dialog: a type to edit, or `{ type: null }` for a new one. @type {{ type: import('../lib/weight-type-files.js').WeightTypeRow|null }|null} */
  let dialog = $state(null);

  async function refresh() {
    try {
      types = await readWeightTypeRows();
    } catch (e) {
      console.error('Reading the weight types', e);
    }
  }
  onMount(refresh);

  /** « Dans 12 plongées ». @param {import('../lib/weight-type-files.js').WeightTypeRow} type */
  const inDives = ({ dives: n }) => t(n === 0 ? 'settings.weights.inNoDive' : n === 1 ? 'settings.weights.inOneDive' : 'settings.weights.inDives', { n: formatNumber(n, 0) });

  async function done() {
    dialog = null;
    await refresh();
  }
</script>

<div class="bc-desktop-weight-types" role="list">
  <p class="bc-desktop-weight-types--intro">{t('settings.weights.intro')}</p>

  {#each types as type (type.name)}
    <div role="listitem" class="bc-desktop-weight-types--item">
      <button type="button" class="bc-desktop-weight-types--row" aria-haspopup="dialog" onclick={() => (dialog = { type })}>
        <span class="bc-desktop-weight-types--texts">
          <span class="bc-desktop-weight-types--label">{weightPlaceName(type.name)}</span>
          <span class="bc-desktop-weight-types--supporting">{inDives(type)}</span>
        </span>
        <span class="bc-desktop-weight-types--value">{type.grams ? formatWeight(type.grams, logbook.prefs) : ''}</span>
      </button>
    </div>
  {/each}

  <div class="bc-desktop-weight-types--add">
    <button type="button" class="bc-outlined-button bc-desktop-weight-types--add-button" aria-haspopup="dialog" onclick={() => (dialog = { type: null })}>
      <Icon name="plus" size={18} />
      {t('settings.weights.add')}
    </button>
  </div>
</div>

{#if dialog}
  <DesktopWeightTypeDialog type={dialog.type} oncancel={() => (dialog = null)} ondone={done} />
{/if}

<style>
  @layer bc.components {
    .bc-desktop-weight-types--intro {
      margin: 0;
      padding: 14px 16px 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-desktop-weight-types--item + .bc-desktop-weight-types--item {
      box-shadow: inset 0 1px 0 var(--bc-separator);
    }

    .bc-desktop-weight-types--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: -2px;
      }
    }

    .bc-desktop-weight-types--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-desktop-weight-types--label {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-desktop-weight-types--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-desktop-weight-types--value {
      flex: none;
      font-size: 14px;
      color: var(--bc-text-2);
      font-variant-numeric: tabular-nums;
    }

    .bc-desktop-weight-types--add {
      padding: 8px 16px 14px;
    }

    .bc-desktop-weight-types--add-button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-weight-types--row:hover {
        background: color-mix(in srgb, var(--bc-text) 5%, transparent);
      }
    }
  }
</style>
