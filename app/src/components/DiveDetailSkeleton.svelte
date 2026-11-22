<script>
  // @ts-check
  // The dive detail while it is read (docs/system-design.md, section 9, loading state): the
  // shape of the screen that comes, so that nothing jumps when it arrives. Shown by the
  // detail page before its dive is read, and in the detail pane at start (tablet and desktop),
  // while the core reads the logbook and no dive can be opened yet.
  import { t } from '../lib/i18n.js';

  /** @type {{ desk?: boolean }} desk: the desktop detail pane's layout (title, profile card, figures, fields); else the phone and tablet one */
  let { desk = false } = $props();
</script>

<div class="bc-dive-detail-skeleton skeleton-effect-wave" class:bc-dive-detail-skeleton--desk={desk} aria-busy="true" aria-label={t('detail.loading')} role="status">
  {#if desk}
    <div class="bc-dive-detail-skeleton--desk-head" aria-hidden="true">
      <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--desk-title"></span>
      <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--desk-sub"></span>
    </div>
    <div class="skeleton-block bc-dive-detail-skeleton--desk-profile" aria-hidden="true"></div>
    <div class="bc-dive-detail-skeleton--desk-figures" aria-hidden="true">
      {#each [4, 4, 4, 4, 3] as width, i (i)}
        <div>
          <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--label"></span>
          <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--value" style:width="{width}em"></span>
        </div>
      {/each}
    </div>
    <div class="skeleton-block bc-dive-detail-skeleton--desk-fields" aria-hidden="true"></div>
  {:else}
    <div class="bc-dive-detail-skeleton--head" aria-hidden="true">
      <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--day"></span>
      <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--site"></span>
      <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--place"></span>
    </div>
    <div class="bc-dive-detail-skeleton--figures" aria-hidden="true">
      {#each [0, 1, 2] as i (i)}
        <div>
          <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--figure"></span>
          <span class="skeleton-block bc-dive-detail-skeleton--bar bc-dive-detail-skeleton--label"></span>
        </div>
      {/each}
    </div>
    <div class="skeleton-block bc-dive-detail-skeleton--profile" aria-hidden="true"></div>
  {/if}
</div>

<style>
  @layer od.components {
    /* Framework7 gives a skeleton block the whole width: the margins below would push it past the pane. */
    .bc-dive-detail-skeleton--profile,
    .bc-dive-detail-skeleton--desk-profile,
    .bc-dive-detail-skeleton--desk-fields {
      width: auto;
    }

    .bc-dive-detail-skeleton--bar {
      display: block;
      max-width: 100%;
      border-radius: 4px;
    }

    /* Phone and tablet: the day, the site, the three figures, the profile (as DiveDetail.svelte and DiveFigures.svelte). */
    .bc-dive-detail-skeleton--head {
      padding: 16px 20px 0;
    }
    .bc-dive-detail-skeleton--day {
      width: 11em;
      height: 15px;
    }
    .bc-dive-detail-skeleton--site {
      width: 60%;
      height: 30px;
      margin-top: 7px;
      border-radius: 6px;
    }
    .bc-dive-detail-skeleton--place {
      width: 14em;
      height: 15px;
      margin-top: 12px;
    }
    .bc-dive-detail-skeleton--figures {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      padding: 26px 20px 0;

      & > div {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
    }
    .bc-dive-detail-skeleton--figure {
      width: 3.5em;
      height: 22px;
    }
    .bc-dive-detail-skeleton--label {
      width: 4.5em;
      height: 11px;
    }
    .bc-dive-detail-skeleton--profile {
      height: 180px;
      margin: 40px 16px 0;
      border-radius: 16px;
    }

    /* Desktop: the title and its line, the profile card, the figures, then the fields (task 2026-11-15-193). */
    .bc-dive-detail-skeleton--desk-head {
      padding: 36px 16px 8px 24px;
    }
    .bc-dive-detail-skeleton--desk-title {
      width: 18em;
      height: 22px;
      margin-top: 3px;
    }
    .bc-dive-detail-skeleton--desk-sub {
      width: 24em;
      height: 13px;
      margin-top: 9px;
    }
    .bc-dive-detail-skeleton--desk-profile {
      height: 230px;
      margin: 30px 24px 0;
      border-radius: 16px;
    }
    .bc-dive-detail-skeleton--desk-figures {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 28px;
      margin: 16px 24px 0;

      & > div {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
    }
    .bc-dive-detail-skeleton--value {
      height: 17px;
    }
    .bc-dive-detail-skeleton--desk-fields {
      height: 200px;
      margin: 56px 24px 0;
      border-radius: 16px;
    }
  }
</style>
