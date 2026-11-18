<script>
  // @ts-check
  // « Rappel d'entretien » (task 2026-11-18-274, docs/mockups-release/ent-regle-android.dc.html): a bottom sheet with
  // two criteria, each a card with a switch (« Après une durée »: a stepper in years or months; « Selon les
  // plongées »: a number of dives), « Me prévenir avant » 7, 30 or 60 days, « Avertir dans une plongée », then
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
   *   initial: { months: number|null, dives: number|null, notifyDays: 7|30|60, warnInDive: boolean },
   *   removable?: boolean,
   *   onclose: () => void,
   *   onsave: (rule: { months: number|null, dives: number|null, notifyDays: 7|30|60, warnInDive: boolean }) => void,
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
  /** @type {7|30|60} */
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

<Sheet class="od-rule-sheet" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={t('maintenance.ruleSheet.title')}>
  <div class="od-rule-sheet--content">
    <h2 class="od-rule-sheet--title">{t('maintenance.ruleSheet.title')}</h2>
    <p class="od-rule-sheet--lead">{t('maintenance.ruleSheet.lead', { name })}</p>

    <div class="od-rule-sheet--scroll">
      <div class="od-rule-sheet--card" class:od-rule-sheet--card-on={timeOn}>
        <div class="od-rule-sheet--row">
          <span class="od-rule-sheet--icon"><Icon name="calendar" size={22} /></span>
          <span class="od-rule-sheet--texts">
            <span class="od-rule-sheet--label" id="od-rule-time">{t('maintenance.ruleSheet.time')}</span>
            <span class="od-rule-sheet--help">{t('maintenance.ruleSheet.timeHelp')}</span>
          </span>
          <label class="toggle"><input type="checkbox" role="switch" aria-labelledby="od-rule-time" bind:checked={timeOn} /><span class="toggle-icon"></span></label>
        </div>
        {#if timeOn}
          <div class="od-rule-sheet--stepper">
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
          {#if problems.months}<p class="od-rule-sheet--error" role="alert">{t('maintenance.ruleSheet.range')}</p>{/if}
        {/if}
      </div>

      <div class="od-rule-sheet--card" class:od-rule-sheet--card-on={divesOn}>
        <div class="od-rule-sheet--row">
          <span class="od-rule-sheet--icon"><Icon name="logbook" size={22} /></span>
          <span class="od-rule-sheet--texts">
            <span class="od-rule-sheet--label" id="od-rule-dives">{t('maintenance.ruleSheet.dives')}</span>
            <span class="od-rule-sheet--help">{t('maintenance.ruleSheet.divesHelp')}</span>
          </span>
          <label class="toggle"><input type="checkbox" role="switch" aria-labelledby="od-rule-dives" bind:checked={divesOn} /><span class="toggle-icon"></span></label>
        </div>
        {#if divesOn}
          <div class="od-rule-sheet--stepper">
            <button type="button" aria-label={t('maintenance.ruleSheet.less')} onclick={() => step('dives', -10)}><Icon name="remove" size={20} /></button>
            <input type="text" inputmode="numeric" bind:value={divesValue} aria-label={t('maintenance.ruleSheet.value')} aria-invalid={!!problems.dives} />
            <button type="button" aria-label={t('maintenance.ruleSheet.more')} onclick={() => step('dives', 10)}><Icon name="plus" size={20} /></button>
            <span class="od-rule-sheet--unit">{t('maintenance.ruleSheet.divesUnit')}</span>
          </div>
          {#if problems.dives}<p class="od-rule-sheet--error" role="alert">{t('maintenance.ruleSheet.range')}</p>{/if}
        {/if}
      </div>

      <p class="od-rule-sheet--both" class:od-rule-sheet--error={!!problems.criteria} role={problems.criteria ? 'alert' : undefined}>
        {problems.criteria ? t('maintenance.ruleSheet.none') : t('maintenance.ruleSheet.both')}
      </p>

      <h3 class="od-rule-sheet--group" id="od-rule-notify">{t('maintenance.ruleSheet.notify')}</h3>
      <div class="od-rule-sheet--chips" role="radiogroup" aria-labelledby="od-rule-notify">
        {#each NOTIFY_CHOICES as n (n)}
          <button type="button" role="radio" aria-checked={notifyDays === n} class="od-rule-sheet--chip" class:od-rule-sheet--chip-on={notifyDays === n} onclick={() => (notifyDays = n)}>
            {#if notifyDays === n}<Icon name="check" size={18} />{/if}{t('maintenance.ruleSheet.days', { n })}
          </button>
        {/each}
      </div>

      <div class="od-rule-sheet--row od-rule-sheet--warn">
        <span class="od-rule-sheet--texts">
          <span class="od-rule-sheet--label" id="od-rule-warn">{t('maintenance.ruleSheet.warn')}</span>
          <span class="od-rule-sheet--help">{t('maintenance.ruleSheet.warnHelp')}</span>
        </span>
        <label class="toggle"><input type="checkbox" role="switch" aria-labelledby="od-rule-warn" bind:checked={warn} /><span class="toggle-icon"></span></label>
      </div>
    </div>

    <div class="od-rule-sheet--actions">
      {#if removable}
        <button type="button" class="od-rule-sheet--remove" onclick={() => onremove?.()}>{t('maintenance.ruleSheet.remove')}</button>
      {/if}
      <span class="od-rule-sheet--spacer"></span>
      <button type="button" class="od-rule-sheet--text" onclick={onclose}>{t('maintenance.ruleSheet.cancel')}</button>
      <button type="button" class="od-rule-sheet--main" disabled={!canSave} onclick={save}>{t('maintenance.ruleSheet.save')}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.sheet-modal.od-rule-sheet) {
      --f7-sheet-bg-color: var(--od-drawer);
      height: auto;
      max-height: 92%;
      border-radius: 28px 28px 0 0;
    }

    .od-rule-sheet--content {
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      padding: 20px 0 calc(12px + var(--od-safe-bottom));
    }

    .od-rule-sheet--title {
      margin: 0 24px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .od-rule-sheet--lead {
      margin: 4px 24px 12px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-rule-sheet--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0 16px;
    }

    .od-rule-sheet--card {
      margin-bottom: 8px;
      padding: 12px 16px;
      border: var(--od-outline-width) solid var(--od-outline);
      border-radius: 20px;
      background: none;
    }

    .od-rule-sheet--card-on {
      border-color: transparent;
      background: var(--od-selected-container);
    }

    .od-rule-sheet--row {
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-rule-sheet--icon {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    .od-rule-sheet--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-rule-sheet--label {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .od-rule-sheet--help {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-rule-sheet--stepper {
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
        background: var(--od-tonal);
        color: var(--od-on-secondary-container);
      }

      input {
        flex: none;
        width: 64px;
        height: 40px;
        box-sizing: border-box;
        border: var(--od-outline-width) solid var(--od-outline);
        border-radius: 12px;
        background: var(--od-surface);
        color: var(--od-text);
        font: inherit;
        font-size: 18px;
        text-align: center;
      }

      input[aria-invalid='true'] {
        border-color: var(--od-alarm);
      }
    }

    .od-rule-sheet--unit {
      font-size: 16px;
    }

    .od-rule-sheet--both,
    .od-rule-sheet--error {
      margin: 4px 4px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    p.od-rule-sheet--error {
      color: var(--od-alarm);
    }

    .od-rule-sheet--group {
      margin: 16px 4px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-rule-sheet--chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .od-rule-sheet--chip {
      width: auto;
      height: 40px;
      padding: 0 16px;
      border: var(--od-outline-width) solid var(--od-outline);
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-rule-sheet--chip-on {
      border-color: transparent;
      background: var(--od-selected-container);
    }

    .od-rule-sheet--warn {
      margin: 12px 4px 0;
    }

    .od-rule-sheet--actions {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px 0;
    }

    .od-rule-sheet--spacer {
      flex: 1;
    }

    .od-rule-sheet--text,
    .od-rule-sheet--main,
    .od-rule-sheet--remove {
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-rule-sheet--remove {
      color: var(--od-menu-danger);
    }

    .od-rule-sheet--main {
      padding: 0 20px;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
    }

    .od-rule-sheet--main:disabled {
      opacity: 0.38;
    }
  }
</style>
