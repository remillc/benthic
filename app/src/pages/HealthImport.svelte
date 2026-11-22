<script>
  // @ts-check
  // iPhone, « + › Importer depuis Apple Santé » (to-do #67): the dives an Apple Watch Ultra wrote into
  // Apple Health over the last year, to tick; those already in the logbook (same start, within a
  // minute) are marked and left unticked. The ticked ones become a logbook file
  // (lib/health-dives.js) imported like any file: one undoable step, saved and synced. The diver
  // completes the rest (site, gas, buddy) by hand: Health only has time, depth and temperature.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import { onMount } from 'svelte';
  import { logbook, importData } from '../lib/logbook.svelte.js';
  import { splitDives, divesToSsrf } from '../lib/health-dives.js';
  import { formatDateTime, formatDuration, formatDepth } from '../lib/format.js';
  import { toBase64 } from '../lib/zip-fit.js';
  import { offerUndo } from '../lib/undo.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** @type {'loading'|'unavailable'|'failed'|'ready'} */
  let state = $state('loading');
  /** @type {import('../lib/health-dives.js').HealthDive[]} */
  let dives = $state([]);
  /** Indexes of the ticked dives. */
  let ticked = $state(/** @type {Set<number>} */ (new Set()));
  let importing = $state(false);

  const YEAR_MS = 365 * 24 * 3600 * 1000;

  /** Local wall-clock start, as the logbook keeps dates. @param {number} ms */
  function localIso(ms) {
    const d = new Date(ms);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  }

  /** Whether the logbook already holds a dive starting within a minute of this one. @param {number} ms */
  function inLogbook(ms) {
    const at = Date.parse(`${localIso(ms)}Z`);
    return logbook.dives.some((d) => Math.abs(Date.parse(`${d.date}Z`) - at) <= 60_000);
  }

  onMount(async () => {
    try {
      const now = Date.now();
      const health = await BenthicCore.healthDives({ from: now - YEAR_MS, to: now });
      if (!health.available) {
        state = 'unavailable';
        return;
      }
      // Newest first, as in the logbook.
      dives = splitDives(health.depth, health.temperature).reverse();
      ticked = new Set(dives.map((d, i) => (inLogbook(d.startMs) ? -1 : i)).filter((i) => i >= 0));
      state = 'ready';
    } catch (e) {
      console.error('Apple Health', e);
      state = 'failed';
    }
  });

  /** @param {number} i */
  function toggle(i) {
    const next = new Set(ticked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    ticked = next;
  }

  async function importTicked() {
    const chosen = dives.filter((_, i) => ticked.has(i)).reverse();
    if (!chosen.length) return;
    importing = true;
    try {
      const n = await importData('apple-health.ssrf', toBase64(new TextEncoder().encode(divesToSsrf(chosen))));
      f7router.back();
      offerUndo(t('logbook.imported', { n }));
    } catch (e) {
      console.error('Apple Health import', e);
      showSnackbar(t('health.failed'));
    } finally {
      importing = false;
    }
  }
</script>

<Page class="bc-health-import">
  <Navbar title={t('health.title')} backLink={t('detail.back')}>
    {#snippet right()}
      <Link onClick={importTicked} class={!ticked.size || importing ? 'disabled' : ''}>{t('health.import', { n: ticked.size })}</Link>
    {/snippet}
  </Navbar>

  {#if state === 'loading'}
    <p class="bc-health-import--note">{t('health.reading')}</p>
  {:else if state === 'unavailable'}
    <p class="bc-health-import--note">{t('health.unavailable')}</p>
  {:else if state === 'failed'}
    <p class="bc-health-import--note">{t('health.failed')}</p>
  {:else if !dives.length}
    <!-- HealthKit does not tell a refused reading from no data: both are said. -->
    <p class="bc-health-import--note">{t('health.none')}</p>
  {:else}
    <div class="list list-strong inset list-dividers">
      <ul>
        {#each dives as dive, i (dive.startMs)}
          {@const known = inLogbook(dive.startMs)}
          <li>
            <label class="item-checkbox item-content">
              <input type="checkbox" checked={ticked.has(i)} onchange={() => toggle(i)} />
              <i class="icon icon-checkbox"></i>
              <div class="item-inner">
                <div class="item-title">
                  {formatDateTime(localIso(dive.startMs))}
                  <div class="item-footer">
                    {formatDuration(Math.round((dive.endMs - dive.startMs) / 1000))} · {formatDepth(Math.round(dive.maxDepthM * 1000), logbook.prefs)}{#if known} · {t('health.known')}{/if}
                  </div>
                </div>
              </div>
            </label>
          </li>
        {/each}
      </ul>
    </div>
    <p class="bc-health-import--note">{t('health.what')}</p>
  {/if}
</Page>

<style>
  @layer bc.components {
    .bc-health-import--note {
      margin: 16px 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text-2);
    }
  }
</style>
