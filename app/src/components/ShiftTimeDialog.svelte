<script>
  // @ts-check
  // « Décaler la date et l’heure… » (task 2026-11-24-383; docs/ui-specification.md, « Logbook selection »): the start time of
  // the selected dives moves by the same amount, through the core's undoable ShiftTime. A segmented « Plus tôt / Plus tard »,
  // three wheels (Jours, Heures, Minutes; the mouse wheel, the arrow keys and a typed number work on the desktop), the preview
  // of the first and the last selected dive, then « Annuler » and « Décaler » (disabled at zero). On the iPhone the wheels are
  // three columns of one picker (« 1 h », « 05 min »); the iPhone shows it as a page sheet (« Annuler », title, « Décaler »
  // in its header), the iPad and the other devices as the dialog.
  import { Sheet } from 'framework7-svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import WheelPicker from './WheelPicker.svelte';
  import DesktopSegments from './DesktopSegments.svelte';
  import Icon from './Icon.svelte';
  import { logbook, shiftDives } from '../lib/logbook.svelte.js';
  import { WHEEL_TEXTS, shiftPreview, shiftSeconds } from '../lib/time-shift.js';
  import { formatTimeOfDay, formatWeekdayDate } from '../lib/format.js';
  import { ios, layout } from '../lib/layout.svelte.js';
  import { liveDiveId } from '../lib/dive-ids.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ ids: number[], oncancel: () => void, ondone: () => void }} */
  let { ids, oncancel, ondone } = $props();

  const n = ids.length;
  /** The iPhone's page sheet; the iPad keeps the dialog. */
  const sheet = ios && !layout.split;
  /** The ids now: the core numbers its dives again when it reads the logbook again. */
  const live = $derived(ids.map(liveDiveId));
  let later = $state(true);
  let days = $state(0);
  let hours = $state(0);
  let minutes = $state(0);
  let busy = $state(false);

  const seconds = $derived(shiftSeconds({ later, days, hours, minutes }));
  const rows = $derived(shiftPreview(logbook.dives.filter((d) => live.includes(d.id)), seconds));

  // The iPhone's picker names the unit in each value.
  const texts = $derived({
    days: ios ? WHEEL_TEXTS.days.map((v) => t('shiftTime.daysShort', { n: v })) : WHEEL_TEXTS.days,
    hours: ios ? WHEEL_TEXTS.hours.map((v) => t('shiftTime.hoursShort', { n: v })) : WHEEL_TEXTS.hours,
    minutes: ios ? WHEEL_TEXTS.minutes.map((v) => t('shiftTime.minutesShort', { n: v })) : WHEEL_TEXTS.minutes,
  });

  /** « n° 9 · sam. 2026-02-07 » @param {import('../lib/time-shift.js').ShiftRow} row */
  const diveText = (row) => [row.number > 0 ? t('shiftTime.number', { n: row.number }) : '', formatWeekdayDate(row.before)].filter(Boolean).join(' · ');
  /** The time of day, with the date when the day changes. @param {string} iso @param {boolean} withDate */
  const when = (iso, withDate) => (withDate ? `${formatWeekdayDate(iso)} ${formatTimeOfDay(iso)}` : formatTimeOfDay(iso));

  async function apply() {
    if (busy || seconds === 0) return;
    busy = true;
    try {
      const steps = await shiftDives(live, seconds);
      ondone();
      offerUndo(t('shiftTime.done', { n }), undefined, 6000, steps);
    } catch (e) {
      console.error('Shift dive times', e);
      busy = false;
      const code = String(/** @type {any} */ (e)?.message ?? '');
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('shiftTime.failed'));
    }
  }

  const direction = $derived([
    { value: 'earlier', label: t('shiftTime.earlier') },
    { value: 'later', label: t('shiftTime.later') },
  ]);
</script>

{#snippet content()}
  <div class="bc-shift-time--body" class:bc-shift-time--body-sheet={sheet}>
    {#if ios}
      <div class="bc-shift-time--direction">
        <div class="bc-shift-time--ios-segments" role="radiogroup" aria-label={t('shiftTime.direction')}>
          {#each direction as option (option.value)}
            <button type="button" role="radio" aria-checked={(option.value === 'later') === later} class:bc-shift-time--ios-on={(option.value === 'later') === later} onclick={() => (later = option.value === 'later')}>{option.label}</button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="bc-shift-time--direction">
        <DesktopSegments block options={direction} value={later ? 'later' : 'earlier'} onchange={(v) => (later = v === 'later')} ariaLabel={t('shiftTime.direction')} />
      </div>
    {/if}

    <div class="bc-shift-time--wheels">
      <WheelPicker label={t('shiftTime.days')} values={texts.days} bind:index={days} inline={ios} />
      <WheelPicker label={t('shiftTime.hours')} values={texts.hours} bind:index={hours} inline={ios} />
      <WheelPicker label={t('shiftTime.minutes')} values={texts.minutes} bind:index={minutes} inline={ios} />
    </div>

    <section class="bc-shift-time--preview" aria-labelledby="bc-shift-time-preview">
      <h3 id="bc-shift-time-preview">{t('shiftTime.preview')}</h3>
      {#each rows as row (row.role)}
        <p class="bc-shift-time--dive">{t(`shiftTime.${row.role}`, { dive: diveText(row) })}</p>
        <p class="bc-shift-time--times">
          <s class="bc-shift-time--before">{formatTimeOfDay(row.before)}</s>
          <Icon name="arrowRight" size={16} />
          <b class="bc-shift-time--after">{seconds === 0 ? formatTimeOfDay(row.after) : when(row.after, row.dateChanges)}</b>
        </p>
      {/each}
    </section>
    <p class="bc-shift-time--note">{t('shiftTime.note')}</p>
  </div>
{/snippet}

{#if sheet}
  <Sheet class="bc-shift-time bc-shift-time--sheet" opened backdrop swipeToClose push={false} onSheetClosed={oncancel} aria-label={t('shiftTime.title')}>
    <div class="bc-shift-time--ios-bar">
      <button type="button" class="bc-shift-time--ios-cancel" onclick={oncancel}>{t('dialog.cancel')}</button>
      <span class="bc-shift-time--ios-title">{t('shiftTime.sheetTitle')}</span>
      <button type="button" class="bc-shift-time--apply bc-shift-time--ios-apply" disabled={busy || seconds === 0} onclick={apply}>{t('shiftTime.apply')}</button>
    </div>
    <p class="bc-shift-time--ios-intro">{t('shiftTime.intro', { n })}</p>
    {@render content()}
  </Sheet>
{:else}
<Md3Dialog class="bc-shift-time" title={t('shiftTime.title')} text={t('shiftTime.intro', { n })} {oncancel}>
  {@render content()}

  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" class:button={layout.desktop} class:button-fill={layout.desktop} class="bc-shift-time--apply" disabled={busy || seconds === 0} onclick={apply}>{t('shiftTime.apply')}</button>
  {/snippet}
</Md3Dialog>
{/if}

<style>
  @layer bc.components {
    .bc-shift-time--body {
      padding: 0 24px;
    }

    .bc-shift-time--direction {
      margin-bottom: 8px;
    }

    .bc-shift-time--wheels {
      display: flex;
      gap: 12px;
    }

    .bc-shift-time--preview {
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--bc-surface-container);

      & h3 {
        margin: 0 0 4px;
        font-size: 14px;
        font-weight: 600;
        color: var(--bc-text-2);
      }
    }

    .bc-shift-time--dive {
      margin: 8px 0 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-shift-time--times {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 2px 0 0;
      font-size: 16px;
      font-variant-numeric: tabular-nums;
    }

    .bc-shift-time--before {
      color: var(--bc-text-2);
    }

    .bc-shift-time--after {
      font-weight: 700;
    }

    .bc-shift-time--note {
      margin: 12px 0 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* The desktop's « Décaler » is filled #114477 (--bc-secondary), as « Appliquer » of « Modifier ensemble ». */
    :global(.bc-md3-dialog) button.bc-shift-time--apply:disabled {
      opacity: 0.38;
      cursor: default;
    }
    :global(.bc-md3-dialog) button.bc-shift-time--apply.button-fill {
      padding: 0 24px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      font-weight: 600;
    }

    /* iPhone: the page sheet. */
    :global(.sheet-modal.bc-shift-time--sheet) {
      --f7-sheet-bg-color: var(--bc-background);
      height: auto;
      max-height: 92%;
      border-radius: 10px 10px 0 0;
      overflow-y: auto;
    }

    .bc-shift-time--ios-bar {
      height: 52px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 0 8px;

      & button {
        min-height: 44px;
        padding: 0 8px;
        border: 0;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 17px;
      }
    }

    .bc-shift-time--ios-title {
      font-size: 17px;
      font-weight: 600;
    }

    .bc-shift-time--ios-cancel {
      justify-self: start;
    }

    .bc-shift-time--ios-bar .bc-shift-time--ios-apply {
      justify-self: end;
      font-weight: 600;
    }

    .bc-shift-time--ios-bar .bc-shift-time--ios-apply:disabled {
      opacity: 0.38;
    }

    .bc-shift-time--ios-intro {
      margin: 0;
      padding: 4px 24px 12px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-shift-time--body-sheet {
      padding-bottom: calc(16px + var(--bc-safe-bottom));
    }

    /* iPhone: a two-part segmented control. */
    .bc-shift-time--ios-segments {
      display: flex;
      padding: 2px;
      border-radius: 9px;
      background: var(--bc-surface-container);

      & button {
        flex: 1;
        height: 32px;
        border: 0;
        border-radius: 7px;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 14px;
      }

      & .bc-shift-time--ios-on {
        background: var(--bc-surface);
        font-weight: 600;
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
      }
    }
  }
</style>
