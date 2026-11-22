<script>
  // @ts-check
  // « Rappel d'entretien » (task 2026-11-18-274, docs/mockups/ent-regle-android.dc.html): a bottom sheet with
  // two criteria, each a card with a switch (« Après une durée »: a stepper in years or months; « Selon les
  // plongées »: a number of dives), « Me prévenir avant » 14, 30 or 60 days (task 2026-11-19-308), « Avertir dans une plongée », then
  // Retirer le rappel, Annuler and Enregistrer. With both criteria the first one reached triggers the reminder.
  import { Sheet } from 'framework7-svelte';
  import ButtonGroup from './ButtonGroup.svelte';
  import Icon from './Icon.svelte';
  import { NOTIFY_CHOICES, ruleProblems } from '../lib/maintenance.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   opened: boolean,
   *   name: string,
   *   initial: { months: number|null, dives: number|null, notifyDays: 14|30|60, warnInDive: boolean },
   *   removable?: boolean,
   *   onclose: () => void,
   *   onsave: (rule: { months: number|null, dives: number|null, notifyDays: 14|30|60, warnInDive: boolean }) => void,
   *   onremove?: () => void,
   * }}
   * initial: the rule to start from (a suggestion, or the reminder's own); removable: « Retirer le rappel » is shown.
   */
  let { opened, name, initial, removable = false, onclose, onsave, onremove } = $props();

  let timeOn = $state(true);
  let years = $state(true);
  let timeValue = $state('2');
  let divesOn = $state(false);
  let divesValue = $state('100');
  /** @type {14|30|60} */
  let notifyDays = $state(30);
  let warn = $state(true);

  $effect(() => {
    if (!opened) return;
    const m = initial.months;
    timeOn = m != null || initial.dives == null;
    years = m == null || m % 12 === 0;
    timeValue = String(m == null ? 2 : years ? m / 12 : m);
    divesOn = initial.dives != null;
    divesValue = String(initial.dives ?? 100);
    notifyDays = initial.notifyDays;
    warn = initial.warnInDive;
  });

  /** @param {string} text */
  const whole = (text) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);
  const months = $derived(timeOn ? (years ? whole(timeValue) * 12 : whole(timeValue)) : null);
  const dives = $derived(divesOn ? whole(divesValue) : null);
  const problems = $derived(ruleProblems({ months: months != null && Number.isNaN(months) ? 0 : months, dives: dives != null && Number.isNaN(dives) ? 0 : dives }));
  const canSave = $derived(!problems.criteria && !problems.months && !problems.dives);

  /** @param {'time'|'dives'} which @param {number} delta */
  function step(which, delta) {
    if (which === 'time') timeValue = String(Math.max(1, (Number.isNaN(whole(timeValue)) ? 0 : whole(timeValue)) + delta));
    else divesValue = String(Math.max(1, (Number.isNaN(whole(divesValue)) ? 0 : whole(divesValue)) + delta));
  }

  function save() {
    if (!canSave) return;
    onsave({ months, dives, notifyDays, warnInDive: warn });
  }
</script>

<Sheet class="bc-rule-sheet" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={t('maintenance.ruleSheet.title')}>
  <div class="bc-rule-sheet--content">
    <h2 class="bc-rule-sheet--title">{t('maintenance.ruleSheet.title')}</h2>
    <p class="bc-rule-sheet--lead">{t('maintenance.ruleSheet.lead', { name })}</p>

    <div class="bc-rule-sheet--scroll">
      <div class="bc-rule-sheet--card" class:bc-rule-sheet--card-on={timeOn}>
        <div class="bc-rule-sheet--row">
          <span class="bc-rule-sheet--icon"><Icon name="calendar" size={22} /></span>
          <span class="bc-rule-sheet--texts">
            <span class="bc-rule-sheet--label" id="od-rule-time">{t('maintenance.ruleSheet.time')}</span>
            <span class="bc-rule-sheet--help">{t('maintenance.ruleSheet.timeHelp')}</span>
          </span>
          <label class="toggle"><input type="checkbox" role="switch" aria-labelledby="od-rule-time" bind:checked={timeOn} /><span class="toggle-icon"></span></label>
        </div>
        {#if timeOn}
          <div class="bc-rule-sheet--stepper">
            <button type="button" aria-label={t('maintenance.ruleSheet.less')} onclick={() => step('time', -1)}><Icon name="remove" size={20} /></button>
            <input type="text" inputmode="numeric" bind:value={timeValue} aria-label={t('maintenance.ruleSheet.value')} aria-invalid={!!problems.months} />
            <button type="button" aria-label={t('maintenance.ruleSheet.more')} onclick={() => step('time', 1)}><Icon name="plus" size={20} /></button>
            <ButtonGroup
              ariaLabel={t('maintenance.ruleSheet.unit')}
              value={years ? 'years' : 'months'}
              onchange={(v) => (years = v === 'years')}
              options={[
                { value: 'years', label: t('maintenance.ruleSheet.years') },
                { value: 'months', label: t('maintenance.ruleSheet.months') },
              ]}
            />
          </div>
          {#if problems.months}<p class="bc-rule-sheet--error" role="alert">{t('maintenance.ruleSheet.range')}</p>{/if}
        {/if}
      </div>

      <div class="bc-rule-sheet--card" class:bc-rule-sheet--card-on={divesOn}>
        <div class="bc-rule-sheet--row">
          <span class="bc-rule-sheet--icon"><Icon name="logbook" size={22} /></span>
          <span class="bc-rule-sheet--texts">
            <span class="bc-rule-sheet--label" id="od-rule-dives">{t('maintenance.ruleSheet.dives')}</span>
            <span class="bc-rule-sheet--help">{t('maintenance.ruleSheet.divesHelp')}</span>
          </span>
          <label class="toggle"><input type="checkbox" role="switch" aria-labelledby="od-rule-dives" bind:checked={divesOn} /><span class="toggle-icon"></span></label>
        </div>
        {#if divesOn}
          <div class="bc-rule-sheet--stepper">
            <button type="button" aria-label={t('maintenance.ruleSheet.less')} onclick={() => step('dives', -10)}><Icon name="remove" size={20} /></button>
            <input type="text" inputmode="numeric" bind:value={divesValue} aria-label={t('maintenance.ruleSheet.value')} aria-invalid={!!problems.dives} />
            <button type="button" aria-label={t('maintenance.ruleSheet.more')} onclick={() => step('dives', 10)}><Icon name="plus" size={20} /></button>
            <span class="bc-rule-sheet--unit">{t('maintenance.ruleSheet.divesUnit')}</span>
          </div>
          {#if problems.dives}<p class="bc-rule-sheet--error" role="alert">{t('maintenance.ruleSheet.range')}</p>{/if}
        {/if}
      </div>

      <p class="bc-rule-sheet--both" class:bc-rule-sheet--error={!!problems.criteria} role={problems.criteria ? 'alert' : undefined}>
        {problems.criteria ? t('maintenance.ruleSheet.none') : t('maintenance.ruleSheet.both')}
      </p>

      <h3 class="bc-rule-sheet--group" id="od-rule-notify">{t('maintenance.ruleSheet.notify')}</h3>
      <div class="bc-rule-sheet--chips" role="radiogroup" aria-labelledby="od-rule-notify">
        {#each NOTIFY_CHOICES as n (n)}
          <button type="button" role="radio" aria-checked={notifyDays === n} class="bc-rule-sheet--chip" class:bc-rule-sheet--chip-on={notifyDays === n} onclick={() => (notifyDays = n)}>
            {#if notifyDays === n}<Icon name="check" size={18} />{/if}{t('maintenance.ruleSheet.days', { n })}
          </button>
        {/each}
      </div>

      <div class="bc-rule-sheet--row bc-rule-sheet--warn">
        <span class="bc-rule-sheet--texts">
          <span class="bc-rule-sheet--label" id="od-rule-warn">{t('maintenance.ruleSheet.warn')}</span>
          <span class="bc-rule-sheet--help">{t('maintenance.ruleSheet.warnHelp')}</span>
        </span>
        <label class="toggle"><input type="checkbox" role="switch" aria-labelledby="od-rule-warn" bind:checked={warn} /><span class="toggle-icon"></span></label>
      </div>
    </div>

    <div class="bc-rule-sheet--actions">
      {#if removable}
        <button type="button" class="bc-rule-sheet--remove" onclick={() => onremove?.()}>{t('maintenance.ruleSheet.remove')}</button>
      {/if}
      <span class="bc-rule-sheet--spacer"></span>
      <button type="button" class="bc-rule-sheet--text" onclick={onclose}>{t('maintenance.ruleSheet.cancel')}</button>
      <button type="button" class="bc-rule-sheet--main" disabled={!canSave} onclick={save}>{t('maintenance.ruleSheet.save')}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.sheet-modal.bc-rule-sheet) {
      --f7-sheet-bg-color: var(--bc-drawer);
      height: auto;
      max-height: 92%;
      border-radius: 28px 28px 0 0;
    }

    .bc-rule-sheet--content {
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      padding: 20px 0 calc(12px + var(--bc-safe-bottom));
    }

    .bc-rule-sheet--title {
      margin: 0 24px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .bc-rule-sheet--lead {
      margin: 4px 24px 12px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-rule-sheet--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0 16px;
    }

    .bc-rule-sheet--card {
      margin-bottom: 8px;
      padding: 12px 16px;
      border: var(--bc-outline-width) solid var(--bc-outline);
      border-radius: 20px;
      background: none;
    }

    .bc-rule-sheet--card-on {
      border-color: transparent;
      background: var(--bc-selected-container);
    }

    .bc-rule-sheet--row {
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-rule-sheet--icon {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-rule-sheet--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-rule-sheet--label {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .bc-rule-sheet--help {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-rule-sheet--stepper {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;

      button {
        flex: none;
        width: 40px;
        height: 40px;
        padding: 0;
        border: none;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bc-tonal);
        color: var(--bc-on-secondary-container);
      }

      input {
        flex: none;
        width: 64px;
        height: 40px;
        box-sizing: border-box;
        border: var(--bc-outline-width) solid var(--bc-outline);
        border-radius: 12px;
        background: var(--bc-surface);
        color: var(--bc-text);
        font: inherit;
        font-size: 18px;
        text-align: center;

        &[aria-invalid='true'] {
          border-color: var(--bc-alarm);
        }
      }
    }

    .bc-rule-sheet--unit {
      font-size: 16px;
    }

    .bc-rule-sheet--both,
    .bc-rule-sheet--error {
      margin: 4px 4px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    p.bc-rule-sheet--error {
      color: var(--bc-alarm);
    }

    .bc-rule-sheet--group {
      margin: 16px 4px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-rule-sheet--chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .bc-rule-sheet--chip {
      width: auto;
      height: 40px;
      padding: 0 16px;
      border: var(--bc-outline-width) solid var(--bc-outline);
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-rule-sheet--chip-on {
      border-color: transparent;
      background: var(--bc-selected-container);
    }

    .bc-rule-sheet--warn {
      margin: 12px 4px 0;
    }

    .bc-rule-sheet--actions {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px 0;
    }

    .bc-rule-sheet--spacer {
      flex: 1;
    }

    .bc-rule-sheet--text,
    .bc-rule-sheet--main,
    .bc-rule-sheet--remove {
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-rule-sheet--remove {
      color: var(--bc-menu-danger);
    }

    .bc-rule-sheet--main {
      padding: 0 20px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      &:disabled {
        opacity: 0.38;
      }
    }
  }
</style>
