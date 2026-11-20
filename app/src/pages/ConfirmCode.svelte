<script>
  // @ts-check
  // New account: the confirmation code mailed by the server, in six boxes (CodeField,
  // task 2026-11-16-232; docs/mockups/*creer-compte-code*.dc.html; spec, section 4, "Sign in and new account"), as
  // the PIN screen of Subsurface-mobile: cloud_verify_pin. "Renvoyer le
  // code" sits right under the field (outlined on Android, tinted grey on
  // iOS). From first launch, then "Reprendre votre carnet ?"; from Account,
  // the logbook of this device becomes the account's first logbook.
  import { OpenDivesCore } from 'opendives-core';
  import CodeField from '../components/CodeField.svelte';
  import EditorialPage from '../components/EditorialPage.svelte';
  import Icon from '../components/Icon.svelte';
  import { accountFlow, announceFirstLaunch, errorCode, finishAccount, phoneFirstLaunch, showFailure, toast } from '../lib/account.js';
  import { accountReady, deviceDiveCount } from '../lib/logbook.svelte.js';
  import { codeComplete } from '../lib/code-input.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean, email?: string }} */
  let { f7router, welcome = false, email = '' } = $props();

  let code = $state('');
  let busy = $state(false);
  let codeError = $state('');
  // Alpha first launch on a phone: the new account's empty logbook opens straight after the code, with a snackbar.
  const look = $derived(welcome && phoneFirstLaunch());
  let verified = false;

  async function confirm() {
    busy = true;
    codeError = '';
    try {
      if (!verified) {
        const result = await OpenDivesCore.verifyPin({ pin: code });
        if (result.status !== 'verified') {
          codeError = t('confirmCode.wrong');
          return;
        }
        verified = true;
      }
      accountFlow.confirmedEmail = email;
      if (look) {
        // The dives logged on this device without an account, if any, are the first of the new logbook.
        const onDevice = await deviceDiveCount();
        await OpenDivesCore.createLog({ source: onDevice ? 'device' : 'empty' });
        accountFlow.confirmedEmail = '';
        await accountReady();
        announceFirstLaunch('created');
      } else if (welcome) {
        f7router.navigate('/welcome/import');
      } else {
        // From Account: the dives of this device are sent to the new account.
        await OpenDivesCore.createLog({ source: 'device' });
        finishAccount(f7router, false);
      }
    } catch (e) {
      const code = errorCode(e);
      if (code === 'INVALID_PIN') codeError = t('confirmCode.wrong');
      else showFailure(code);
    } finally {
      busy = false;
    }
  }

  async function resend() {
    busy = true;
    try {
      await OpenDivesCore.resendCode();
      toast(t('confirmCode.resent', { email }));
    } catch (e) {
      showFailure(errorCode(e));
    } finally {
      busy = false;
    }
  }
</script>

<EditorialPage class="bc-confirm-code"
  helpLink={welcome}
  firstLaunch={welcome}
  title={t('createAccount.title')}
  step={t('createAccount.step2')}
  heading={t('confirmCode.heading')}
  intro={t('confirmCode.intro', { email })}
  action={t('confirmCode.submit')}
  busyLabel={t('confirmCode.busy')}
  {busy}
  actionDisabled={!codeComplete(code)}
  onaction={confirm}
>
  <div class="bc-confirm-code--fields">
    <CodeField
      label={t('confirmCode.code')}
      accessibleLabel={t('confirmCode.codeLabel')}
      bind:value={code}
      error={codeError}
      disabled={busy}
      oninput={() => (codeError = '')}
      onsubmit={confirm}
    />
    <div class="bc-confirm-code--resend">
      <button type="button" disabled={busy} onclick={resend}><Icon name="refresh" size={18} weight={2} />{t('confirmCode.resend')}</button>
    </div>
  </div>
</EditorialPage>

<style>
  @layer od.components {
    .bc-confirm-code--fields {
      margin: 6px 0 0;

      :global(.bc-editorial-page--first-launch) & {
        margin: 8px 0 0;
      }

      /* Beside the tablet's panel (task 2026-11-16-239): the group of boxes is centred in the column, and the
         label, the error and « Renvoyer le code » start at the left edge of the first box. */
      :global(.bc-editorial-page--panelled) & {
        /* Six boxes of 48 dp and five gaps of 8 dp. */
        width: 328px;
        max-width: 100%;
        margin: 8px auto 0;
      }

      :global(.ios) & {
        margin: 0;
      }
    }

    /* MD3 outlined button with a leading icon (18 dp); iOS: a grey tinted button. */
    .bc-confirm-code--resend {
      margin: 8px var(--bc-field-margin, 0) 0;

      button {
        width: auto;
        height: 40px;
        padding: 0 24px 0 16px;
        border: var(--bc-outline-width) solid var(--bc-text-2);
        border-radius: 20px;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.1px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;

        &:disabled {
          opacity: 0.38;
        }
      }

      /* Alpha first launch on a phone (the mock-ups): a link under the boxes, a 48 dp target. */
      :global(.bc-editorial-page--first-launch) & {
        margin: 4px 0 -12px;

        button {
          height: auto;
          min-height: 48px;
          padding: 0 4px;
          border: none;
          border-radius: 8px;
          color: var(--bc-code-active);
          text-decoration: underline;
          text-underline-offset: 2px;
          font-weight: 400;
          letter-spacing: 0;
          line-height: 19px;

          :global(svg) {
            display: none;
          }
        }
      }

      :global(.ios) & {
        margin: 12px 16px 0;

        button {
          height: 44px;
          padding: 0 16px;
          border: none;
          border-radius: 12px;
          background: var(--bc-tint);
          color: var(--bc-on-tint);
          font-size: 17px;
          font-weight: 400;
          letter-spacing: 0;
        }
      }
    }
  }
</style>
