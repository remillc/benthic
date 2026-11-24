<script>
  // @ts-check
  // « Doublons possibles » on the desktop (task 2026-11-15-177, mock-ups bureau-sites-nettoyer and
  // -fusion; a step of « Nettoyer les sites » since task 2026-11-24-395): the possible duplicates (each pair
  // with its reason, both sites, « Pas des doublons » and « Fusionner »). « Fusionner » opens a dialog that asks
  // which of the two sites to keep (as the phone does); the pair then collapses into « Fusionnés : un seul site, … », a snackbar offers « Annuler », and Ctrl/⌘+Z
  // undoes it. The rules are the phone's (pages/SitesCleanup.svelte).
  import Icon from './Icon.svelte';
  import DesktopCleanupHeader from './DesktopCleanupHeader.svelte';
  import { dismissPair, pairKey, restorePair, siteChange } from '../lib/sites.svelte.js';
  import { mergeSides } from '../lib/desktop-sites.js';
  import DesktopSitesMerge from './DesktopSitesMerge.svelte';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { desktopMac } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('benthic-core').SiteSummary} Site */

  /**
   * @type {{
   *   pairs: {a: Site, b: Site, distanceM: number}[],
   *   onback: () => void,
   * }}
   */
  let { pairs, onback } = $props();

  /** The pair whose merge dialog is open. @type {{a: Site, b: Site, distanceM: number}|null} */
  let merging = $state(null);
  /** The pairs merged here: they stay as a line, « Fusionnés », until the diver leaves. @type {{ key: string, name: string, text: string }[]} */
  let merged = $state([]);

  // A pair that is back (the merge was undone) is no longer a merged line.
  $effect(() => {
    const keys = new Set(pairs.map((p) => pairKey(p.a.uuid, p.b.uuid)));
    if (merged.some((m) => keys.has(m.key))) merged = merged.filter((m) => !keys.has(m.key));
  });

  /** @param {Site} s */
  const describe = (s) =>
    [s.dives ? t('sites.diveCount', { n: s.dives }) : t('sites.noDive'), s.country || t('sites.noCountry'), s.hasLocation ? t('sites.withPosition') : t('sites.withoutPosition')].join(', ');

  /** @param {{a: Site, b: Site, distanceM: number}} pair */
  const reason = (pair) =>
    pair.a.name.toLocaleLowerCase() === pair.b.name.toLocaleLowerCase()
      ? pair.distanceM >= 0
        ? t('sites.sameNameAt', { n: pair.distanceM })
        : t('sites.sameName')
      : t('sites.samePlace');

  /** The site kept by default first: more dives, then a position. @param {{a: Site, b: Site}} pair @returns {[Site, Site]} */
  function ordered(pair) {
    const { first, second } = mergeSides(pair.a, pair.b, null);
    return [first, second];
  }

  /** The dialog's choice: `keep` stays, `other` goes into it. @param {{a: Site, b: Site, distanceM: number}} pair @param {Site} keep @param {Site} other */
  async function merge(pair, keep, other) {
    merging = null;
    const total = keep.dives + other.dives;
    try {
      await siteChange({ action: 'merge', uuid: keep.uuid, other: other.uuid });
      merged = [
        ...merged,
        {
          key: pairKey(pair.a.uuid, pair.b.uuid),
          name: keep.name || t('sites.noName'),
          text: [t('desktopSites.mergedOne'), t('sites.diveCount', { n: total }), keep.country || other.country || t('sites.noCountry'), keep.hasLocation || other.hasLocation ? t('sites.withPosition') : t('sites.withoutPosition')].join(', '),
        },
      ];
      offerUndo(t('desktopSites.merged'));
    } catch (e) {
      console.error('Merge sites', e);
      showSnackbar(t('edit.failed'));
    }
  }

  /** @param {{a: Site, b: Site}} pair */
  function notDuplicates(pair) {
    dismissPair(pair.a, pair.b);
    showSnackbar(t('sites.notDuplicatesDone', { a: pair.a.name || t('sites.noName'), b: pair.b.name || t('sites.noName') }), {
      action: t('edit.undo'),
      timeout: 6000,
      onAction: () => restorePair(pair.a, pair.b),
    });
  }
</script>

<section class="bc-cleanup" data-bc-scroll aria-label={t('sites.cleanupTitle')}>
  <DesktopCleanupHeader title={t('sites.duplicatesTitle')} {onback} />
  <p class="bc-cleanup--intro">{t('desktopSites.cleanupIntro', { shortcut: desktopMac ? '⌘Z' : 'Ctrl+Z' })}</p>

  <div class="bc-cleanup--columns">
    <div class="bc-cleanup--left">
      {#each merged as m (m.key)}
        <div class="bc-cleanup--card bc-cleanup--merged" role="status">
          <Icon name="check" size={22} />
          <div>
            <p class="bc-cleanup--name">{m.name}</p>
            <p class="bc-cleanup--sub">{m.text}</p>
          </div>
        </div>
      {/each}
      {#each pairs as pair (pairKey(pair.a.uuid, pair.b.uuid))}
        {@const both = ordered(pair)}
        <div class="bc-cleanup--card">
          <p class="bc-cleanup--name">{both[0].name || t('sites.noName')}</p>
          <p class="bc-cleanup--sub">{reason(pair)}</p>
          {#each both as s (s.uuid)}
            <div class="bc-cleanup--site">
              <Icon name="sites" size={18} />
              <div>
                <p class="bc-cleanup--site-name">{s.name || t('sites.noName')}</p>
                <p class="bc-cleanup--sub">{describe(s)}</p>
              </div>
            </div>
          {/each}
          <div class="bc-cleanup--actions">
            <button type="button" class="bc-cleanup--text" onclick={() => notDuplicates(pair)}>{t('sites.notDuplicates')}</button>
            <button type="button" class="bc-cleanup--tonal" onclick={() => (merging = pair)}>{t('sites.merge')}</button>
          </div>
        </div>
      {/each}
      {#if !pairs.length && !merged.length}<p class="bc-cleanup--none">{t('desktopSites.noDuplicates')}</p>{/if}
    </div>
  </div>
</section>

{#if merging}
  <DesktopSitesMerge a={merging.a} b={merging.b} {describe} onmerge={(keep, other) => merge(/** @type {any} */ (merging), keep, other)} onclose={() => (merging = null)} />
{/if}

<style>
  @layer bc.components {
    .bc-cleanup {
      box-sizing: border-box;
      height: 100%;
      overflow: auto;
      /* Fluid layout: the cards lay out by the pane's width. */
      container-type: inline-size;
      padding: 4px 12px 24px 4px;
    }
    .bc-cleanup--intro {
      margin: 2px 0 12px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-cleanup--columns {
      display: grid;
      grid-template-columns: minmax(0, 560px);
      align-items: start;
    }
    /* A narrow pane: the buttons of a card wrap under each other. */
    @container (max-width: 399px) {
      .bc-cleanup--actions {
        flex-wrap: wrap;
      }
    }
    .bc-cleanup--card {
      margin-bottom: 8px;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--bc-surface);
    }
    .bc-cleanup--merged {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      color: var(--bc-on-table-selected);
      & > div > p {
        margin: 0;
      }
    }
    .bc-cleanup--name {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-cleanup--sub {
      display: block;
      margin: 0;
      font-size: 13px;
      line-height: 17px;
      color: var(--bc-text-2);
    }
    .bc-cleanup--site {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-top: 10px;
      padding-left: 2px;
      color: var(--bc-text-2);
    }
    .bc-cleanup--site-name {
      display: block;
      margin: 0;
      font-size: 15px;
      color: var(--bc-text);
    }
    .bc-cleanup--site p {
      margin: 0;
    }
    .bc-cleanup--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .bc-cleanup--text,
    .bc-cleanup--tonal {
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
    .bc-cleanup--tonal {
      background: var(--bc-table-selected);
    }
    .bc-cleanup--text:hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    /* Mouse: the tonal button takes the 8 % layer of its text colour. */
    @media (hover: hover) and (pointer: fine) {
      .bc-cleanup--tonal {
        transition: box-shadow 120ms linear;
        &:hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
    }
    .bc-cleanup--none {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }
  }
</style>
