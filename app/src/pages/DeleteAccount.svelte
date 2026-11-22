<script>
  // @ts-check
  // Delete the cloud account: a three-step wizard (task 2026-11-14-167;
  // docs/mockups/compte-suppression-etape{1,2,3}-android.dc.html; spec, section 4,
  // "Delete the account"). A rare, irreversible action: each step is one real decision,
  // and the last button cannot be reached by momentum (an empty password field first).
  // Unsent changes are synced first; the account is reported deleted only if the server
  // confirms it. The request is never sent by automated tests.
  import { tick } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import { logbook, accountDeleted, syncNow } from '../lib/logbook.svelte.js';
  import { layout, deviceKind } from '../lib/layout.svelte.js';
  import { deviceSuffix } from '../lib/first-launch.js';
  import { BenthicCore } from 'benthic-core';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  /** The step shown, 1 to 3. Nothing is remembered: the next opening starts at step 1. */
  let step = $state(1);
  let keepDives = $state(true);
  /** A copy of the logbook was exported at step 2 (the export itself does not exist yet). */
  let exported = $state(false);
  let password = $state('');
  let busy = $state(false);
  /** @type {HTMLElement|undefined} */
  let wizard = $state();
  const offline = $derived(logbook.sync === 'offline');
  const dives = $derived(logbook.dives.length);
  const phone = $derived(layout.phone);
  /** « Phone », « Tablet » or « Desktop »: the device the texts name. */
  const suffix = $derived(deviceSuffix(deviceKind()));
  const titles = ['deleteAccount.stepErase', 'deleteAccount.stepDives', 'deleteAccount.stepConfirm'];

  /** "Export a copy of the logbook" (.ssrf): file export does not exist yet. */
  function exportCopy() {
    showSnackbar(t('account.notAvailable'));
  }

  async function next() {
    step += 1;
    if (step !== 3) return;
    // Step 3: the password field arrives empty and focused, the keyboard open.
    password = '';
    await tick();
    /** @type {HTMLInputElement|null|undefined} */ (wizard?.querySelector('.bc-text-field input'))?.focus();
  }

  /** The back arrow and the system Back: one step back; from step 1, the Account page. */
  function back() {
    if (step > 1) step -= 1;
    else f7router.back();
  }

  // The system Back (lib/back-button.js) sends bc-cancel to the wizard from step 2.
  $effect(() => {
    const node = wizard;
    if (!node) return;
    node.addEventListener('bc-cancel', back);
    return () => node.removeEventListener('bc-cancel', back);
  });

  /** « Annuler », at any step: the Account page, nothing erased. */
  const cancel = () => f7router.back();

  async function deleteAccount() {
    if (busy || offline || !password) return;
    busy = true;
    try {
      // Unsent changes first, so that the copy kept is complete.
      if (logbook.pending > 0) await syncNow();
      if (logbook.pending > 0) {
        showSnackbar(t('deleteAccount.notDeleted'));
        return;
      }
      const result = await BenthicCore.deleteAccount({ password, keepDives });
      // The server's replies are not documented: kept in the log for the report.
      console.info('Delete account: HTTP', result.status, JSON.stringify(result.reply));
      if (!result.deleted) {
        showSnackbar(t('deleteAccount.notDeleted'));
        return;
      }
      await accountDeleted({ keepDives });
      showSnackbar(t('deleteAccount.deleted'));
      f7router.back();
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Delete account', code);
      showSnackbar(code.startsWith('WRONG_PASSWORD') ? t('deleteAccount.wrongPassword') : t('deleteAccount.notDeleted'));
    } finally {
      password = '';
      busy = false;
    }
  }
</script>

<Page class="bc-delete-wizard" noSwipeback={step > 1}>
  <Navbar title={t('account.delete')}>
    {#snippet left()}
      <Link iconOnly onClick={back}>
        <i class="icon icon-back"></i>
        <span class="bc-sr-only">{t(step > 1 ? 'deleteAccount.backStep' : 'deleteAccount.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <!-- data-step: the system Back goes one step back (lib/back-button.js, bc-cancel). -->
  <div class="bc-delete-wizard--body" bind:this={wizard} data-step={step}>
    <div class="bc-delete-wizard--steps" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow={step} aria-label={t('deleteAccount.step', { n: step })}>
      <span class="bc-delete-wizard--segments">
        {#each [1, 2, 3] as i (i)}
          <span class="bc-delete-wizard--segment" class:bc-delete-wizard--done={i <= step}></span>
        {/each}
      </span>
      <span class="bc-delete-wizard--step-title">{t('deleteAccount.stepTitle', { n: step, title: t(titles[step - 1]) })}</span>
    </div>

    {#if step === 1}
      <div class="bc-delete-wizard--warning" role="note">
        <Icon name="warning" size={24} />
        <span class="bc-delete-wizard--texts">
          <span class="bc-delete-wizard--warning-title">{t('deleteAccount.definitive')}</span>
          <span>{t('deleteAccount.noUndo')}</span>
        </span>
      </div>
      <div class="bc-delete-wizard--card">
        <div class="bc-delete-wizard--row bc-delete-wizard--alarm">
          <Icon name="delete" size={24} />
          <span class="bc-delete-wizard--texts">
            <span class="bc-delete-wizard--label">{t('deleteAccount.eraseAccount', { email: logbook.email })}</span>
            <span class="bc-delete-wizard--supporting">{t('deleteAccount.eraseAccountText')}</span>
          </span>
        </div>
        <div class="bc-delete-wizard--row bc-delete-wizard--alarm">
          <Icon name="cloud" size={24} />
          <span class="bc-delete-wizard--texts">
            <span class="bc-delete-wizard--label">{t('deleteAccount.eraseDives', { n: dives })}</span>
            <span class="bc-delete-wizard--supporting">{t('deleteAccount.eraseDivesText', { n: dives })}</span>
          </span>
        </div>
        <div class="bc-delete-wizard--row">
          <Icon name="desktop" size={24} />
          <span class="bc-delete-wizard--texts">
            <span class="bc-delete-wizard--label">{t('deleteAccount.eraseElsewhere')}</span>
            <span class="bc-delete-wizard--supporting">{t('deleteAccount.eraseElsewhereText')}</span>
          </span>
        </div>
      </div>
      <p class="bc-delete-wizard--note">{t(`deleteAccount.next${suffix}`)}</p>
    {:else if step === 2}
      <h2 class="bc-delete-wizard--question">{t(`deleteAccount.question${suffix}`)}</h2>
      <div class="bc-delete-wizard--card">
        <label class="bc-delete-wizard--keep">
          <span class="checkbox"><input type="checkbox" bind:checked={keepDives} /><i class="icon-checkbox"></i></span>
          <span class="bc-delete-wizard--texts">
            <span class="bc-delete-wizard--label">{t('deleteAccount.keep')}</span>
            <span class="bc-delete-wizard--supporting">{t(`deleteAccount.keepText${suffix === 'Phone' ? '' : suffix}`)}</span>
          </span>
        </label>
        <div class="bc-delete-wizard--export">
          <button type="button" class="bc-delete-wizard--outlined" onclick={exportCopy}><Icon name="download" size={18} />{t('deleteAccount.export')}</button>
          <span class="bc-delete-wizard--hint">{t('deleteAccount.exportText')}</span>
        </div>
      </div>
      {#if !keepDives && !exported}
        <div class="bc-delete-wizard--nothing-kept" role="alert">
          <Icon name="error" size={20} />
          <span><strong>{t('deleteAccount.nothingKeptLead')}</strong>{t('deleteAccount.nothingKeptRest')}</span>
        </div>
      {/if}
    {:else}
      <div class="bc-delete-wizard--card bc-delete-wizard--summary">
        <span class="bc-delete-wizard--summary-title">{t('deleteAccount.summary')}</span>
        <div class="bc-delete-wizard--row bc-delete-wizard--alarm">
          <Icon name="delete" size={24} />
          <span class="bc-delete-wizard--texts">
            <span class="bc-delete-wizard--label">{t('deleteAccount.erased')}</span>
            <span class="bc-delete-wizard--supporting">{t('deleteAccount.erasedText', { email: logbook.email, n: dives })}</span>
          </span>
        </div>
        <div class="bc-delete-wizard--row">
          <Icon name="device" size={24} />
          <span class="bc-delete-wizard--texts">
            {#if keepDives}
              <span class="bc-delete-wizard--label">{t(`deleteAccount.kept${suffix}`)}</span>
              <span class="bc-delete-wizard--supporting">{t('deleteAccount.keptText', { n: dives })}</span>
            {:else}
              <span class="bc-delete-wizard--label">{t(`deleteAccount.keptNothing${suffix}`)}</span>
            {/if}
          </span>
        </div>
      </div>
      <TextField
        label={t('deleteAccount.password')}
        type="password"
        autocomplete="current-password"
        bind:value={password}
        supporting={t('deleteAccount.passwordText')}
      />
      <p class="bc-delete-wizard--note">{t('deleteAccount.note')}</p>
    {/if}

    <div class="bc-delete-wizard--actions">
      {#if step < 3}
        <button type="button" class="bc-delete-wizard--continue" onclick={next}>{t('deleteAccount.continue')}<Icon name="arrowRight" size={18} /></button>
      {:else}
        <button type="button" class="bc-delete-wizard--danger" disabled={busy || offline || !password} onclick={deleteAccount}>
          {#if !offline}<Icon name="delete" size={18} />{/if}
          {offline ? t('deleteAccount.connectionNeeded') : t('deleteAccount.confirm')}
        </button>
      {/if}
      <button type="button" class="bc-delete-wizard--cancel" onclick={cancel}>{t('signOut.cancel')}</button>
    </div>
  </div>
</Page>

<style>
  @layer bc.components {
    /* The steps fill the page; the actions sit at its bottom. */
    .bc-delete-wizard--body {
      box-sizing: border-box;
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    .bc-delete-wizard--steps {
      margin: 4px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-delete-wizard--segments {
      display: flex;
      gap: 4px;
    }

    .bc-delete-wizard--segment {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: var(--bc-separator);

      &.bc-delete-wizard--done {
        background: var(--bc-secondary);
      }
    }

    .bc-delete-wizard--step-title {
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }

    .bc-delete-wizard--warning {
      margin: 20px 16px 0;
      padding: 16px;
      border-radius: 16px;
      border: 1.5px solid var(--bc-alarm);
      display: flex;
      gap: 12px;
      align-items: flex-start;
      font-size: 14px;
      line-height: 20px;

      > :global(.bc-icon) {
        flex: none;
        color: var(--bc-alarm);
      }

      .bc-delete-wizard--texts {
        gap: 6px;
      }
    }

    .bc-delete-wizard--warning-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--bc-alarm);
    }

    .bc-delete-wizard--card {
      margin: 16px 16px 0;
      border-radius: 16px;
      background: var(--bc-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .bc-delete-wizard--row {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      padding: 12px 16px;

      > :global(.bc-icon) {
        flex: none;
      }
    }

    /* The rows of step 1: a divider from the text's start. */
    .bc-delete-wizard--card > .bc-delete-wizard--row + .bc-delete-wizard--row {
      border-top: 1px solid var(--bc-row-divider);
      margin-left: 56px;
      padding-left: 0;

      > :global(.bc-icon) {
        margin-left: -40px;
      }
    }

    .bc-delete-wizard--alarm > :global(.bc-icon) {
      color: var(--bc-alarm);
    }

    .bc-delete-wizard--texts {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-delete-wizard--label {
      font-size: 16px;
      overflow-wrap: anywhere;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .bc-delete-wizard--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      overflow-wrap: anywhere;
    }

    .bc-delete-wizard--note {
      margin: 16px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-delete-wizard--question {
      margin: 24px 16px 0;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .bc-delete-wizard--keep {
      padding: 16px;
      display: flex;
      gap: 16px;
      align-items: flex-start;
      border-bottom: 1px solid var(--bc-row-divider);

      .checkbox {
        flex: none;
        margin-top: 2px;
      }
    }

    .bc-delete-wizard--export {
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .bc-delete-wizard--outlined {
      width: auto;
      height: 40px;
      padding: 0 20px 0 16px;
      border: var(--bc-outline-width) solid var(--bc-text-2);
      border-radius: 20px;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bc-delete-wizard--hint {
      padding-left: 4px;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }

    /* Shown only when the box is unchecked and nothing was exported. */
    .bc-delete-wizard--nothing-kept {
      margin: 16px 16px 0;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px dashed var(--bc-alarm-on-field);
      color: var(--bc-alarm-on-field);
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      line-height: 18px;

      > :global(.bc-icon) {
        flex: none;
      }
    }

    .bc-delete-wizard--summary {
      margin-top: 24px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;

      .bc-delete-wizard--row {
        padding: 0;
      }
      & > .bc-delete-wizard--row + .bc-delete-wizard--row {
        border-top: none;
        margin-left: 0;

        > :global(.bc-icon) {
          margin-left: 0;
      }
      }
    }

    .bc-delete-wizard--summary-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-delete-wizard--summary + :global(.bc-text-field) {
      margin-top: 24px;
    }

    .bc-delete-wizard--actions {
      margin: auto 16px 32px;
      padding-top: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;

      button {
        width: 100%;
        height: 40px;
        padding: 0 24px;
        border: none;
        border-radius: 20px;
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.1px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .bc-delete-wizard--continue {
        background: var(--bc-action);
        color: var(--bc-on-action);
      }

      /* 48 dp, so that it is not where « Continuer » was; MD3 disabled until a password is typed. */
      .bc-delete-wizard--danger {
        height: 48px;
        border-radius: 24px;
        background: var(--bc-alarm);
        color: var(--bc-on-action);

        &:disabled {
          background: color-mix(in srgb, var(--bc-text) 12%, transparent);
          color: color-mix(in srgb, var(--bc-text) 38%, transparent);
        }
      }

      .bc-delete-wizard--cancel {
        background: none;
        color: var(--bc-text);
      }
    }
  }
</style>
