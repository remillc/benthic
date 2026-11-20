<script>
  // @ts-check
  // One version of the logbook (task 2026-11-19-290; sauvegarde-version-android, sauvegarde-restaurer-android): its counts,
  // what differs from the current logbook, « Restaurer cette version » (a confirmation first: restoring adds a commit with the old
  // content, the current logbook stays in the history) and « Parcourir cette version » (read only, nothing changes).
  import './backup.css';
  import Icon from './Icon.svelte';
  import { backup, restoreWhole, historyCore } from '../lib/backup.svelte.js';
  import { versionDetail } from '../lib/backup-history.js';
  import { differenceBlocks, confirmText, versionWhen, versionDay } from '../lib/backup-text.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /**
   * `id`: the version's commit. `onrestored`: after a restore. `onbrowse`: « Parcourir ». `heading`: the version's date as a title
   * (a phone's page already has it in its bar).
   * @type {{ id: string, heading?: boolean, onrestored?: () => void, onbrowse: (id: string) => void }}
   */
  let { id, heading = true, onrestored, onbrowse } = $props();

  const version = $derived(backup.versions.find((v) => v.id === id) ?? null);
  /** @type {import('../lib/backup-history.js').VersionDetail|null} */
  let detail = $state(null);
  let failed = $state(false);

  $effect(() => {
    const wanted = id;
    detail = null;
    failed = false;
    versionDetail(historyCore, wanted)
      .then((d) => {
        if (wanted === id) detail = d;
      })
      .catch((e) => {
        console.error('Reading a version', e);
        if (wanted === id) failed = true;
      });
  });

  /** The word after the number: « 309 plongées » → « plongées ». @param {string} text */
  const unit = (text) => text.replace(/^[\d\s  ]+/, '');

  const blocks = $derived(detail ? differenceBlocks(detail) : []);
  const ICONS = /** @type {const} */ ({ added: 'plus', removed: 'trash', modified: 'edit', sites: 'place' });

  function askRestore() {
    if (!version || !detail || backup.busy) return;
    const current = version;
    confirmAction({
      title: t('backup.confirm.title', { date: versionDay(current.time) }),
      text: confirmText(detail),
      action: t('backup.confirm.action'),
      onConfirm: async () => {
        const ok = await restoreWhole(current.id, versionDay(current.time));
        showSnackbar(t(ok ? 'backup.confirm.done' : 'backup.confirm.failed'));
        if (ok) onrestored?.();
      },
    });
  }
</script>

{#if version}
  <div class="bc-backup bc-backup-version">
    {#if heading}<h2 class="bc-backup--section bc-backup-version--title">{versionWhen(version.time)}</h2>{/if}
    <div class="bc-backup--counts">
      <span class="bc-backup--count">
        <span class="bc-backup--count-n">{version.counts.dives}</span>
        <span class="bc-backup--count-label">{t('backup.version.dives', { n: version.counts.dives }).replace(/^[\d  ]+/, '')}</span>
      </span>
      <span class="bc-backup--count">
        <span class="bc-backup--count-n">{version.counts.sites}</span>
        <span class="bc-backup--count-label">{t('backup.version.sites', { n: version.counts.sites }).replace(/^[\d  ]+/, '')}</span>
      </span>
      {#if version.counts.pieces != null}
        <span class="bc-backup--count">
          <span class="bc-backup--count-n">{version.counts.pieces}</span>
          <span class="bc-backup--count-label">{t('backup.version.pieces', { n: version.counts.pieces }).replace(/^[\d  ]+/, '')}</span>
        </span>
      {/if}
    </div>

    <h3 class="bc-backup--section">{t('backup.version.differences')}</h3>
    {#if failed}
      <p class="bc-backup--error">{t('backup.versions.failed')}</p>
    {:else if !detail}
      <p class="bc-backup--empty" role="status">{t('backup.versions.loading')}</p>
    {:else if !blocks.length}
      <p class="bc-backup--empty">{t('backup.version.none')}</p>
    {:else}
      <div class="bc-backup--list">
        {#each blocks as b (b.kind)}
          <div class="bc-backup--diff">
            <span class="bc-backup--tile"><Icon name={ICONS[b.kind]} size={20} weight={1.8} /></span>
            <span class="bc-backup--texts">
              <span class="bc-backup--row-title">{b.title}</span>
              <span class="bc-backup--diff-detail">{b.detail}</span>
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="bc-backup--actions">
      <button type="button" class="bc-tonal-button" disabled={!detail || backup.busy} onclick={askRestore}>{t('backup.version.restore')}</button>
      <button type="button" class="bc-outlined-button" disabled={backup.busy} onclick={() => onbrowse(version.id)}>{t('backup.version.browse')}</button>
    </div>
    <p class="bc-backup--note">{t('backup.version.browseNote')}</p>
  </div>
{/if}
