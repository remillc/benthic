<script>
  // @ts-check
  // The maintenance of one piece (task 2026-11-18-274, docs/mockups-release/ent-piece-android.dc.html): for each
  // reminder a card with its rule, the progress (« 82 plongées sur 100 », « Échéance : … »), « Noter un entretien »
  // and « Modifier le rappel »; a row to add the next suggested reminder (a second one, such as « Contrôle avant
  // voyage »); then « Historique ». The dives counted are those where the piece is in the equipment.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import GearIcon from '../components/GearIcon.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import MaintenanceRuleSheet from '../components/MaintenanceRuleSheet.svelte';
  import { gear, loadInventory, change, evaluations, figuresOf, diveKeysOf } from '../lib/inventory.svelte.js';
  import { suggestionsFor, leadDays, ownLeadDays, stampOf } from '../lib/maintenance.js';
  import { settings } from '../lib/settings.svelte.js';
  import { ruleText, taskLabel, tagText } from '../lib/maintenance-text.js';
  import { afterReminderSaved } from '../lib/maintenance-notify.js';
  import { formatDate, formatMonthYear, formatNumber, formatHours } from '../lib/format.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  const id = f7route.params.id;
  onMount(loadInventory);

  const piece = $derived(gear.pieces.find((g) => g.id === id));
  const all = $derived(evaluations().filter((e) => e.item.gearId === id));
  /** The cards in the order of the tasks: a bottle shows its inspection, then its hydrostatic test. */
  const withRule = $derived(all.filter((e) => e.active).sort((a, b) => ['o2Cells', 'service', 'inspection', 'hydrostatic', 'seals'].indexOf(a.item.task) - ['o2Cells', 'service', 'inspection', 'hydrostatic', 'seals'].indexOf(b.item.task)));
  const figures = $derived(piece ? figuresOf(piece) : { dives: 0, seconds: 0 });
  const isCylinder = $derived(piece?.type === 'cylinder');

  /** The date of a cylinder's hydrostatic test is known to the month (the stamp on the bottle). @param {import('../lib/maintenance.js').Evaluation} e @param {string} iso */
  const dateText = (e, iso) => (e.item.task === 'hydrostatic' ? formatMonthYear(iso) : formatDate(iso));

  /** The button of a card: « Noter l'inspection », « Noter l'épreuve » on a bottle, else « Noter un entretien ». @param {import('../lib/maintenance.js').Evaluation} e */
  const noteLabel = (e) => (e.item.task === 'inspection' && isCylinder ? t('maintenance.piece.noteInspection') : e.item.task === 'hydrostatic' ? t('maintenance.piece.noteHydrostatic') : t('maintenance.piece.note'));

  /** The line under a card's title: the rule, and for a hydrostatic test the stamp of the last one. @param {import('../lib/maintenance.js').Evaluation} e */
  const ruleLine = (e) => (e.item.task === 'hydrostatic' && e.item.lastDoneOn ? t('maintenance.piece.stamped', { rule: ruleText(e.item), stamp: stampOf(e.item.lastDoneOn) }) : ruleText(e.item));

  /** Hours under water since the last service, next to the dive count (« 82 plongées sur 100 · 61 h »). @param {import('../lib/maintenance.js').Evaluation} e */
  function hoursSince(e) {
    const since = new Set(diveKeysOf(e.item.gearId).filter((k) => (e.item.lastDoneOn ? k.slice(0, 10) > e.base : k.slice(0, 10) >= e.base)));
    let seconds = 0;
    for (const d of logbook.dives) if (since.has(String(d.date).slice(0, 19))) seconds += d.durationSeconds;
    return seconds;
  }

  /** The suggestions of the type that have no reminder yet: the first of them is offered as the next one to add. */
  const free = $derived(suggestionsFor(piece?.type ?? '', piece?.details ?? {}).filter((s) => !all.some((e) => e.item.task === s.task && e.active)));
  const next = $derived(free[0]);

  /** The history of all the piece's reminders, latest first. */
  const history = $derived(
    all
      .flatMap((e) => (e.item.history ?? []).map((h) => ({ ...h, item: e.item })))
      .sort((a, b) => (a.doneOn < b.doneOn ? 1 : a.doneOn > b.doneOn ? -1 : 0)),
  );

  /**
   * The rule sheet's target: an existing reminder, or a suggestion to add.
   * @type {{ item?: import('../lib/maintenance.js').MaintenanceItem, task: import('../lib/maintenance.js').Task, months: number|null, dives: number|null, notifyDays: 14|30|60, warnInDive: boolean }|null}
   */
  let target = $state(null);

  /** @param {import('../lib/maintenance.js').Evaluation} e */
  function editRule(e) {
    target = { item: e.item, task: e.item.task, months: e.item.intervalMonths, dives: e.item.intervalDives, notifyDays: leadDays(e.item, settings.maintenanceLeadDays), warnInDive: e.item.warnInDive };
  }

  /** @param {import('../lib/maintenance.js').Suggestion} s */
  function addRule(s) {
    const existing = all.find((e) => e.item.task === s.task)?.item;
    target = { item: existing, task: s.task, months: s.months ?? null, dives: s.dives ?? null, notifyDays: existing ? leadDays(existing, settings.maintenanceLeadDays) : settings.maintenanceLeadDays, warnInDive: existing?.warnInDive ?? true };
  }

  /** @param {{ months: number|null, dives: number|null, notifyDays: 14|30|60, warnInDive: boolean }} rule */
  async function saveRule(rule) {
    const tg = target;
    if (!tg) return;
    target = null;
    try {
      await change((inv) =>
        inv.saveMaintenance({ id: tg.item?.id, gearId: id, task: tg.task, label: tg.item?.label, intervalMonths: rule.months, intervalDives: rule.dives, notifyDays: ownLeadDays(rule.notifyDays, settings.maintenanceLeadDays), warnInDive: rule.warnInDive }),
      );
      showSnackbar(t('maintenance.ruleSheet.saved'));
      afterReminderSaved();
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'maintenance.ruleSheet.failed'));
    }
  }

  async function removeRule() {
    const item = target?.item;
    target = null;
    if (!item) return;
    try {
      await change((inv) => inv.removeRule(item.id));
      showSnackbar(t('maintenance.ruleSheet.removed'));
    } catch {
      showSnackbar(t('gear.inventory.readOnlyRefused'));
    }
  }

  /** @param {import('../lib/maintenance.js').Evaluation} e the share of the way to the due point, 0 to 1 */
  function progress(e) {
    if (e.item.intervalDives != null) return Math.min(1, Math.max(0, e.divesSince / e.item.intervalDives));
    if (e.dueDate && e.item.intervalMonths != null) {
      const span = Math.max(1, Math.round((Date.parse(e.dueDate) - Date.parse(e.base)) / 86400000));
      return Math.min(1, Math.max(0, 1 - (e.daysLeft ?? 0) / span));
    }
    return 0;
  }

  /** @param {string} path */
  const go = (path) => f7router.navigate(path);

  /** @param {number} cost */
  const money = (cost) => formatNumber(cost, Number.isInteger(cost) ? 0 : 2);
</script>

{#snippet body()}

  <ReadOnlyNotice />

  {#if piece}
    <div class="bc-piece-maintenance--head">
      <span class="bc-piece-maintenance--tile"><GearIcon type={piece.type} name={piece.name} size={26} {piece} tile={48} radius={14} /></span>
      <span class="bc-piece-maintenance--who">
        <span class="bc-piece-maintenance--type">{t(`gear.inventory.type.${piece.type}`)}</span>
        <span class="bc-piece-maintenance--name">{piece.name}</span>
        <span class="bc-piece-maintenance--line">{[piece.note, figures.dives ? t('gear.inventory.dives', { n: figures.dives }) : ''].filter(Boolean).join(' · ')}</span>
      </span>
    </div>

    <h2 class="bc-piece-maintenance--title">{t('maintenance.piece.cardTitle')}</h2>

    {#each withRule as e (e.item.id)}
      <section class="bc-piece-maintenance--card" aria-label={taskLabel(e.item)}>
        <div class="bc-piece-maintenance--card-head">
          <span class="bc-piece-maintenance--task">{taskLabel(e.item)}</span>
          <span class="bc-piece-maintenance--tag bc-piece-maintenance--tag-{e.status}">{tagText(e)}</span>
        </div>
        <p class="bc-piece-maintenance--rule">{ruleLine(e)}</p>
        <div class="bc-piece-maintenance--bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress(e) * 100)} aria-label={taskLabel(e.item)}>
          <span class="bc-piece-maintenance--bar-fill bc-piece-maintenance--bar-{e.status}" style:width={`${Math.round(progress(e) * 100)}%`}></span>
        </div>
        {#if e.item.intervalDives != null}
          <p class="bc-piece-maintenance--progress">{t('maintenance.piece.dives', { n: e.divesSince, done: e.divesSince, total: e.item.intervalDives })}{#if hoursSince(e)} · {formatHours(hoursSince(e))}{/if}</p>
        {/if}
        {#if e.item.lastDoneOn}
          <p class="bc-piece-maintenance--progress">{t('maintenance.piece.last', { date: dateText(e, e.item.lastDoneOn) })}</p>
        {/if}
        {#if e.dueDate}
          <p class="bc-piece-maintenance--progress">{t('maintenance.piece.due', { date: dateText(e, e.dueDate) })}</p>
        {/if}
        <div class="bc-piece-maintenance--buttons">
          <button type="button" class="bc-piece-maintenance--filled" disabled={gear.readOnly} onclick={() => go(`/profile/gear/${id}/maintenance/note?item=${e.item.id}`)}>
            <Icon name="check" size={20} />{noteLabel(e)}
          </button>
          <button type="button" class="bc-piece-maintenance--outlined" disabled={gear.readOnly} onclick={() => editRule(e)}>{t('maintenance.piece.editRule')}</button>
        </div>
      </section>
    {/each}

    {#if next}
      <div class="bc-piece-maintenance--second">
        <Icon name="clock" size={22} />
        <span class="bc-piece-maintenance--second-texts">
          <span class="bc-piece-maintenance--second-title">{taskLabel({ task: next.task })}</span>
          <span class="bc-piece-maintenance--second-line">{t('maintenance.piece.none')}</span>
        </span>
        <button type="button" class="bc-piece-maintenance--outlined" disabled={gear.readOnly} onclick={() => addRule(next)}>{t('maintenance.piece.add')}</button>
      </div>
    {:else if !withRule.length}
      <div class="bc-piece-maintenance--second">
        <Icon name="clock" size={22} />
        <span class="bc-piece-maintenance--second-texts">
          <span class="bc-piece-maintenance--second-title">{t('maintenance.piece.title')}</span>
          <span class="bc-piece-maintenance--second-line">{t('maintenance.piece.none')}</span>
        </span>
        <button type="button" class="bc-piece-maintenance--outlined" disabled={gear.readOnly} onclick={() => addRule({ task: 'service', months: 24 })}>{t('maintenance.piece.add')}</button>
      </div>
    {/if}

    <h2 class="bc-piece-maintenance--title">{t('maintenance.piece.history')}</h2>
    {#if history.length}
      <ul class="bc-piece-maintenance--history">
        {#each history as h (h.id)}
          <li>
            <span class="bc-piece-maintenance--history-icon"><Icon name="check" size={18} /></span>
            <span class="bc-piece-maintenance--history-texts">
              <span class="bc-piece-maintenance--history-title">{h.kind === 'service' ? taskLabel(h.item) : t(`maintenance.kind.${h.kind}`)}</span>
              <span class="bc-piece-maintenance--history-line">
                {[h.item.task === 'hydrostatic' ? formatMonthYear(h.doneOn) : formatDate(h.doneOn), h.item.task === 'hydrostatic' ? t('maintenance.piece.stampedEntry') : '', h.doneBy ? t('maintenance.piece.by', { who: h.doneBy }) : t('maintenance.piece.byYou'), h.cost != null ? money(h.cost) : ''].filter(Boolean).join(' · ')}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="bc-piece-maintenance--none">{t('maintenance.piece.historyEmpty')}</p>
    {/if}

    <p class="bc-piece-maintenance--note"><Icon name="info" size={18} /><span>{t('maintenance.piece.countNote')}</span></p>
  {/if}
  <div class="bc-piece-maintenance--bottom"></div>
{/snippet}

<Page class="bc-piece-maintenance" onPageBeforeIn={loadInventory}>
  <Navbar title={t('maintenance.piece.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="bc-sr-only">{t('maintenance.back')}</span>
      </Link>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="maintenance" list="maintenance" selected={id}>{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

<MaintenanceRuleSheet
  opened={!!target}
  name={piece?.name ?? ''}
  initial={{ months: target?.months ?? null, dives: target?.dives ?? null, notifyDays: target?.notifyDays ?? settings.maintenanceLeadDays, warnInDive: target?.warnInDive ?? true }}
  removable={!!target?.item && (target.item.intervalMonths != null || target.item.intervalDives != null)}
  onclose={() => (target = null)}
  onsave={saveRule}
  onremove={removeRule}
/>

<style>
  @layer od.components {
    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.bc-piece-maintenance .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-piece-maintenance--head {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--bc-surface);
    }

    .bc-piece-maintenance--tile {
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-tile);
    }

    .bc-piece-maintenance--who {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-piece-maintenance--type,
    .bc-piece-maintenance--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-piece-maintenance--name {
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }

    .bc-piece-maintenance--title {
      margin: 20px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    .bc-piece-maintenance--card,
    .bc-piece-maintenance--second {
      margin: 0 16px 8px;
      padding: 16px;
      border-radius: 20px;
      background: var(--bc-surface);
    }

    .bc-piece-maintenance--card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .bc-piece-maintenance--task {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .bc-piece-maintenance--tag {
      flex: none;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 20px;
      font-weight: 500;
      background: var(--bc-surface-2);
    }

    .bc-piece-maintenance--tag-overdue {
      background: var(--bc-alarm-tint);
      color: var(--bc-alarm);
    }

    .bc-piece-maintenance--tag-soon {
      background: var(--bc-pending-container, var(--bc-surface-2));
    }

    .bc-piece-maintenance--rule {
      margin: 4px 0 12px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-piece-maintenance--bar {
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--bc-surface-2);
    }

    .bc-piece-maintenance--bar-fill {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--bc-secondary);
    }

    .bc-piece-maintenance--bar-overdue {
      background: var(--bc-alarm);
    }

    .bc-piece-maintenance--progress {
      margin: 8px 0 0;
      font-size: 14px;
      line-height: 20px;
    }

    .bc-piece-maintenance--buttons {
      margin-top: 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .bc-piece-maintenance--filled,
    .bc-piece-maintenance--outlined {
      width: auto;
      height: 40px;
      padding: 0 20px;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-piece-maintenance--filled {
      padding: 0 20px 0 14px;
      border: none;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }

    .bc-piece-maintenance--outlined {
      border: var(--bc-outline-width) solid var(--bc-outline);
      background: none;
      color: var(--bc-secondary);
    }

    .bc-piece-maintenance--filled:disabled,
    .bc-piece-maintenance--outlined:disabled {
      opacity: 0.38;
    }

    .bc-piece-maintenance--second {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-piece-maintenance--second-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-piece-maintenance--second-title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .bc-piece-maintenance--second-line {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-piece-maintenance--history {
      margin: 0 16px;
      padding: 0;
      list-style: none;

      li {
        min-height: 56px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
    }

    .bc-piece-maintenance--history-icon {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-piece-maintenance--history-texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .bc-piece-maintenance--history-title {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-piece-maintenance--history-line,
    .bc-piece-maintenance--none {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-piece-maintenance--none {
      margin: 0 20px;
    }

    .bc-piece-maintenance--note {
      margin: 16px 20px 0;
      display: flex;
      gap: 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-piece-maintenance--bottom {
      height: 48px;
    }
  }
</style>
