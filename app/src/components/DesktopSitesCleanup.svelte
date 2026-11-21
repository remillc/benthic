<script>
  // @ts-check
  // « Nettoyer les sites » on the desktop (task 2026-11-15-177, mock-ups bureau-sites-nettoyer and
  // -fusion): on the left the possible duplicates (each pair with its reason, both sites,
  // « Pas des doublons » and « Fusionner »), on the right the sites without a dive with check boxes,
  // « Tout sélectionner » and « Supprimer la sélection (n) ». « Fusionner » opens a dialog that asks
  // which of the two sites to keep (as the phone does); the pair then collapses into « Fusionnés : un seul site, … », a snackbar offers « Annuler », and Ctrl/⌘+Z
  // undoes it. The rules are the phone's (pages/SitesCleanup.svelte).
  import Icon from './Icon.svelte';
  import { dismissPair, pairKey, restorePair, siteChange } from '../lib/sites.svelte.js';
  import { checkedUnused, toggleAllUnused } from '../lib/desktop-sites.js';
  import { mergeSides } from '../lib/desktop-sites.js';
  import DesktopSitesMerge from './DesktopSitesMerge.svelte';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { desktopMac } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('opendives-core').SiteSummary} Site */

  /**
   * @type {{
   *   pairs: {a: Site, b: Site, distanceM: number}[],
   *   unused: Site[],
   * }}
   */
  let { pairs, unused } = $props();

  /** @type {Record<number, boolean>} */
  let checked = $state({});
  /** The pair whose merge dialog is open. @type {{a: Site, b: Site, distanceM: number}|null} */
  let merging = $state(null);
  /** The pairs merged here: they stay as a line, « Fusionnés », until the diver leaves. @type {{ key: string, name: string, text: string }[]} */
  let merged = $state([]);

  const selection = $derived(checkedUnused(unused, checked));

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

<section class="bc-cleanup" data-od-scroll aria-label={t('sites.cleanupTitle')}>
  <h2 class="bc-cleanup--title">{t('sites.cleanupTitle')}</h2>
  <p class="bc-cleanup--intro">{t('desktopSites.cleanupIntro', { shortcut: desktopMac ? '⌘Z' : 'Ctrl+Z' })}</p>

  <div class="bc-cleanup--columns">
    <div class="bc-cleanup--left">
      <h3 class="bc-cleanup--heading">{t('desktopSites.possibleDuplicates')}</h3>
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

    <div class="bc-cleanup--right">
      <h3 class="bc-cleanup--heading">{t('sites.unusedTitle')}</h3>
      {#if unused.length}
        <p class="bc-cleanup--sub bc-cleanup--lead">{t('sites.unusedIntro', { n: unused.length })}</p>
        <div class="bc-cleanup--card">
          {#each unused as s (s.uuid)}
            <label class="bc-cleanup--check">
              <input type="checkbox" bind:checked={checked[s.uuid]} />
              <span class="bc-cleanup--box" aria-hidden="true"><Icon name="check" size={16} weight={2.6} /></span>
              <span>
                <span class="bc-cleanup--site-name">{s.name || t('sites.noName')}</span>
                <span class="bc-cleanup--sub">{[t('sites.noDive'), s.country || t('sites.noCountry')].join(', ')}</span>
              </span>
            </label>
          {/each}
          <div class="bc-cleanup--actions bc-cleanup--spread">
            <button type="button" class="bc-cleanup--text" onclick={() => (checked = toggleAllUnused(unused, checked))}>{t('sites.selectAll')}</button>
            <button type="button" class="bc-cleanup--danger" disabled={!selection.length} onclick={deleteSelection}>{t('sites.deleteSelection', { n: selection.length })}</button>
          </div>
        </div>
      {:else}
        <p class="bc-cleanup--none">{t('desktopSites.noUnused')}</p>
      {/if}
    </div>
  </div>
</section>

{#if merging}
  <DesktopSitesMerge a={merging.a} b={merging.b} {describe} onmerge={(keep, other) => merge(/** @type {any} */ (merging), keep, other)} onclose={() => (merging = null)} />
{/if}

<style>
  @layer od.components {
    .bc-cleanup {
      box-sizing: border-box;
      height: 100%;
      overflow: auto;
      /* Fluid layout: the two lists lay out by the pane's width. */
      container-type: inline-size;
      padding: 4px 12px 24px 4px;
    }
    .bc-cleanup--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 24px;
      line-height: 30px;
      font-weight: 500;
    }
    .bc-cleanup--intro {
      margin: 2px 0 12px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-cleanup--columns {
      display: grid;
      grid-template-columns: minmax(280px, 342px) minmax(260px, 1fr);
      gap: 16px;
      align-items: start;
    }
    @container (max-width: 599px) {
      .bc-cleanup--columns {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .bc-cleanup--heading {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 600;
    }
    .bc-cleanup--lead {
      margin: -4px 0 8px;
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
    .bc-cleanup--spread {
      justify-content: space-between;
    }
    .bc-cleanup--text,
    .bc-cleanup--tonal,
    .bc-cleanup--danger {
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
    .bc-cleanup--danger {
      color: var(--bc-menu-danger);
      &:disabled {
        opacity: 0.38;
        cursor: default;
      }
    }
    .bc-cleanup--text:hover,
    .bc-cleanup--danger:not(:disabled):hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    /* Mouse: the tonal button takes the 8 % layer of its text colour; a checkbox row gets a halo round its box. */
    @media (hover: hover) and (pointer: fine) {
      .bc-cleanup--tonal {
        transition: box-shadow 120ms linear;
        &:hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
      .bc-cleanup--check:hover .bc-cleanup--box {
        box-shadow: 0 0 0 8px color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }
    .bc-cleanup--check {
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
    .bc-cleanup--box {
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
    .bc-cleanup--check input:checked + .bc-cleanup--box {
      border-color: var(--bc-secondary);
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }
    .bc-cleanup--check input:focus-visible + .bc-cleanup--box {
      outline: 2px solid var(--bc-secondary);
      outline-offset: 2px;
    }
    .bc-cleanup--none {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }
  }
</style>
