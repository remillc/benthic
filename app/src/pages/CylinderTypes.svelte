<script>
  // @ts-check
  // Settings, "Types de bouteilles" (spec, section 4, "Cylinder types sub-screen", task 2026-11-23-373): one list, the types
  // the logbook's dives use united with the ones the diver added, each with its volume and working pressure and how many
  // dives use it. A tap opens the type's page; "Ajouter un type" opens an empty one.
  import BackLink from '../components/BackLink.svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { readTypeRows } from '../lib/cylinder-type-library.svelte.js';
  import { t } from '../lib/i18n.js';
  import { ios } from '../lib/layout.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { cylinderTypeLabel } from '../lib/cylinder-types.js';
  import { formatCylinderSize, formatNumber, formatPressure } from '../lib/format.js';

  /** @type {import('../lib/cylinder-type-files.js').TypeRow[]} */
  let types = $state([]);

  async function refresh() {
    try {
      types = await readTypeRows();
    } catch (e) {
      console.error('Reading the cylinder types', e);
    }
  }

  /** "11,1 L · 207 bar", in the units of the settings. @param {import('../lib/cylinder-type-files.js').TypeRow} type */
  function size(type) {
    return [formatCylinderSize(type.ml, type.mbar, logbook.prefs), type.mbar ? formatPressure(type.mbar, logbook.prefs) : '']
      .filter(Boolean)
      .join(' · ');
  }

  /** « Dans 12 plongées », or « Ajouté par vous · dans aucune plongée » for a type of the diver's that no dive uses. @param {import('../lib/cylinder-type-files.js').TypeRow} type */
  function inDives({ dives: n, fileId }) {
    if (n === 0 && fileId) return t('settings.cylinders.addedUnused');
    return t(n === 0 ? 'settings.cylinders.inNoDive' : n === 1 ? 'settings.cylinders.inOneDive' : 'settings.cylinders.inDives', { n: formatNumber(n, 0) });
  }

  /** @param {string} name */
  function open(name) {
    f7.views.current.router.navigate(`/settings/cylinders/type?name=${encodeURIComponent(name)}`);
  }
</script>

{#snippet list(/** @type {import('../lib/cylinder-type-files.js').TypeRow[]} */ items)}
  <div class="bc-cylinder-types--surface" role="list">
    {#each items as type (type.name)}
      <div role="listitem">
        <button type="button" class="bc-cylinder-types--row" onclick={() => open(type.name)}>
          <span class="bc-cylinder-types--texts">
            <span class="bc-cylinder-types--label">{cylinderTypeLabel(type.name)}{#if !type.dives && type.fileId}<span class="bc-cylinder-types--unused">{t('settings.cylinders.unused')}</span>{/if}</span>
            <span class="bc-cylinder-types--supporting">{inDives(type)}</span>
          </span>
          <span class="bc-cylinder-types--value">{size(type)}</span>
          <span class="bc-cylinder-types--chevron"><Icon name="chevron" size={20} /></span>
        </button>
      </div>
    {/each}
  </div>
{/snippet}

<Page class="bc-cylinder-types" onPageBeforeIn={refresh}>
  <Navbar title={t('settings.cylinders.title')}>
    {#snippet left()}
      <BackLink label={t('common.back')} name={t('common.back')} />
    {/snippet}
    {#snippet right()}
      {#if ios}<Link href="/settings/cylinders/new" iconOnly><Icon name="plus" /><span class="bc-sr-only">{t('settings.cylinders.add')}</span></Link>{/if}
    {/snippet}
  </Navbar>

  <p class="bc-cylinder-types--intro">{t('settings.cylinders.intro')}</p>

  {@render list(types)}
  <div class="bc-cylinder-types--bottom"></div>

  {#snippet fixedContent()}
    {#if !ios}
    <!-- Extended floating button, written by hand as in the Logbook. -->
    <div class="fab fab-right-bottom fab-extended bc-fab-add">
      <a href="/settings/cylinders/new">
        <i class="icon"><Icon name="plus" /></i>
        <div class="fab-text">{t('settings.cylinders.add')}</div>
      </a>
    </div>
    {/if}
  {/snippet}
</Page>

<style>
  @layer bc.components {
    .bc-cylinder-types--intro {
      margin: 8px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-cylinder-types--surface {
      margin: 16px 16px 0;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-cylinder-types--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 6px 24px 6px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .bc-cylinder-types--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-cylinder-types--label {
      font-size: 16px;
    }

    .bc-cylinder-types--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* An outlined label after the name of a type no dive uses. */
    .bc-cylinder-types--unused {
      margin-inline-start: 8px;
      padding: 0 6px;
      border: var(--bc-outline-width) solid var(--bc-text-2);
      border-radius: 8px;
      font-size: 11px;
      line-height: 16px;
      color: var(--bc-text-2);
    }

    .bc-cylinder-types--value {
      flex: none;
      font-size: 14px;
      color: var(--bc-text-2);
      font-variant-numeric: tabular-nums;
    }

    /* The row opens the type's page (system-design, « Trailing chevron »). */
    .bc-cylinder-types--chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    /* The floating button must not hide the last row. */
    .bc-cylinder-types--bottom {
      height: 96px;
    }
  }
</style>
