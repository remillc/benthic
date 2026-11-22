<script>
  // @ts-check
  // The list of « Ordinateurs du carnet » (reglages-ordinateurs-android.dc.html; spec, "Settings, logbook dive
  // computers"): the computers the dives come from, each with its photo (task 2026-11-19-306). The page and, behind the
  // side sheet of « Modifier l'ordinateur » on a tablet, the same list.
  import { BenthicCore } from 'benthic-core';
  import Icon from './Icon.svelte';
  import DcTile from './DcTile.svelte';
  import { ownComputerPhoto } from '../lib/gear-photos.svelte.js';
  import { computerName, duplicatesOf, mergeTargets } from '../lib/dive-computers.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {import('benthic-core').LogbookComputer[]} */
  let computers = $state([]);
  /** `selected`: the computer being edited (tablet and desktop: the list stays behind the sheet). @type {{ selected?: { model: string, serial: string }|null }} */
  let { selected = null } = $props();

  // Again after each change of the logbook, undo included.
  $effect(() => {
    logbook.dives;
    BenthicCore.diveComputers().then(
      (list) => (computers = list),
      (e) => console.error('Logbook computers', e),
    );
  });

  /** @param {import('benthic-core').LogbookComputer} c */
  function details(c) {
    return [
      c.nickname ? c.model : '',
      c.serial ? t('settings.logbookComputers.serialShort', { serial: c.serial }) : t('settings.logbookComputers.noSerial'),
      t('settings.logbookComputers.dives', { n: c.dives }),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** @param {import('benthic-core').LogbookComputer} c */
  const link = (c) => `/settings/computers/edit?model=${encodeURIComponent(c.model)}&serial=${encodeURIComponent(c.serial)}`;

  const anyDuplicate = $derived(computers.some((c) => mergeTargets(c, computers).length > 0));
</script>

{#snippet generic()}
  <span class="bc-logbook-computers--generic"><Icon name="wristComputer" size={22} weight={1.8} /></span>
{/snippet}

  

  <p class="bc-logbook-computers--intro">{t('settings.logbookComputers.intro')}</p>
  {#if computers.length}
    <div class="bc-logbook-computers--group">
      {#each computers as c (`${c.model}\n${c.serial}`)}
        <a class="bc-logbook-computers--row" href={link(c)} aria-current={selected && selected.model === c.model && selected.serial === c.serial ? 'true' : undefined}>
          <span class="bc-logbook-computers--photo" aria-hidden="true"><DcTile model={c.model} size={40} radius={10} photo={ownComputerPhoto(c.model, c.serial)} fallback={generic} /></span>
          <span class="bc-logbook-computers--texts">
            <span class="bc-logbook-computers--name">
              <span>{computerName(c)}</span>
              {#if mergeTargets(c, computers).length}
                <span class="bc-logbook-computers--tag">{t('settings.logbookComputers.duplicate')}</span>
              {:else if duplicatesOf(c, computers).length}
                <span class="bc-logbook-computers--tag">{t('settings.logbookComputers.hasDuplicate')}</span>
              {/if}
            </span>
            <span class="bc-logbook-computers--details bc-value">{details(c)}</span>
          </span>
          <span class="bc-logbook-computers--chevron"><Icon name="chevron" size={20} /></span>
        </a>
      {/each}
    </div>
    {#if anyDuplicate}<p class="bc-logbook-computers--note">{t('settings.logbookComputers.duplicateNote')}</p>{/if}
  {:else}
    <p class="bc-logbook-computers--note">{t('settings.logbookComputers.empty')}</p>
  {/if}


<style>
  @layer bc.components {
    .bc-logbook-computers--intro {
      margin: 8px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-logbook-computers--group {
      margin: 16px 16px 0;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-logbook-computers--row {
      min-height: 64px;
      padding: 8px 24px 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--bc-text);
    }

    .bc-logbook-computers--photo {
      flex: none;
      display: flex;
    }

    .bc-logbook-computers--generic {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-surface-container-high);
      color: var(--bc-text-2);
    }

    .bc-logbook-computers--row[aria-current='true'] {
      background: var(--bc-selected-container);
    }

    .bc-logbook-computers--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-logbook-computers--name {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 16px;
      color: var(--bc-text);
    }

    .bc-logbook-computers--tag {
      height: 20px;
      padding: 0 8px;
      box-sizing: border-box;
      border: var(--bc-outline-width) solid var(--bc-chip-outline);
      border-radius: 6px;
      font-size: 12px;
      line-height: 18px;
      font-weight: 500;
      color: var(--bc-text-2);
      white-space: nowrap;
    }

    .bc-logbook-computers--details {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-logbook-computers--chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-logbook-computers--note {
      margin: 10px 20px 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
  }
</style>
