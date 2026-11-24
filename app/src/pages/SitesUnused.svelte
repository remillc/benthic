<script>
  // @ts-check
  // « Sites sans plongée » (task 2026-11-24-395; mock-ups sites-sans-plongee-android, ios-sites-sans-plongee):
  // « Tout sélectionner », then the sites without a dive with check boxes. The delete action is in the top bar,
  // so it stays visible however long the list is: Android « Supprimer (n) » (filled button), iPhone « Supprimer »
  // (red text button). The change is confirmed first, and undoable.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import { showSnackbar } from '../lib/snackbar.js';
  import { logbook, siteChange } from '../lib/sites.svelte.js';
  import { t } from '../lib/i18n.js';
  import { ios } from '../lib/layout.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { unusedSites } from '../lib/site-cleanup.js';

  let unused = $state(/** @type {import('benthic-core').SiteSummary[]} */ ([]));
  let loaded = $state(false);
  /** @type {Record<number, boolean>} */
  let selected = $state({});

  $effect(() => {
    logbook.sitesVersion;
    BenthicCore.siteQuery({ kind: 'list' }).then((all) => {
      unused = unusedSites(all);
      loaded = true;
    });
  });

  const selection = $derived(unused.filter((s) => selected[s.uuid]).map((s) => s.uuid));

  function selectAll() {
    const all = unused.every((s) => selected[s.uuid]);
    selected = Object.fromEntries(unused.map((s) => [s.uuid, !all]));
  }

  function deleteSelection() {
    const n = selection.length;
    if (!n) return;
    confirmAction({
      title: t('sites.deleteTitle'),
      text: t('sites.deleteText', { n }),
      action: t('sites.delete'),
      onConfirm: async () => {
        try {
          await siteChange({ action: 'delete', uuids: selection });
          selected = {};
          offerUndo(t('sites.done'));
        } catch (e) {
          console.error('Delete sites', e);
          showSnackbar(t('edit.failed'));
        }
      },
    });
  }
</script>

<Page class="bc-sites-unused">
  <Navbar title={t('sites.unusedTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="bc-sr-only">{t('common.back')}</span></Link>
    {/snippet}
    {#snippet right()}
      {#if ios}
        <Link class="bc-sites-unused--delete-ios" onClick={deleteSelection} disabled={!selection.length}>{t('sites.delete')}</Link>
      {:else}
        <button type="button" class="bc-sites-unused--delete" disabled={!selection.length} onclick={deleteSelection}>{t('sites.deleteCount', { n: selection.length })}</button>
      {/if}
    {/snippet}
  </Navbar>

  {#if unused.length}
    <div class="bc-sites-unused--surface">
      <label class="bc-sites-unused--row">
        <span class="checkbox">
          <input type="checkbox" checked={selection.length === unused.length} indeterminate={selection.length > 0 && selection.length < unused.length} onchange={selectAll} />
          <i class="icon-checkbox"></i>
        </span>
        <span class="bc-sites-unused--label bc-sites-unused--strong">{t('sites.selectAll')}</span>
      </label>
      {#each unused as s (s.uuid)}
        <label class="bc-sites-unused--row">
          <span class="checkbox">
            <input type="checkbox" bind:checked={selected[s.uuid]} />
            <i class="icon-checkbox"></i>
          </span>
          <span class="bc-sites-unused--text">
            <span class="bc-sites-unused--label">{s.name || t('sites.noName')}</span>
            <span class="bc-sites-unused--sub">{s.country || t('sites.noCountry')}</span>
          </span>
        </label>
      {/each}
    </div>
  {:else if loaded}
    <p class="bc-intro" role="status">{t('desktopSites.noUnused')}</p>
  {/if}
</Page>

<style>
  @layer bc.components {
    .bc-sites-unused--surface {
      margin: 8px 16px 12px;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-sites-unused--row {
      min-height: 56px;
      padding: 8px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;

      & + & {
        border-top: 1px solid var(--bc-separator);
      }
    }

    .bc-sites-unused--text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .bc-sites-unused--label {
      font-size: 16px;
      line-height: 24px;

      &.bc-sites-unused--strong {
        font-weight: 600;
      }
    }

    .bc-sites-unused--sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* Android: a filled button in the top bar. */
    .bc-sites-unused--delete {
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      cursor: pointer;

      &:disabled {
        opacity: 0.38;
      }
    }

    /* iPhone: a red text button. */
    :global(.bc-sites-unused--delete-ios) {
      color: var(--bc-alarm);
    }
  }
</style>
