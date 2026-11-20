<script>
  // @ts-check
  // The « Types de bouteilles » card of the desktop Réglages › Équipement (task 2026-11-19-287, mock-up
  // bureau-reglages-equipement): the explanation, « Vos types » with the count of dives and « Inutilisé »,
  // a few standard types and « Et N autres types standard… », « Ajouter un type », then the switches
  // (the `children`). A row opens the 560 px dialog « Modifier le type » (DesktopCylinderTypeDialog).
  import { onMount } from 'svelte';
  import { OpenDivesCore } from 'opendives-core';
  import DesktopCylinderTypeDialog from './DesktopCylinderTypeDialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { cylinderTypeLabel } from '../lib/cylinder-types.js';
  import { formatCylinderSize, formatNumber, formatPressure } from '../lib/format.js';

  /** @type {{ children?: import('svelte').Snippet }} */
  let { children } = $props();

  /** The standard types shown before « Et N autres types standard… ». */
  const FEW = 3;

  /** @type {import('opendives-core').CylinderType[]} */
  let types = $state([]);
  let allStandard = $state(false);
  /** The dialog: a type to edit, or `{ type: null }` for a new one. @type {{ type: import('opendives-core').CylinderType|null }|null} */
  let dialog = $state(null);

  async function refresh() {
    try {
      types = (await OpenDivesCore.cylinderTypes({ action: 'list' })).types;
    } catch (e) {
      console.error('Reading the cylinder types', e);
    }
  }

  onMount(refresh);
  // « Proposer les tailles standard » changes the list of standard types.
  $effect(() => {
    logbook.prefs.displayDefaultTankInfos;
    refresh();
  });

  const yours = $derived(types.filter((type) => !type.standard));
  const standard = $derived(types.filter((type) => type.standard));
  const shownStandard = $derived(allStandard ? standard : standard.slice(0, FEW));

  /** "11,1 L · 207 bar", in the units of the settings. @param {import('opendives-core').CylinderType} type */
  function size(type) {
    return [formatCylinderSize(type.ml, type.mbar, logbook.prefs), type.mbar ? formatPressure(type.mbar, logbook.prefs) : ''].filter(Boolean).join(' · ');
  }

  /** "Dans 12 plongées". @param {number} n */
  function inDives(n) {
    return t(n === 0 ? 'settings.cylinders.inNoDive' : n === 1 ? 'settings.cylinders.inOneDive' : 'settings.cylinders.inDives', { n: formatNumber(n, 0) });
  }

  async function done() {
    dialog = null;
    await refresh();
  }
</script>

{#snippet list(/** @type {import('opendives-core').CylinderType[]} */ items, /** @type {boolean} */ usage)}
  {#each items as type (type.name)}
    <div role="listitem" class="bc-desktop-cylinder-types--item">
      <button type="button" class="bc-desktop-cylinder-types--row" aria-haspopup="dialog" onclick={() => (dialog = { type })}>
        <span class="bc-desktop-cylinder-types--texts">
          <span class="bc-desktop-cylinder-types--label">{cylinderTypeLabel(type.name)}{#if usage && !type.dives}<span class="bc-desktop-cylinder-types--unused">{t('settings.cylinders.unused')}</span>{/if}</span>
          {#if usage}<span class="bc-desktop-cylinder-types--supporting">{inDives(type.dives)}</span>{/if}
        </span>
        <span class="bc-desktop-cylinder-types--value">{size(type)}</span>
      </button>
    </div>
  {/each}
{/snippet}

<div class="bc-desktop-cylinder-types" role="list">
  <p class="bc-desktop-cylinder-types--intro">{t('settings.cylinders.intro')}</p>

  {#if yours.length}
    <h4 class="bc-desktop-cylinder-types--title">{t('settings.cylinders.yours')}</h4>
    {@render list(yours, true)}
  {/if}

  <h4 class="bc-desktop-cylinder-types--title">{t('settings.cylinders.standard')}</h4>
  {#if standard.length}
    {@render list(shownStandard, false)}
    {#if standard.length > shownStandard.length}
      <div role="listitem" class="bc-desktop-cylinder-types--item">
        <button type="button" class="bc-desktop-cylinder-types--more" aria-expanded="false" onclick={() => (allStandard = true)}>
          {t('settings.cylinders.standardMore', { n: standard.length - shownStandard.length })}
        </button>
      </div>
    {/if}
    <p class="bc-desktop-cylinder-types--note">{t('settings.cylinders.standardNote')}</p>
  {:else}
    <p class="bc-desktop-cylinder-types--note">{t('settings.cylinders.hidden')}</p>
  {/if}

  <div class="bc-desktop-cylinder-types--add">
    <button type="button" class="bc-outlined-button bc-desktop-cylinder-types--add-button" aria-haspopup="dialog" onclick={() => (dialog = { type: null })}>
      <Icon name="plus" size={18} />
      {t('settings.cylinders.add')}
    </button>
  </div>
  {@render children?.()}
</div>

{#if dialog}
  <DesktopCylinderTypeDialog type={dialog.type} oncancel={() => (dialog = null)} ondone={done} />
{/if}

<style>
  @layer od.components {
    .bc-desktop-cylinder-types--intro {
      margin: 0;
      padding: 14px 16px 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-desktop-cylinder-types--title {
      margin: 0;
      padding: 14px 16px 4px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
      color: var(--bc-text-2);
    }

    .bc-desktop-cylinder-types--item + .bc-desktop-cylinder-types--item {
      box-shadow: inset 0 1px 0 var(--bc-separator);
    }

    .bc-desktop-cylinder-types--row {
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

    .bc-desktop-cylinder-types--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-desktop-cylinder-types--label {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-desktop-cylinder-types--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* An outlined label after the name of a type no dive uses. */
    .bc-desktop-cylinder-types--unused {
      margin-inline-start: 8px;
      padding: 0 6px;
      border: var(--bc-outline-width) solid var(--bc-text-2);
      border-radius: 8px;
      font-size: 11px;
      line-height: 16px;
      color: var(--bc-text-2);
    }

    .bc-desktop-cylinder-types--value {
      flex: none;
      font-size: 14px;
      color: var(--bc-text-2);
      font-variant-numeric: tabular-nums;
    }

    .bc-desktop-cylinder-types--more {
      box-sizing: border-box;
      width: 100%;
      min-height: 48px;
      padding: 8px 16px;
      border: none;
      background: none;
      color: var(--bc-text-2);
      font: inherit;
      font-size: 14px;
      text-align: start;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: -2px;
      }
    }

    .bc-desktop-cylinder-types--note {
      margin: 0;
      padding: 4px 16px 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-desktop-cylinder-types--add {
      padding: 8px 16px 14px;
    }

    .bc-desktop-cylinder-types--add-button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-cylinder-types--row:hover,
      .bc-desktop-cylinder-types--more:hover {
        background: color-mix(in srgb, var(--bc-text) 5%, transparent);
      }
    }
  }
</style>
