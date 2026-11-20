<script>
  // @ts-check
  // « Signaler un problème » on a site of the shared map (docs/mockups/sites-commun-signaler-android.dc.html; task
  // 2026-11-19-315, point 4): five reasons, an optional free text, « Envoyer ». The report goes to the moderation of the
  // shared map, without the diver's name. For « Mauvaise position » the diver's own position of that site is sent when
  // the logbook has it (the administrator moves the site to the mean of the reports).
  import Md3Dialog from './Md3Dialog.svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import TextField from './TextField.svelte';
  import { t } from '../lib/i18n.js';
  import { REPORT_DETAILS_MAX, REPORT_REASONS } from '../lib/shared-sites.js';

  /**
   * @type {{
   *   name: string,
   *   onsend: (report: { reason: import('../lib/shared-sites.js').ReportReason, details: string }) => Promise<void>,
   *   oncancel: () => void,
   * }}
   */
  let { name, onsend, oncancel } = $props();

  let reason = $state(/** @type {import('../lib/shared-sites.js').ReportReason} */ ('wrong_position'));
  let details = $state('');
  let sending = $state(false);
  const group = `od-shared-report-${Math.random().toString(36).slice(2, 9)}`;
  const tooLong = $derived(details.length > REPORT_DETAILS_MAX);

  async function send() {
    if (sending || tooLong) return;
    sending = true;
    try {
      await onsend({ reason, details });
    } finally {
      sending = false;
    }
  }
</script>

<Md3Dialog class="od-shared-report" title={t('sharedSites.report.title')} text={t('sharedSites.report.text', { name })} {oncancel}>
  <div class="od-shared-report--reasons" role="radiogroup" aria-label={t('sharedSites.report.title')}>
    {#each REPORT_REASONS as r (r)}
      <ChoiceRow class="od-shared-report--reason" name={group} selected={reason === r} onselect={() => (reason = r)}>
        <span class="od-shared-report--label">
          {t(`sharedSites.report.reasons.${r}`)}
          {#if r === 'wrong_position'}<span class="od-shared-report--hint">{t('sharedSites.report.wrongPositionHint')}</span>{/if}
        </span>
      </ChoiceRow>
    {/each}
  </div>
  <div class="od-shared-report--details">
    <TextField
      label={t('sharedSites.report.details')}
      bind:value={details}
      multiline
      invalid={tooLong}
      supporting={tooLong ? t('sharedSites.report.tooLong', { n: REPORT_DETAILS_MAX }) : t('sharedSites.report.detailsExample')}
    />
  </div>
  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t('dialog.cancel')}</button>
    <button type="button" disabled={sending || tooLong} onclick={send}>{t('sharedSites.report.send')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer od.components {
    .od-shared-report--reasons {
      display: flex;
      flex-direction: column;
      padding: 0 12px;
    }
    :global(.od-shared-report--reason) {
      min-height: 48px;
      padding: 0 12px;
    }
    .od-shared-report--label {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      font-size: 16px;
    }
    .od-shared-report--hint {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
    .od-shared-report--details {
      margin-top: 8px;
      --od-field-margin: 24px;
    }
  }
</style>
