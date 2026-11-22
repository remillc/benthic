<script>
  // @ts-check
  // « Une version d’une plongée » (task 2026-11-22-319; sauvegarde-une-plongee-android): a search field, then the dives changed
  // recently with their number of versions. A row opens the versions of that dive (`onpick`, by its start time). Typing in the
  // field searches the whole logbook instead.
  import './backup.css';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import SearchClear from './SearchClear.svelte';
  import { backup, loadRecent } from '../lib/backup.svelte.js';
  import { keyOfDate } from '../lib/backup-history.js';
  import { changedWhen } from '../lib/backup-text.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ onpick: (key: string) => void }} */
  let { onpick } = $props();

  let search = $state('');

  onMount(() => {
    if (backup.recent === null) loadRecent();
  });

  /** The logbook's dives by start time. */
  const byKey = $derived(new Map(logbook.dives.map((d) => [keyOfDate(d.date), d])));

  /** The recent dives that still are in the logbook and have an older version to go back to. */
  const recent = $derived(
    (backup.recent ?? [])
      .filter((r) => r.versions > 1 && byKey.has(r.key))
      .slice(0, 30)
      .map((r) => ({ key: r.key, dive: /** @type {import('benthic-core').Dive} */ (byKey.get(r.key)), time: r.time, versions: r.versions })),
  );

  /** The dives that match the search: number, site, date. */
  const found = $derived.by(() => {
    const q = search.trim().toLocaleLowerCase();
    if (!q) return [];
    const all = [...logbook.dives].sort((a, b) => (a.date < b.date ? 1 : -1));
    return all.filter((d) => `${d.number} ${d.site} ${d.date} ${formatDate(d.date)}`.toLocaleLowerCase().includes(q)).slice(0, 100);
  });

  /** « N° 298 · Baie-Comeau, épave » @param {import('benthic-core').Dive} d */
  function title(d) {
    const number = t('backup.version.number', { n: d.number });
    return d.site ? t('backup.dive.rowShort', { number, site: d.site }) : number;
  }
</script>

<div class="bc-backup bc-backup-pick">
  <div class="bc-backup--search">
    <Icon name="search" size={20} />
    <input type="search" bind:value={search} placeholder={t('backup.dive.search')} aria-label={t('backup.dive.search')} />
    {#if search}<SearchClear onclear={() => (search = '')} />{/if}
  </div>

  {#if search.trim()}
    {#if found.length}
      <div class="bc-backup--list bc-backup--pick-list">
        {#each found as d (d.id)}
          <button type="button" class="bc-backup--row" onclick={() => onpick(keyOfDate(d.date))}>
            <span class="bc-backup--texts">
              <span class="bc-backup--row-title">{title(d)}</span>
              <span class="bc-backup--row-line">{formatDate(d.date)}</span>
            </span>
            <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="bc-backup--empty">{t('backup.dive.noMatch')}</p>
    {/if}
  {:else}
    <h2 class="bc-backup--section">{t('backup.dive.recent')}</h2>
    {#if backup.recent === null}
      <div class="bc-backup--list bc-backup-main--skeleton-list skeleton-effect-wave" role="status" aria-busy="true" aria-label={t('backup.versions.loading')}>
        {#each Array(3) as _, i (i)}
          <div class="bc-backup-main--skeleton-row" aria-hidden="true">
            <span class="bc-backup--texts">
              <span class="skeleton-block bc-backup-main--skeleton-title"></span>
              <span class="skeleton-block bc-backup-main--skeleton-line"></span>
            </span>
            <span class="skeleton-block bc-backup-main--skeleton-chip"></span>
          </div>
        {/each}
      </div>
    {:else if backup.recentFailed}
      <div class="bc-backup--error">
        {t('backup.versions.failed')}
        <button type="button" class="bc-outlined-button" onclick={loadRecent}>{t('backup.versions.retry')}</button>
      </div>
    {:else if !recent.length}
      <p class="bc-backup--empty">{t('backup.dive.recentNone')}</p>
    {:else}
      <div class="bc-backup--list bc-backup--pick-list">
        {#each recent as r (r.key)}
          <button type="button" class="bc-backup--row" onclick={() => onpick(r.key)}>
            <span class="bc-backup--texts">
              <span class="bc-backup--row-title">{title(r.dive)}</span>
              <span class="bc-backup--row-line">{changedWhen(r.time)}</span>
            </span>
            <span class="bc-backup--count-text">{t('backup.dive.versionCount', { n: r.versions })}</span>
            <span class="bc-backup--chevron"><Icon name="chevron" size={20} /></span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
  <p class="bc-backup--note">{t('backup.dive.hint')}</p>
</div>
