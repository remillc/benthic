<script>
  // @ts-check
  // Settings › Équipement › Types de lest: one list, the diver's weight types (lib/weight-types.svelte.js), sorted by name,
  // each with the number of dives it is in and its weight at the right. A tap opens the type's page; « Ajouter un type »
  // opens an empty one. Reached from Réglages and from the weight menu of a dive's detail (« Gérer les types de lest »).
  // Same layout as Types de bouteilles.
  import BackLink from '../components/BackLink.svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { readWeightTypeRows } from '../lib/weight-types.svelte.js';
  import { weightPlaceName } from '../lib/desktop-detail.js';
  import { formatNumber, formatWeight } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import { ios } from '../lib/layout.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';

  /** @type {import('../lib/weight-type-files.js').WeightTypeRow[]} */
  let types = $state([]);

  async function refresh() {
    try {
      types = await readWeightTypeRows();
    } catch (e) {
      console.error('Reading the weight types', e);
    }
  }

  /** « Dans 12 plongées ». @param {import('../lib/weight-type-files.js').WeightTypeRow} type */
  const inDives = ({ dives: n }) => t(n === 0 ? 'settings.weights.inNoDive' : n === 1 ? 'settings.weights.inOneDive' : 'settings.weights.inDives', { n: formatNumber(n, 0) });

  /** @param {string} name */
  function open(name) {
    f7.views.current.router.navigate(`/settings/weights/type?name=${encodeURIComponent(name)}`);
  }
</script>

<Page class="bc-weight-types" onPageBeforeIn={refresh}>
  <Navbar title={t('settings.weights.title')}>
    {#snippet left()}
      <BackLink label={t('common.back')} name={t('common.back')} />
    {/snippet}
    {#snippet right()}
      {#if ios}<Link href="/settings/weights/new" iconOnly><Icon name="plus" /><span class="bc-sr-only">{t('settings.weights.add')}</span></Link>{/if}
    {/snippet}
  </Navbar>

  <p class="bc-weight-types--intro">{t('settings.weights.intro')}</p>

  <div class="bc-weight-types--surface" role="list">
    {#each types as type (type.name)}
      <div role="listitem">
        <button type="button" class="bc-weight-types--row" onclick={() => open(type.name)}>
          <span class="bc-weight-types--texts">
            <span class="bc-weight-types--label">{weightPlaceName(type.name)}</span>
            <span class="bc-weight-types--supporting">{inDives(type)}</span>
          </span>
          <span class="bc-weight-types--value bc-value">{type.grams ? formatWeight(type.grams, logbook.prefs) : ''}</span>
          <span class="bc-weight-types--chevron"><Icon name="chevron" size={20} /></span>
        </button>
      </div>
    {/each}
  </div>
  <div class="bc-weight-types--bottom"></div>

  {#snippet fixedContent()}
    {#if !ios}
    <!-- Extended floating button, written by hand as in the Logbook. -->
    <div class="fab fab-right-bottom fab-extended bc-fab-add">
      <a href="/settings/weights/new">
        <i class="icon"><Icon name="plus" /></i>
        <div class="fab-text">{t('settings.weights.add')}</div>
      </a>
    </div>
    {/if}
  {/snippet}
</Page>

<style>
  @layer bc.components {
    .bc-weight-types--intro {
      margin: 8px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-weight-types--surface {
      margin: 16px 16px 0;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-weight-types--row {
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

    .bc-weight-types--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-weight-types--label {
      font-size: 16px;
      line-height: 24px;
    }

    .bc-weight-types--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-weight-types--value {
      font-size: 14px;
      color: var(--bc-text-2);
      white-space: nowrap;
    }

    .bc-weight-types--chevron {
      display: flex;
      color: var(--bc-text-2);
    }

    /* Room for the floating button over the last row. */
    .bc-weight-types--bottom {
      height: 96px;
    }
  }
</style>
