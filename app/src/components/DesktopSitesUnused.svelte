<script>
  // @ts-check
  // « Sites sans plongée » on the desktop (task 2026-11-24-395; mock-up bureau-sites-sans-plongee): « Tout
  // sélectionner », then the sites with check boxes. « Supprimer la sélection (n) » is a red text button on the
  // right of the pane title, so it stays visible however long the list is.
  import Icon from './Icon.svelte';
  import DesktopCleanupHeader from './DesktopCleanupHeader.svelte';
  import { siteChange } from '../lib/sites.svelte.js';
  import { checkedUnused, toggleAllUnused } from '../lib/desktop-sites.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ unused: import('benthic-core').SiteSummary[], onback: () => void }} */
  let { unused, onback } = $props();

  /** @type {Record<number, boolean>} */
  let checked = $state({});
  const selection = $derived(checkedUnused(unused, checked));

  function deleteSelection() {
    const uuids = selection;
    const n = uuids.length;
    if (!n) return;
    confirmAction({
      title: t('sites.deleteTitle'),
      text: t('sites.deleteText', { n }),
      action: t('sites.delete'),
      onConfirm: async () => {
        try {
          await siteChange({ action: 'delete', uuids });
          checked = {};
          offerUndo(t('sites.done'));
        } catch (e) {
          console.error('Delete sites', e);
          showSnackbar(t('edit.failed'));
        }
      },
    });
  }
</script>

<section class="bc-cleanup-unused" data-bc-scroll aria-label={t('sites.unusedTitle')}>
  <DesktopCleanupHeader title={t('sites.unusedTitle')} {onback}>
    {#snippet action()}
      <button type="button" class="bc-cleanup-unused--danger" disabled={!selection.length} onclick={deleteSelection}>{t('sites.deleteSelection', { n: selection.length })}</button>
    {/snippet}
  </DesktopCleanupHeader>
  {#if unused.length}
    <p class="bc-cleanup-unused--lead">{t('sites.unusedIntro', { n: unused.length })}</p>
    <div class="bc-cleanup-unused--card">
      <button type="button" class="bc-cleanup-unused--all" onclick={() => (checked = toggleAllUnused(unused, checked))}>{t('sites.selectAll')}</button>
      {#each unused as s (s.uuid)}
        <label class="bc-cleanup-unused--check">
          <input type="checkbox" bind:checked={checked[s.uuid]} />
          <span class="bc-cleanup-unused--box" aria-hidden="true"><Icon name="check" size={16} weight={2.6} /></span>
          <span>
            <span class="bc-cleanup-unused--name">{s.name || t('sites.noName')}</span>
            <span class="bc-cleanup-unused--sub">{[t('sites.noDive'), s.country || t('sites.noCountry')].join(', ')}</span>
          </span>
        </label>
      {/each}
    </div>
  {:else}
    <p class="bc-cleanup-unused--lead">{t('desktopSites.noUnused')}</p>
  {/if}
</section>

<style>
  @layer bc.components {
    .bc-cleanup-unused {
      box-sizing: border-box;
      height: 100%;
      overflow: auto;
      padding: 4px 12px 24px 4px;
    }
    .bc-cleanup-unused--lead {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-cleanup-unused--card {
      max-width: 560px;
      padding: 8px 14px;
      border-radius: 16px;
      background: var(--bc-surface);
    }
    .bc-cleanup-unused--danger,
    .bc-cleanup-unused--all {
      width: auto;
      height: 36px;
      padding: 0 14px;
      white-space: nowrap;
      border: 0;
      border-radius: 18px;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-on-table-selected);
      cursor: pointer;
    }
    .bc-cleanup-unused--danger {
      color: var(--bc-menu-danger);
      &:disabled {
        opacity: 0.38;
        cursor: default;
      }
    }
    .bc-cleanup-unused--all:hover,
    .bc-cleanup-unused--danger:not(:disabled):hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .bc-cleanup-unused--check {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 6px 0;
      cursor: pointer;
      & input {
        position: absolute;
        opacity: 0;
      }
    }
    .bc-cleanup-unused--box {
      display: grid;
      place-items: center;
      flex: none;
      width: 20px;
      height: 20px;
      margin: 2px 4px 0 0;
      border: 2px solid var(--bc-outline);
      border-radius: 3px;
      color: transparent;
    }
    .bc-cleanup-unused--check input:checked + .bc-cleanup-unused--box {
      border-color: var(--bc-secondary);
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }
    .bc-cleanup-unused--check input:focus-visible + .bc-cleanup-unused--box {
      outline: 2px solid var(--bc-secondary);
      outline-offset: 2px;
    }
    .bc-cleanup-unused--name {
      display: block;
      font-size: 15px;
    }
    .bc-cleanup-unused--sub {
      display: block;
      font-size: 13px;
      line-height: 17px;
      color: var(--bc-text-2);
    }
  }
</style>
