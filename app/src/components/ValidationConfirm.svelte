<script>
  // @ts-check
  // « Confirmer la plongée » (docs/mockups/validation-confirmer-android.dc.html; inbox task 2026-11-19-309, point 2): what a
  // buddy or an instructor sees after scanning the code of a dive validation. The summary the code carries, then who
  // confirms (name, role, instructor number), « Annuler » and « Je confirme ». The identity is the diver's profile when it
  // holds one; until then it is what he confirmed last, and it can be corrected here. Nothing is added to his logbook.
  import { Popup, Page, Navbar, Link } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import TextField from './TextField.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDepth, formatDateTime, formatMinutes } from '../lib/format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import { signerProblems } from '../lib/validation.js';
  import { closeConfirmation, confirmation, submitConfirmation } from '../lib/validation.svelte.js';

  const prefs = $derived(logbook.prefs);
  const many = $derived(confirmation.summary.dives.length > 1);
  const problems = $derived(signerProblems(confirmation));
  const valid = $derived(!problems.name && !problems.role);
  const roleLine = $derived(
    confirmation.role === 'instructor' && confirmation.instructorLine ? t('validation.confirmAsInstructor', { number: confirmation.instructorLine }) : t('validation.confirmAsBuddy'),
  );

  async function confirm() {
    if (!valid) return;
    const how = await submitConfirmation();
    if (!how) return;
    const saved = confirmation.savedToProfile ? ` ${t('validation.savedToProfile')}` : '';
    showSnackbar(t(how === 'sent' ? (many ? 'validation.confirmedMany' : 'validation.confirmed') : 'validation.confirmQueued') + saved);
  }
</script>

{#if confirmation.open}
  <Popup opened onPopupClosed={closeConfirmation} class="od-validation-confirm">
    <Page>
      <Navbar title={t(many ? 'validation.confirmTitleMany' : 'validation.confirmTitle')}>
        {#snippet left()}
          <Link popupClose iconOnly>
            <Icon name="close" /><span class="od-sr-only">{t('qr.close')}</span>
          </Link>
        {/snippet}
      </Navbar>

      <div class="od-validation-confirm--card">
        {#each confirmation.summary.dives as dive}
          <div class="od-validation-confirm--dive">
            <p class="od-validation-confirm--date">{formatDateTime(dive.date)}</p>
            <p class="od-validation-confirm--site">{dive.site || t('qr.noSite')}</p>
            <p class="od-validation-confirm--figures">
              {[dive.maxDepthMm ? t('validation.deepest', { depth: formatDepth(dive.maxDepthMm, prefs) }) : '', dive.durationSeconds ? t('validation.underwater', { time: formatMinutes(dive.durationSeconds) }) : ''].filter(Boolean).join(' · ')}
            </p>
          </div>
        {/each}
      </div>

      <p class="od-validation-confirm--text">{t(many ? 'validation.confirmTextMany' : 'validation.confirmText')}</p>

      <div class="od-validation-confirm--fields">
        <TextField label={t('validation.yourName')} bind:value={confirmation.name} supporting={t('validation.yourNameHint')} autocomplete="name" />
        <p class="od-validation-confirm--role">{roleLine}</p>
      </div>
      <p class="od-validation-confirm--note">{t('validation.confirmNote')}</p>

      {#if confirmation.error}
        <p class="od-validation-confirm--error" role="alert">{t(`validation.confirmError.${confirmation.error}`)}</p>
      {/if}

      <div class="od-validation-confirm--actions">
        <Link popupClose class="od-validation-confirm--cancel">{t('qr.cancel')}</Link>
        <button type="button" class="od-validation-confirm--ok" disabled={confirmation.working || !valid} onclick={confirm}>{t('validation.confirmButton')}</button>
      </div>
    </Page>
  </Popup>
{/if}

<style>
  @layer od.components {
    :global(.od-validation-confirm .page) {
      background: var(--od-background);
    }

    .od-validation-confirm--card {
      margin: 8px 16px 0;
      padding: 16px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-validation-confirm--card p {
      margin: 0;
    }

    .od-validation-confirm--date,
    .od-validation-confirm--figures {
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-validation-confirm--site {
      margin-top: 2px;
      font-size: 18px;
      font-weight: 600;
      color: var(--od-text);
    }

    .od-validation-confirm--text,
    .od-validation-confirm--note {
      margin: 16px 20px 0;
      font-size: 15px;
      line-height: 22px;
      color: var(--od-text);
    }

    .od-validation-confirm--note {
      color: var(--od-text-2);
    }

    .od-validation-confirm--fields {
      margin-top: 8px;
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-validation-confirm--role {
      margin: 0 4px;
      font-size: 15px;
      line-height: 22px;
      color: var(--od-text);
    }

    .od-validation-confirm--error {
      margin: 16px 20px 0;
      font-size: 15px;
      color: var(--od-alarm);
    }

    .od-validation-confirm--actions {
      margin: 24px 16px calc(24px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    :global(.od-validation-confirm--cancel),
    .od-validation-confirm--ok {
      height: 48px;
      padding: 0 24px;
      border-radius: 24px;
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    :global(.od-validation-confirm--cancel) {
      border: var(--od-outline-width) solid var(--od-outline);
      color: var(--od-text);
    }

    .od-validation-confirm--ok {
      border: none;
      background: var(--od-action);
      color: var(--od-on-action);
    }

    .od-validation-confirm--ok:disabled {
      opacity: 0.5;
    }
  }

  .od-validation-confirm--ok {
    width: auto;
  }
</style>
