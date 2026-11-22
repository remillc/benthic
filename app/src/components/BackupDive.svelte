<script>
  // @ts-check
  // The versions of one dive (task 2026-11-19-290; sauvegarde-plongee-android, ios-sauvegarde-plongee): the dive chosen
  // (« Changer » goes back to the choice, BackupDivePick), the syncs that touched it with what each changed, and « Restaurer » on
  // each, which changes only that dive, as a new commit. Reached from « Une version d’une plongée » and from the dive's menu,
  // « Versions de cette plongée ».
  import './backup.css';
  import { backup, restoreOne, historyCore } from '../lib/backup.svelte.js';
  import { diveVersions, keyOfDate } from '../lib/backup-history.js';
  import { diveVersionLine, versionWhen, versionDay } from '../lib/backup-text.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDate } from '../lib/format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { t } from '../lib/i18n.js';

  /**
   * `startKey`: the dive to show, by its start time (`YYYY-MM-DD HH:MM:SS`). `onchange`: « Changer », back to the choice of a dive.
   * @type {{ startKey: string, onrestored?: () => void, onchange: () => void }}
   */
  let { startKey, onrestored, onchange } = $props();

  const key = $derived(startKey);
  /** @type {import('../lib/backup-history.js').DiveVersion[]|null} */
  let versions = $state(null);
  let failed = $state(false);

  const dive = $derived(logbook.dives.find((d) => keyOfDate(d.date) === key) ?? null);

  $effect(() => {
    const wanted = key;
    versions = null;
    failed = false;
    if (!wanted) return;
    diveVersions(historyCore, wanted)
      .then((v) => {
        if (wanted === key) versions = v;
      })
      .catch((e) => {
        console.error('Reading the versions of a dive', e);
        if (wanted === key) failed = true;
      });
  });

  /** @param {import('benthic-core').Dive} d */
  function rowText(d) {
    const number = t('backup.version.number', { n: d.number });
    const date = formatDate(d.date);
    return d.site ? t('backup.dive.row', { number, site: d.site, date }) : t('backup.dive.rowNoSite', { number, date });
  }

  /** @param {import('../lib/backup-history.js').DiveVersion} v */
  async function restore(v) {
    if (!v.dir || backup.busy) return;
    const dir = v.dir;
    const day = versionDay(v.time);
    confirmAction({
      title: t('backup.dive.restore'),
      text: `${diveVersionLine(v)} (${versionWhen(v.time)}). ${t('backup.dive.note')}`,
      action: t('backup.dive.restore'),
      onConfirm: async () => {
        const ok = await restoreOne({ commit: v.id, dir, key, date: day });
        showSnackbar(t(ok ? 'backup.dive.restored' : 'backup.dive.restoreFailed'));
        if (ok) {
          onrestored?.();
          versions = null;
          diveVersions(historyCore, key).then((list) => (versions = list));
        }
      },
    });
  }
</script>

<div class="bc-backup bc-backup-dive">
    <h2 class="bc-backup--section">{t('backup.dive.pick')}</h2>
    <div class="bc-backup--dive-card">
      <span class="bc-backup--texts">
        <span class="bc-backup--row-title">{dive ? rowText(dive) : key}</span>
      </span>
      <button type="button" class="bc-text-button" onclick={onchange}>{t('backup.dive.change')}</button>
    </div>

    <h2 class="bc-backup--section">{t('backup.dive.versions')}</h2>
    {#if failed}
      <p class="bc-backup--error">{t('backup.versions.failed')}</p>
    {:else if versions === null}
      <p class="bc-backup--empty" role="status">{t('backup.versions.loading')}</p>
    {:else if !versions.length}
      <p class="bc-backup--empty">{t('backup.dive.none')}</p>
    {:else}
      <div class="bc-backup--list" role="list">
        {#each versions as v (v.id)}
          <div class="bc-backup--row" role="listitem">
            <span class="bc-backup--texts">
              <span class="bc-backup--row-title">{versionWhen(v.time)}</span>
              <span class="bc-backup--row-line">{diveVersionLine(v)}</span>
            </span>
            {#if v.current}
              <span class="bc-backup--chip">{t('backup.versions.current')}</span>
            {:else if v.dir}
              <button type="button" class="bc-backup--restore" disabled={backup.busy} onclick={() => restore(v)}>{t('backup.dive.restore')}</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    <p class="bc-backup--note">{t('backup.dive.note')} {t('backup.media')}</p>
</div>
