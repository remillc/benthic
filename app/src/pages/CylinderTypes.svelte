<script>
  // @ts-check
  // Settings, "Types de bouteilles" (spec, section 4, "Cylinder types
  // sub-screen"; docs/mockups/reglages-bouteilles-android.dc.html): "Your
  // types" (from the logbook and added on this device) then "Standard" (the
  // core's default table), each with its volume and working pressure. A tap
  // opens the type's sheet; "Add a type" opens an empty one.
  import BackLink from '../components/BackLink.svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { BenthicCore } from 'benthic-core';
  import { t } from '../lib/i18n.js';
  import { ios } from '../lib/layout.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { cylinderTypeLabel } from '../lib/cylinder-types.js';
  import { formatCylinderSize, formatNumber, formatPressure } from '../lib/format.js';

  /** @type {import('benthic-core').CylinderType[]} */
  let types = $state([]);

  async function refresh() {
    try {
      types = (await BenthicCore.cylinderTypes({ action: 'list' })).types;
    } catch (e) {
      console.error('Reading the cylinder types', e);
    }
  }

  const yours = $derived(types.filter((type) => !type.standard));
  const standard = $derived(types.filter((type) => type.standard));

  /** "11,1 L · 207 bar", in the units of the settings. @param {import('benthic-core').CylinderType} type */
  function size(type) {
    return [formatCylinderSize(type.ml, type.mbar, logbook.prefs), type.mbar ? formatPressure(type.mbar, logbook.prefs) : '']
      .filter(Boolean)
      .join(' · ');
  }

  /** "Dans 12 plongées". @param {number} n */
  function inDives(n) {
    return t(n === 0 ? 'settings.cylinders.inNoDive' : n === 1 ? 'settings.cylinders.inOneDive' : 'settings.cylinders.inDives', { n: formatNumber(n, 0) });
  }

  /** @param {string} name */
  function open(name) {
    f7.views.current.router.navigate(`/settings/cylinders/type?name=${encodeURIComponent(name)}`);
  }
</script>

{#snippet list(/** @type {import('benthic-core').CylinderType[]} */ items, /** @type {boolean} */ usage)}
  <div class="bc-cylinder-types--surface" role="list">
    {#each items as type (type.name)}
      <div role="listitem">
        <button type="button" class="bc-cylinder-types--row" onclick={() => open(type.name)}>
          <span class="bc-cylinder-types--texts">
            <span class="bc-cylinder-types--label">{cylinderTypeLabel(type.name)}{#if usage && !type.dives}<span class="bc-cylinder-types--unused">{t('settings.cylinders.unused')}</span>{/if}</span>
            {#if usage}<span class="bc-cylinder-types--supporting">{inDives(type.dives)}</span>{/if}
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

  {#if yours.length}
    <h2 class="bc-cylinder-types--title">{t('settings.cylinders.yours')}</h2>
    {@render list(yours, true)}
  {/if}

  <h2 class="bc-cylinder-types--title">{t('settings.cylinders.standard')}</h2>
  {#if standard.length}
    {@render list(standard, false)}
    <p class="bc-cylinder-types--note">{t('settings.cylinders.standardNote')}</p>
  {:else}
    <p class="bc-cylinder-types--note">{t('settings.cylinders.hidden')}</p>
  {/if}
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

    .bc-cylinder-types--title {
      margin: 0;
      padding: 22px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    .bc-cylinder-types--surface {
      margin: 0 16px;
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

    .bc-cylinder-types--note {
      margin: 10px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* The floating button must not hide the last row. */
    .bc-cylinder-types--bottom {
      height: 96px;
    }
  }
</style>
