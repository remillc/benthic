<script>
  // @ts-check
  // New Subsurface cloud account, step 1 of 2 (docs/mockups/
  // compte-creation-*.dc.html; spec, section 4, "Sign in and new account").
  // The email and password are checked with Subsurface's own rules, then
  // cloud_create_account: the server mails a code (next screen,
  // ConfirmCode). An email that already has an account with this password
  // signs in instead. Creating an account writes to the cloud: refused, for
  // now, except on the test account (write lock).
  import { OpenDivesCore } from 'opendives-core';
  import AccountField from '../components/AccountField.svelte';
  import EditorialPage from '../components/EditorialPage.svelte';
  import { notAvailableYet } from '../lib/not-available.js';
  import { accountFlow, errorCode, finishAccount, phoneFirstLaunch, showFailure, validEmail, validPassword } from '../lib/account.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean }} */
  let { f7router, welcome = false } = $props();
  const base = $derived(welcome ? '/welcome' : '/account');
  // Alpha first launch on a phone: the outlined fields and the texts of the mock-ups (task 2026-11-16-233).
  const look = $derived(welcome && phoneFirstLaunch());
  const invalidEmail = () => t(look ? 'firstLaunch.signIn.invalidEmail' : 'createAccount.invalidEmail');
  const passwordRule = () => t(look ? 'firstLaunch.create.passwordText' : 'createAccount.passwordText');

  // Back from step 2 ("Précédent"): the account exists, its email is shown
  // and "Continuer" goes to step 2 again without creating anything.
  const confirmed = accountFlow.confirmedEmail;
  let email = $state(confirmed);
  let password = $state('');
  let busy = $state(false);
  let emailError = $state('');
  let passwordError = $state('');
  // Checked as the diver types (lib/account-validation.js): the rule under the field turns into the error.
  const emailLive = liveError(() => email, (text) => (validEmail(text.trim()) ? '' : invalidEmail()));
  const passwordLive = liveError(() => password, (text) => (validPassword(text) ? '' : passwordRule()));
  const emailShown = $derived(emailError || emailLive.error);
  const passwordShown = $derived(passwordError || passwordLive.error);
  // An answer of the server stays until the field it is about changes.
  $effect(() => {
    email;
    emailError = '';
  });
  $effect(() => {
    password;
    passwordError = '';
  });

  async function create() {
    if (confirmed) {
      f7router.navigate(`${base}/import`);
      return;
    }
    emailError = validEmail(email.trim()) ? '' : invalidEmail();
    passwordError = validPassword(password) ? '' : passwordRule();
    if (emailError || passwordError) return;
    busy = true;
    try {
      const result = await OpenDivesCore.createAccount({ email: email.trim(), password });
      if (result.status === 'need_pin') {
        password = '';
        f7router.navigate(`${base}/code`, { props: { email: result.email } });
      } else if (result.status === 'verified') {
        // The account exists with this password: sign in to it.
        const signedIn = await OpenDivesCore.signIn({ email: email.trim(), password });
        password = '';
        if (signedIn.exists && look) f7router.navigate('/welcome/downloading', { props: { email: email.trim() } });
        else if (signedIn.exists) finishAccount(f7router, welcome, { offerDeviceDives: true });
        else f7router.navigate(`${base}/import`, { props: { signedIn: true } });
      } else {
        passwordError = t('signIn.incorrect');
      }
    } catch (e) {
      const code = errorCode(e);
      if (code === 'WRITE_LOCKED') notAvailableYet(t('notAvailable.createLocked'));
      else if (code === 'INVALID_CREDENTIALS') passwordError = passwordRule();
      else showFailure(code);
    } finally {
      busy = false;
    }
  }
</script>

<EditorialPage class="od-create-account"
  helpLink={welcome}
  firstLaunch={welcome}
  title={t('createAccount.title')}
  step={t('createAccount.step1')}
  heading={confirmed ? t('createAccount.createdHeading') : t('createAccount.heading')}
  intro={confirmed ? t('createAccount.confirmedText') : t(look ? 'firstLaunch.create.intro' : 'createAccount.intro')}
  action={confirmed ? t('bringLogbook.continue') : t('createAccount.submit')}
  busyLabel={t('createAccount.busy')}
  {busy}
  actionDisabled={!confirmed && (!email.trim() || !password)}
  onaction={create}
>
  <div class="od-create-account--fields">
    <AccountField
      label={t(look ? 'firstLaunch.signIn.email' : 'createAccount.email')}
      rowLabel={t('accountStep.emailRow')}
      outlined={look}
      type="email"
      autocomplete="email"
      bind:value={email}
      error={emailShown}
      disabled={busy || !!confirmed}
    />
    {#if !confirmed}
      <AccountField
        label={t('createAccount.password')}
        rowLabel={t('createAccount.password')}
        outlined={look}
        type="password"
        autocomplete="new-password"
        bind:value={password}
        supporting={passwordRule()}
        error={passwordShown}
        disabled={busy}
        required
      />
    {/if}
  </div>
</EditorialPage>

<style>
  @layer od.components {
    .od-create-account--fields {
      margin: 6px 0 0;

      :global(.od-editorial-page--first-launch) & {
        margin: 0;
      }

      :global(.ios) & {
        margin: 0;
      }
    }
  }
</style>
