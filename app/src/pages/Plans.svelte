<script>
  // @ts-check
  // "Plongées planifiées" (spec, section 4, "Planner, redesigned"; mock-ups
  // android-plans, -menu and -vide): the planned dives of the logbook, which
  // no other screen lists. A row reopens the plan, its ⋮ duplicates, shares or
  // deletes it.
  import { Page, Navbar, Link, List, Popover, f7, theme } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import ShareSheet from '../components/ShareSheet.svelte';
  import { logbook, savePlan, deleteDives } from '../lib/logbook.svelte.js';
  import { planner, requestOfPlan, loadSetup } from '../lib/planner.svelte.js';
  import { formatDepth, formatDuration, formatGasLong, formatDate, formatMixName } from '../lib/format.js';
  import { planRowTitle } from '../lib/plan-title.js';
  import { tick } from 'svelte';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { sharePlanPdf, sharePlanSummary } from '../lib/share.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('benthic-core').PlannedDive} PlannedDive */

  const uid = $props.id();
  const menuId = `bc-plans-menu-${uid}`;
  const prefs = $derived(logbook.prefs);

  let plans = $state(/** @type {PlannedDive[]|null} */ (null));
  let failed = $state(false);
  let current = $state(/** @type {PlannedDive|null} */ (null));
  let sharing = $state(false);
  /** The plan just saved: its row is highlighted for about 2 s. */
  let highlighted = $state(0);
  /** The "Plan enregistré" snackbar is showing: the FAB sits above it. */
  let snackbarUp = $state(false);
  /** @type {HTMLElement|undefined} */
  let listEl = $state();

  async function load() {
    try {
      plans = await BenthicCore.listPlans();
      failed = false;
    } catch (e) {
      console.error('Planned dives', e);
      failed = true;
    }
    if (planner.justSaved) await announceSaved();
  }

  /** After saving a plan: highlight its row, scroll to it, say so (task 37). */
  async function announceSaved() {
    const id = planner.justSaved;
    planner.justSaved = 0;
    highlighted = id;
    snackbarUp = true;
    showSnackbar(t('plan.saved'), { hasFab: false, onClosed: () => (snackbarUp = false) });
    setTimeout(() => {
      if (highlighted === id) highlighted = 0;
    }, 2000);
    await tick();
    listEl?.querySelector('.bc-plans--row-highlighted')?.scrollIntoView({ block: 'nearest' });
  }
  loadSetup().catch((e) => console.error('Planner setup', e));

  /** @param {PlannedDive} plan */
  function title(plan) {
    return planRowTitle(plan.title, t('plans.fallbackTitle', { date: formatDate(plan.date) })).text;
  }

  /** @param {PlannedDive} plan */
  function untitled(plan) {
    return planRowTitle(plan.title, '').isFallback;
  }

  /** @param {PlannedDive} plan */
  function detail(plan) {
    const gas = plan.gases[0];
    const o2 = gas?.o2Permille ?? 209;
    const he = gas?.hePermille ?? 0;
    return [he === 0 && o2 >= 1000 ? formatGasLong(o2, he) : formatMixName(o2, he), formatDate(plan.date)].join(' · ');
  }

  /** @param {MouseEvent} e @param {PlannedDive} plan */
  function openMenu(e, plan) {
    e.preventDefault();
    e.stopPropagation();
    current = plan;
    f7.popover.open(`#${menuId}`, /** @type {HTMLElement} */ (e.currentTarget));
  }

  function closeMenu() {
    f7.popover.close(`#${menuId}`);
  }

  async function duplicate() {
    closeMenu();
    if (!current) return;
    try {
      await savePlan(requestOfPlan(current, prefs));
      await load();
    } catch (e) {
      console.error('Duplicating a plan', e);
      showSnackbar(t('plan.saveFailed'));
    }
  }

  function remove() {
    closeMenu();
    const plan = current;
    if (!plan) return;
    confirmAction({
      title: t('plans.deleteTitle'),
      text: t('plans.deleteText'),
      action: t('plans.delete'),
      onConfirm: async () => {
        // Off the list at once: saving and syncing take a moment.
        plans = (plans ?? []).filter((p) => p.id !== plan.id);
        try {
          await deleteDives([plan.id]);
          offerUndo(t('plans.deleted'), () => load(), 10000);
        } catch (e) {
          console.error('Deleting a plan', e);
          showSnackbar(t('plans.deleteFailed'));
          await load();
        }
      },
    });
  }

  /** @param {'pdf'|'summary'} kind */
  async function share(kind) {
    sharing = false;
    const plan = current;
    if (!plan) return;
    try {
      const request = requestOfPlan(plan, prefs);
      const result = await BenthicCore.planDive(request);
      if (kind === 'pdf') await sharePlanPdf(result, request, prefs, title(plan));
      else await sharePlanSummary(result, request, prefs, title(plan));
    } catch (e) {
      console.error('Sharing a plan', e);
      showSnackbar(t('plan.shareFailed'));
    }
  }
</script>

<Page class="bc-plans" onPageBeforeIn={load}>
  <Navbar title={t('plans.title')}>
    {#snippet left()}
      <Link back iconOnly={!theme.ios}>
        <i class="icon icon-back"></i>
        {#if theme.ios}<span>{t('plan.back')}</span>{:else}<span class="bc-sr-only">{t('plan.back')}</span>{/if}
      </Link>
    {/snippet}
  </Navbar>

  {#if failed}
    <p class="bc-plans--intro">{t('plans.failed')}</p>
  {:else if plans && plans.length === 0}
    <div class="bc-plans--empty">
      <Icon name="plan" size={48} />
      <p class="bc-plans--headline">{t('plans.empty')}</p>
      <p class="bc-plans--text">{t('plans.emptyText')}</p>
    </div>
  {:else if plans}
    <p class="bc-plans--intro">{t('plans.intro')}</p>
    <div class="list" bind:this={listEl}>
      {#each plans as plan (plan.id)}
        <div class="bc-plans--row" class:bc-plans--row-highlighted={plan.id === highlighted}>
          <a class="bc-plans--open" href="/plans/{plan.benthicId || plan.id}">
            <ProfileThumbnail profile={plan.profile} maxDepthMm={plan.maxDepthMm} {prefs} />
            <span class="bc-plans--texts">
              <span class="bc-plans--name" class:bc-plans--name-fallback={untitled(plan)}>{title(plan)}</span>
              <span class="bc-plans--sub">{detail(plan)}</span>
            </span>
            <span class="bc-plans--figures bc-value">
              <span class="bc-plans--depth">{formatDepth(plan.maxDepthMm, prefs)}</span>
              <span class="bc-plans--time">{formatDuration(plan.durationSeconds)}</span>
            </span>
          </a>
          <button type="button" class="bc-plans--more" aria-label={t('plans.more')} onclick={(e) => openMenu(e, plan)}><Icon name="more" weight={4} /></button>
        </div>
      {/each}
    </div>
  {/if}

  <Popover id={menuId} class="bc-menu" backdrop={false}>
    <List noChevron>
      <MenuItem icon="copy" text={t('plans.duplicate')} onclick={duplicate} />
      <MenuItem
        icon="share"
        text={t('plans.share')}
        onclick={() => {
          closeMenu();
          sharing = true;
        }}
      />
      <MenuItem icon="delete" text={t('plans.delete')} destructive onclick={remove} />
    </List>
  </Popover>

  {#snippet fixedContent()}
    <div class="fab fab-right-bottom fab-extended bc-fab-add bc-plans--fab" class:bc-plans--fab-raised={snackbarUp}>
      <a href="/plan/new">
        <i class="icon"><Icon name="plus" /></i>
        <div class="fab-text">{t('plans.new')}</div>
      </a>
    </div>
  {/snippet}
</Page>

{#if sharing}
  <ShareSheet pdfText={t('plan.sharePdfText')} summaryLabel={t('plan.shareSummary')} summaryText={t('plan.shareSummaryText')} onpdf={() => share('pdf')} onsummary={() => share('summary')} onclose={() => (sharing = false)} />
{/if}

<style>
  @layer bc.components {
    .bc-plans--intro {
      margin: 8px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-plans--row {
      display: flex;
      align-items: center;
      min-height: 72px;
    }

    /* The saved plan, then back to normal: the highlight fades over 400 ms after its 2 s. */
    .bc-plans--row {
      background: transparent;
      transition: background-color 400ms ease-out;
    }

    .bc-plans--row-highlighted {
      background: var(--bc-surface-container-high);
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-plans--row {
        transition: none;
      }
    }

    .bc-plans--name-fallback {
      color: var(--bc-text-2);
    }

    .bc-plans--fab {
      transition: transform 250ms ease-out;
    }

    .bc-plans--fab-raised {
      /* The snackbar (48 dp at 24 dp) takes the bottom: the FAB goes above it. */
      transform: translateY(-80px);
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-plans--fab {
        transition: none;
      }
    }

    .bc-plans--open {
      flex: 1;
      min-width: 0;
      padding: 8px 0 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--bc-text);
      text-decoration: none;
    }

    .bc-plans--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-plans--name {
      font-size: 16px;
      line-height: 24px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-plans--sub {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bc-plans--figures {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;

      .bc-plans--depth {
        font-size: 16px;
        font-weight: 600;
      }

      .bc-plans--time {
        font-size: 14px;
        color: var(--bc-text-2);
      }
    }

    .bc-plans--more {
      flex: none;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .bc-plans--empty {
      margin-top: 96px;
      padding: 0 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      color: var(--bc-text);

      .bc-plans--headline {
        margin: 16px 0 4px;
        font-size: 16px;
        font-weight: 600;
      }

      .bc-plans--text {
        margin: 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--bc-text-2);
      }
    }
  }
</style>
