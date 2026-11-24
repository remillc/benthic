<script>
  // @ts-check
  // The « Types de bouteilles » card of the desktop Réglages › Équipement (task 2026-11-19-287, mock-up
  // bureau-reglages-equipement; one list since task 2026-11-23-373): the explanation, the types of the logbook's dives
  // and the diver's added ones with the count of dives (« Inutilisé » for an added type no dive uses), « Ajouter un
  // type », then the switches (the `children`). A row opens the 560 px dialog « Modifier le type »
  // (DesktopCylinderTypeDialog).
  import { onMount } from 'svelte';
  import { readTypeRows } from '../lib/cylinder-type-library.svelte.js';
  import DesktopCylinderTypeDialog from './DesktopCylinderTypeDialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { cylinderTypeLabel } from '../lib/cylinder-types.js';
  import { formatCylinderSize, formatNumber, formatPressure } from '../lib/format.js';

  /** @type {{ children?: import('svelte').Snippet }} */
  let { children } = $props();

  /** @type {import('../lib/cylinder-type-files.js').TypeRow[]} */
  let types = $state([]);
  /** The dialog: a type to edit, or `{ type: null }` for a new one. @type {{ type: import('../lib/cylinder-type-files.js').TypeRow|null }|null} */
  let dialog = $state(null);

  async function refresh() {
    try {
      types = await readTypeRows();
    } catch (e) {
      console.error('Reading the cylinder types', e);
    }
  }

  onMount(refresh);

  /** "11,1 L · 207 bar", in the units of the settings. @param {import('benthic-core').CylinderType} type */
  function size(type) {
    return [formatCylinderSize(type.ml, type.mbar, logbook.prefs), type.mbar ? formatPressure(type.mbar, logbook.prefs) : ''].filter(Boolean).join(' · ');
  }

  /** « Dans 12 plongées », or « Ajouté par vous · dans aucune plongée ». @param {import('../lib/cylinder-type-files.js').TypeRow} type */
  function inDives({ dives: n, fileId }) {
    if (n === 0 && fileId) return t('settings.cylinders.addedUnused');
    return t(n === 0 ? 'settings.cylinders.inNoDive' : n === 1 ? 'settings.cylinders.inOneDive' : 'settings.cylinders.inDives', { n: formatNumber(n, 0) });
  }

  async function done() {
    dialog = null;
    await refresh();
  }
</script>

{#snippet list(/** @type {import('../lib/cylinder-type-files.js').TypeRow[]} */ items)}
  {#each items as type (type.name)}
    <div role="listitem" class="bc-desktop-cylinder-types--item">
      <button type="button" class="bc-desktop-cylinder-types--row" aria-haspopup="dialog" onclick={() => (dialog = { type })}>
        <span class="bc-desktop-cylinder-types--texts">
          <span class="bc-desktop-cylinder-types--label">{cylinderTypeLabel(type.name)}{#if !type.dives && type.fileId}<span class="bc-desktop-cylinder-types--unused">{t('settings.cylinders.unused')}</span>{/if}</span>
          <span class="bc-desktop-cylinder-types--supporting">{inDives(type)}</span>
        </span>
        <span class="bc-desktop-cylinder-types--value">{size(type)}</span>
      </button>
    </div>
  {/each}
{/snippet}

<div class="bc-desktop-cylinder-types" role="list">
  <p class="bc-desktop-cylinder-types--intro">{t('settings.cylinders.intro')}</p>

  {@render list(types)}

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
  @layer bc.components {
    .bc-desktop-cylinder-types--intro {
      margin: 0;
      padding: 14px 16px 4px;
      font-size: 13px;
      line-height: 18px;
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

    .bc-desktop-cylinder-types--add {
      padding: 8px 16px 14px;
    }

    .bc-desktop-cylinder-types--add-button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-cylinder-types--row:hover {
        background: color-mix(in srgb, var(--bc-text) 5%, transparent);
      }
    }
  }
</style>
