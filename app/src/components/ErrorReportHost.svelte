<script>
  // @ts-check
  // Error reports (task #102): after an error or a crash the app shows the report as it will be sent and asks « Envoyer » or
  // « Ne pas envoyer ». Nothing is sent before that tap and there is no setting for it. A bottom sheet on the phones (Android:
  // Material 3 Expressive, iPhone: stacked buttons), a centred sheet on the tablets and the desktop.
  import { Sheet } from 'framework7-svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
  import { reportText } from '../lib/error-report.js';
  import { errorReport, sendCurrent, declineCurrent } from '../lib/error-reports.svelte.js';

  /** What the sheet shows: it stays while the sheet closes. @type {import('../lib/error-report.js').ErrorReport|null} */
  let shown = $state(null);
  $effect(() => {
    if (errorReport.report) shown = errorReport.report;
  });
  const body = $derived(shown ? reportText(shown) : '');
  const offline = $derived(errorReport.status === 'offline');
  const sending = $derived(errorReport.status === 'sending');
</script>

<Sheet
  opened={errorReport.open}
  backdrop
  closeByBackdropClick={false}
  class="bc-error-report bc-error-report--sheet"
  style="height: auto"
  onSheetClosed={() => errorReport.open && declineCurrent()}>
  <div class="bc-error-report--panel {ios ? 'bc-error-report--ios' : 'bc-error-report--material'}" role="alertdialog" aria-labelledby="od-error-report-title" aria-describedby="od-error-report-text">
    <div class="bc-error-report--handle" aria-hidden="true"></div>
    <h2 id="od-error-report-title" class="bc-error-report--title">{t(shown?.kind === 'native' ? 'errorReport.titleCrash' : 'errorReport.title')}</h2>
    <p id="od-error-report-text" class="bc-error-report--text">{t('errorReport.text')}</p>
    <pre class="bc-error-report--contents" tabindex="0" aria-label={t('errorReport.contents')}>{body}</pre>
    {#if offline}<p class="bc-error-report--offline" role="status">{t('errorReport.offline')}</p>{/if}
    <div class="bc-error-report--actions">
      <button type="button" class="bc-error-report--secondary" onclick={declineCurrent}>{t(offline ? 'errorReport.later' : 'errorReport.decline')}</button>
      <button type="button" class="bc-error-report--primary" disabled={sending} onclick={sendCurrent}>{t(sending ? 'errorReport.sending' : 'errorReport.send')}</button>
    </div>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.bc-error-report--sheet) {
      border-radius: 28px 28px 0 0;
      background: var(--bc-dialog);
      overflow: hidden;
    }

    @media (min-width: 768px) {
      :global(.bc-error-report--sheet) {
        left: calc(50% - 280px);
        width: 560px;
      }
    }

    .bc-error-report--panel {
      padding: 0 24px calc(24px + var(--f7-safe-area-bottom, 0px));
    }

    .bc-error-report--handle {
      width: 32px;
      height: 4px;
      margin: 22px auto 20px;
      border-radius: 2px;
      background: var(--bc-text-2);
    }

    .bc-error-report--title {
      margin: 0 0 8px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
      color: var(--bc-text);
    }

    .bc-error-report--text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--bc-text-2);
    }

    .bc-error-report--contents {
      max-height: 32vh;
      margin: 16px 0 0;
      padding: 12px;
      overflow: auto;
      border-radius: 12px;
      background: var(--bc-field-rest);
      color: var(--bc-text);
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 12px;
      line-height: 16px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      user-select: text;
    }

    .bc-error-report--offline {
      margin: 12px 0 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text);
    }

    .bc-error-report--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 24px;

      button {
        width: auto;
        height: 40px;
        border: none;
        border-radius: 20px;
        font: inherit;
        font-size: 14px;
        letter-spacing: 0.1px;
        cursor: pointer;
      }

      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
    }

    .bc-error-report--secondary {
      padding: 0 12px;
      background: transparent;
      color: var(--bc-text);
      font-weight: 500;
    }

    .bc-error-report--primary {
      padding: 0 24px;
      background: var(--bc-tonal);
      color: var(--bc-on-secondary-container);
      font-weight: 600;
    }

    /* iPhone and iPad: the two choices stacked, full width, send first. */
    .bc-error-report--ios .bc-error-report--actions {
      flex-direction: column-reverse;
      gap: 4px;

      button {
        width: 100%;
        height: 44px;
        border-radius: 12px;
        font-size: 17px;
      }
    }

    .bc-error-report--ios .bc-error-report--title {
      font-size: 20px;
      font-weight: 600;
      text-align: center;
    }

    .bc-error-report--ios .bc-error-report--text {
      text-align: center;
    }
  }
</style>
