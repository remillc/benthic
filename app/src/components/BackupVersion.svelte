<script>
  // @ts-check
  // One version of the logbook (tasks 2026-11-19-290 and 2026-11-22-319; sauvegarde-version-android, sauvegarde-restaurer-android): its
  // counts on one line, what will change if it is restored (the dives added since are listed one by one), « Restaurer cette version » (a confirmation first: restoring adds a commit with the old
  // content, the current logbook stays in the history) and « Parcourir cette version » (read only, nothing changes).
  import './backup.css';
  import Icon from './Icon.svelte';
  import { backup, restoreWhole, historyCore } from '../lib/backup.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDate } from '../lib/format.js';
  import { versionDetail, keyOfDate } from '../lib/backup-history.js';
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

  /** The counts on one line: « 309 plongées · 47 sites · 14 pièces ». */
  const countsLine = $derived(
    version
      ? [t('backup.version.dives', { n: version.counts.dives }), t('backup.version.sites', { n: version.counts.sites }), ...(version.counts.pieces != null ? [t('backup.version.pieces', { n: version.counts.pieces })] : [])].join(' · ')
      : '',
  );

  /** The dives of the logbook by start time: the dives added since are in it, with their site. */
  const byKey = $derived(new Map(logbook.dives.map((d) => [keyOfDate(d.date), d])));

  /** « N° 310 · Tadoussac, Pointe-Noire » and the day, for a dive that restoring removes. @param {{ number: number|null, key: string }} a */
  function addedRow(a) {
    const dive = byKey.get(a.key);
    const number = a.number != null ? t('backup.version.number', { n: a.number }) : '';
    const day = formatDate(a.key.replace(' ', 'T'));
    return { title: [number, dive?.site].filter(Boolean).join(' · ') || day, date: day };
  }

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
    <div class="bc-backup--card bc-backup-version--card">
      <span class="bc-backup--status-icon" aria-hidden="true"><Icon name="history" size={24} weight={1.8} /></span>
      <span class="bc-backup--texts">
        <span class="bc-backup--title">{versionWhen(version.time)}</span>
        <span class="bc-backup--line">{countsLine}</span>
      </span>
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
            <span class="bc-backup--tile bc-backup--tile-{b.kind}"><Icon name={ICONS[b.kind]} size={20} weight={1.8} /></span>
            <span class="bc-backup--texts">
              <span class="bc-backup--row-title">{b.title}</span>
              {#if b.kind === 'added'}
                <span class="bc-backup--diff-detail">{t('backup.version.addedNote', { n: detail.added.length })}</span>
                <ul class="bc-backup--diff-dives">
                  {#each detail.added as a (a.key)}
                    {@const row = addedRow(a)}
                    <li><span class="bc-backup--diff-dive">{row.title}</span><span class="bc-backup--diff-date">{row.date}</span></li>
                  {/each}
                </ul>
              {:else}
                <span class="bc-backup--diff-detail">{b.detail}</span>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="bc-backup--actions">
      <button type="button" class="bc-backup--filled" disabled={!detail || backup.busy} onclick={askRestore}>{t('backup.version.restore')}</button>
      <button type="button" class="bc-outlined-button" disabled={backup.busy} onclick={() => onbrowse(version.id)}>{t('backup.version.browse')}</button>
    </div>
    <p class="bc-backup--note">{t('backup.version.browseNote')}</p>
  </div>
{/if}
