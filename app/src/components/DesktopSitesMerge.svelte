<script>
  // @ts-check
  // « Fusionner » in the desktop Sites clean-up asks which of the two sites to keep, as the phone's
  // clean-up does (pages/SitesCleanup.svelte): the two sites as choice rows, the one with more dives
  // chosen first, a line that says what the merge does, then « Fusionner ». The merge can be undone.
  import Md3Dialog from './Md3Dialog.svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import { mergeSides } from '../lib/desktop-sites.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('benthic-core').SiteSummary} Site */

  /**
   * @type {{
   *   a: Site,
   *   b: Site,
   *   describe: (site: Site) => string,
   *   onmerge: (keep: Site, other: Site) => void,
   *   onclose: () => void,
   * }}
   */
  let { a, b, describe, onmerge, onclose } = $props();

  /** @type {number|null} */
  let kept = $state(null);
  const sides = $derived(mergeSides(a, b, kept));
  const name = (/** @type {Site} */ s) => s.name || t('sites.noName');
</script>

<Md3Dialog class="bc-sites-merge" title={t('desktopFollowups.siteMerge.title')} oncancel={onclose}>
  <p class="bc-sites-merge--lead">{t('desktopFollowups.siteMerge.which')}</p>
  <div class="bc-sites-merge--choices" role="radiogroup" aria-label={t('desktopFollowups.siteMerge.which')}>
    {#each [sides.first, sides.second] as s (s.uuid)}
      <ChoiceRow name="bc-sites-merge-keep" selected={sides.keep === s} onselect={() => (kept = s.uuid)}>
        <span class="bc-sites-merge--label">{name(s)}</span>
        <span class="bc-sites-merge--line">{describe(s)}</span>
      </ChoiceRow>
    {/each}
  </div>
  <p class="bc-sites-merge--effect">{t('sites.mergeText', { keep: name(sides.keep), other: name(sides.other) })}</p>

  {#snippet actions()}
    <button type="button" class="button" onclick={onclose}>{t('dialog.cancel')}</button>
    <button type="button" class="button button-fill" onclick={() => onmerge(sides.keep, sides.other)}>{t('sites.merge')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-sites-merge--lead,
    .bc-sites-merge--effect {
      margin: 0;
      padding-inline: 24px;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-sites-merge--lead {
      margin-bottom: 8px;
    }
    .bc-sites-merge--effect {
      margin-top: 12px;
    }
    .bc-sites-merge--choices {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .bc-sites-merge--label {
      display: block;
      font-size: 15px;
      color: var(--bc-text);
    }
    .bc-sites-merge--line {
      display: block;
      font-size: 13px;
      color: var(--bc-text-2);
    }
  }
</style>
