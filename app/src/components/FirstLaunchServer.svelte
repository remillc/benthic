<script>
  // @ts-check
  // The OpenDives server steps of the release edition's first launch (tasks 2026-11-16-259 and 260; mock-ups
  // docs/mockups/android-serveur-*.dc.html, android-tablette-serveur-*.dc.html, bureau-serveur-*.dc.html): the address,
  // the 6-digit code, « Le serveur ne répond pas » and the download. The title above each step and « Retour » are drawn
  // by FirstLaunchSteps.svelte. Sign-in is an e-mail code, no password (docs/architecture.md, section 11.2); the
  // session is kept in the platform's secure storage, never in the device store. The rules are in lib/server-signin.js.
  import { onDestroy } from 'svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from './Icon.svelte';
  import ReleaseField from './ReleaseField.svelte';
  import CodeField from './CodeField.svelte';
  import LinearWavyProgress from './LinearWavyProgress.svelte';
  import { flow, go, goBack, goBackTo } from '../lib/first-launch.svelte.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { ServerError, createServerApi, plausibleEmail } from '../lib/server-api.js';
  import { serverTransport } from '../lib/server-transport.js';
  import { serverUrl } from '../lib/server-url.js';
  import { downloadServerLogbook } from '../lib/server-logbook.js';
  import { codeScreen, formatCountdown, lockMinutes } from '../lib/server-signin.js';
  import { desktopApp, ios, layout } from '../lib/layout.svelte.js';
  import { deviceKind, deviceKey } from '../lib/first-launch-phone.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ step: 'server'|'serverCode'|'serverOffline'|'serverDownload', onopened: () => void }} */
  let { step, onopened } = $props();

  const s = flow.server;
  const api = createServerApi({ baseUrl: serverUrl(), transport: serverTransport });
  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));

  let busy = $state(false);
  let now = $state(Date.now());
  /** Wide screens (tablet, desktop) keep the six boxes together at the start of the line, 12 dp apart. */
  const wide = $derived(!layout.phone);

  // A timer repaints the countdown while the code step is shown; the time itself is computed (server-signin.js).
  const timer = setInterval(() => (now = Date.now()), 1000);
  onDestroy(() => clearInterval(timer));

  // --- The address ----------------------------------------------------------------------------------------

  const emailLive = liveError(
    () => s.email,
    (text) => (plausibleEmail(text) ? '' : t('serverSteps.invalidAddress')),
  );
  const emailError = $derived(s.emailError ? t('serverSteps.invalidAddress') : emailLive.error);

  /** What « Réessayer » of « Le serveur ne répond pas » repeats: the call that failed, or nothing (the download restarts by itself). */
  /** @type {(() => Promise<void>)|null} */
  let retry = null;

  /** The step that failed is put back under « Le serveur ne répond pas »; « Réessayer » repeats its call. */
  function unreachable(/** @type {(() => Promise<void>)|null} */ again) {
    retry = again;
    go('offline');
  }

  /** « Recevoir un code »: asks for the code, then the code step. */
  async function requestCode() {
    if (busy || !s.email.trim()) return;
    if (!plausibleEmail(s.email)) {
      s.emailError = true;
      return;
    }
    busy = true;
    try {
      const sent = await api.requestCode(s.email);
      s.resendAt = Date.now() + sent.resendAfterSeconds * 1000;
      s.code = '';
      s.error = '';
      go('code');
    } catch (e) {
      const code = e instanceof ServerError ? e.code : 'UNREACHABLE';
      if (code === 'INVALID_ADDRESS') s.emailError = true;
      else if (code === 'TOO_MANY_ATTEMPTS') {
        s.error = 'TOO_MANY_ATTEMPTS';
        s.lockedUntil = Date.now() + lockMinutes(e instanceof ServerError ? e.retryAfterSeconds : undefined) * 60000;
        s.code = '';
        go('code');
      } else unreachable(requestCode);
    } finally {
      busy = false;
    }
  }

  // --- The code -------------------------------------------------------------------------------------------

  const secondsLeft = $derived(Math.max(0, Math.ceil((s.resendAt - now) / 1000)));
  const lockedMinutes = $derived(Math.max(1, Math.ceil((s.lockedUntil - now) / 60000)));
  const view = $derived(codeScreen({ code: s.code, error: s.error, resendLeft: secondsLeft, busy }));
  // The lock ends by itself: the screen then asks for the code again.
  $effect(() => {
    if (s.error === 'TOO_MANY_ATTEMPTS' && s.lockedUntil && now >= s.lockedUntil) {
      s.error = '';
      s.lockedUntil = 0;
    }
  });

  const codeError = $derived(
    s.error === 'WRONG_CODE'
      ? t('serverSteps.wrongCode')
      : s.error === 'CODE_EXPIRED'
        ? t('serverSteps.expiredCode')
        : s.error === 'TOO_MANY_ATTEMPTS'
          ? t('serverSteps.tooManyAttempts', { n: lockedMinutes })
          : '',
  );

  /** Typing again takes a wrong code's error away; an expired code or a lock stays until a new code is asked. */
  function codeTyped() {
    if (s.error === 'WRONG_CODE') s.error = '';
  }

  /** « Se connecter »: the code is checked, the session kept, then the download. */
  async function signIn() {
    if (busy || view.primaryDisabled || view.primary !== 'signIn') return;
    busy = true;
    try {
      const session = await api.verifyCode(s.email, s.code);
      await OpenDivesCore.serverSessionSave({
        email: session.user.email,
        sessionToken: session.sessionToken,
        repositoryUrl: session.repository.url,
        branch: session.repository.branch || 'main',
        gitUsername: session.git.username,
        gitToken: session.git.token,
      });
      s.code = '';
      s.error = '';
      go('session');
    } catch (e) {
      const code = e instanceof ServerError ? e.code : 'UNREACHABLE';
      if (code === 'WRONG_CODE' || code === 'CODE_EXPIRED') s.error = code;
      else if (code === 'TOO_MANY_ATTEMPTS') {
        s.error = code;
        s.lockedUntil = Date.now() + lockMinutes(e instanceof ServerError ? e.retryAfterSeconds : undefined) * 60000;
        s.code = '';
      } else if (code === 'INVALID_ADDRESS') {
        s.emailError = true;
        goBack();
      } else unreachable(signIn);
    } finally {
      busy = false;
    }
  }

  /** « Renvoyer le code » and « Recevoir un nouveau code »: a new code replaces the old one. */
  async function sendAgain() {
    if (busy) return;
    busy = true;
    try {
      const sent = await api.requestCode(s.email);
      s.resendAt = Date.now() + sent.resendAfterSeconds * 1000;
      s.code = '';
      s.error = '';
    } catch (e) {
      const code = e instanceof ServerError ? e.code : 'UNREACHABLE';
      if (code === 'TOO_MANY_ATTEMPTS') {
        s.error = code;
        s.lockedUntil = Date.now() + lockMinutes(e instanceof ServerError ? e.retryAfterSeconds : undefined) * 60000;
        s.code = '';
      } else if (code !== 'RESEND_TOO_SOON') unreachable(sendAgain);
    } finally {
      busy = false;
    }
  }

  // --- « Le serveur ne répond pas » -----------------------------------------------------------------------

  function again() {
    const action = retry;
    retry = null;
    goBack();
    if (action) void action();
  }

  /** « Choisir un autre endroit »: back to the list the diver came from. */
  function otherPlace() {
    goBackTo(flow.stack.includes('where') ? 'where' : 'open');
  }

  // --- The download ---------------------------------------------------------------------------------------

  const d = $state({ done: 0, total: 0, phase: /** @type {'listing'|'download'|'unreadable'|'empty'} */ ('listing'), dives: 0 });
  let cancelled = false;

  async function download() {
    cancelled = false;
    Object.assign(d, { done: 0, total: 0, phase: 'listing', dives: 0 });
    try {
      const access = await OpenDivesCore.serverSessionAccess();
      const result = await downloadServerLogbook({
        transport: serverTransport,
        repositoryUrl: access.repositoryUrl,
        branch: access.branch,
        token: access.token,
        cancelled: () => cancelled,
        onProgress: (done, total) => {
          d.done = done;
          d.total = total;
          d.phase = 'download';
        },
      });
      d.dives = result.dives;
      // The diver's logbook is on the server, but this version cannot load it yet (docs/architecture.md, 11.3, open point).
      d.phase = result.marker === 'empty' ? 'empty' : 'unreadable';
      // A logbook the app can load opens here (the snackbar is told by the parent); see `openable` in server-logbook.js.
      if (result.openable) onopened();
    } catch (e) {
      if (cancelled || (e instanceof Error && e.message === 'CANCELLED')) return;
      unreachable(null);
    }
  }

  $effect(() => {
    if (step === 'serverDownload') void download();
    return () => {
      cancelled = true;
    };
  });

  /** « Annuler »: nothing was written, the diver chooses another place. */
  function cancel() {
    cancelled = true;
    otherPlace();
  }
</script>

{#if step === 'server'}
  <h3 class="od-first-launch-server--subtitle">{t('serverSteps.accountTitle')}</h3>
  <p class="od-first-launch-server--lead">{t('serverSteps.accountHelp')}</p>
  <div class="od-first-launch-server--field">
    <ReleaseField label={t('serverSteps.emailLabel')} type="email" autocomplete="email" bind:value={s.email} error={emailError} help={t('serverSteps.emailHelp')} oninput={() => (s.emailError = false)} onenter={requestCode} />
  </div>
  <button type="button" class="od-first-launch-server--action" disabled={busy || !s.email.trim()} aria-busy={busy} onclick={requestCode}>{t('serverSteps.getCode')}</button>
{:else if step === 'serverCode'}
  <h3 class="od-first-launch-server--subtitle">{t('serverSteps.codeTitle')}</h3>
  <p class="od-first-launch-server--lead">{t('serverSteps.codeHelp', { email: s.email })}</p>
  <CodeField
    label={t('serverSteps.codeLabel')}
    accessibleLabel={t('serverSteps.codeAccessible')}
    bind:value={s.code}
    error={codeError}
    disabled={busy || s.error === 'TOO_MANY_ATTEMPTS'}
    gap={wide ? 12 : 8}
    spread={!wide}
    oninput={codeTyped}
    onsubmit={signIn}
  />
  {#if view.resend === 'countdown'}
    <p class="od-first-launch-server--countdown" aria-live="off">{t('serverSteps.resendIn', { time: formatCountdown(secondsLeft) })}</p>
  {:else if view.resend === 'link'}
    <button type="button" class="od-first-launch-server--link" disabled={view.resendDisabled} onclick={sendAgain}>{t('serverSteps.resend')}</button>
  {/if}
  <div class="od-first-launch-server--space"></div>
  {#if view.primary === 'signIn'}
    <button type="button" class="od-first-launch-server--action" disabled={view.primaryDisabled} aria-busy={busy} onclick={signIn}>{t('serverSteps.signIn')}</button>
  {:else}
    <button type="button" class="od-first-launch-server--action" disabled={view.primaryDisabled} aria-busy={busy} onclick={sendAgain}>{t('serverSteps.newCode')}</button>
  {/if}
{:else if step === 'serverOffline'}
  <p class="od-first-launch-server--overline">{t('serverSteps.title')}</p>
  <span class="od-first-launch-server--tile" aria-hidden="true"><Icon name="offline" size={28} weight={1.8} /></span>
  <h2 class="od-first-launch-server--heading">{t('serverSteps.offlineTitle')}</h2>
  <p class="od-first-launch-server--lead">{t(deviceKey('serverSteps.offlineHelp', kind))}</p>
  <div class="od-first-launch-server--space"></div>
  <button type="button" class="od-first-launch-server--action" onclick={again}>{t('serverSteps.retry')}</button>
  <button type="button" class="od-first-launch-server--quiet" onclick={otherPlace}>{t('serverSteps.otherPlace')}</button>
{:else if step === 'serverDownload'}
  <div class="od-first-launch-server--paper">
    <div class="od-first-launch-server--step">
      <span class="od-first-launch-server--mark od-first-launch-server--done"><Icon name="check" size={16} weight={2.6} /></span>
      <span class="od-first-launch-server--text">
        <span class="od-first-launch-server--name">{t('serverSteps.progressConnect')}</span>
        <span class="od-first-launch-server--detail">{s.email}</span>
      </span>
    </div>
    {#if d.phase === 'unreadable' || d.phase === 'empty'}
      <div class="od-first-launch-server--step" role="alert">
        <span class="od-first-launch-server--mark od-first-launch-server--failed"><span class="od-first-launch-server--bang" aria-hidden="true">!</span></span>
        <span class="od-first-launch-server--text">
          <span class="od-first-launch-server--name od-first-launch-server--name-failed">{t(d.phase === 'empty' ? 'serverSteps.emptyTitle' : 'serverSteps.unreadableTitle')}</span>
          <span class="od-first-launch-server--detail">{t(d.phase === 'empty' ? 'serverSteps.emptyDetail' : 'serverSteps.unreadableDetail', { n: d.dives })}</span>
        </span>
      </div>
    {:else}
      <div class="od-first-launch-server--step">
        <span class="od-first-launch-server--mark od-first-launch-server--current"><span class="od-first-launch-server--dot"></span></span>
        <span class="od-first-launch-server--text">
          <span class="od-first-launch-server--name od-first-launch-server--name-current">{t('serverSteps.progressDownload')}</span>
          <span class="od-first-launch-server--detail">{d.total ? t('serverSteps.progressCount', { done: d.done, total: d.total }) : t('serverSteps.progressListing')}</span>
        </span>
      </div>
      <div class="od-first-launch-server--bar">
        <LinearWavyProgress value={d.total ? d.done / d.total : 0} label={t('serverSteps.progressDownload')} />
      </div>
    {/if}
    <div class="od-first-launch-server--step">
      <span class="od-first-launch-server--mark"></span>
      <span class="od-first-launch-server--text">
        <span class="od-first-launch-server--name od-first-launch-server--waiting">{t(deviceKey('serverSteps.progressCopy', kind))}</span>
      </span>
    </div>
  </div>
  {#if d.phase === 'unreadable' || d.phase === 'empty'}
    <div class="od-first-launch-server--space"></div>
    <button type="button" class="od-first-launch-server--action" onclick={otherPlace}>{t('serverSteps.otherPlace')}</button>
  {:else}
    <p class="od-first-launch-server--help">{t('serverSteps.progressHelp')}</p>
    <button type="button" class="od-first-launch-server--cancel" onclick={cancel}>{t('welcomeSteps.cancel')}</button>
  {/if}
{/if}

<style>
  @layer od.components {
    .od-first-launch-server--subtitle {
      margin: 2px 0 6px;
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-first-launch-server--overline {
      margin: 0 0 4px;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--od-release-row-main);
    }

    .od-first-launch-server--heading {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .od-first-launch-server--lead {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .od-first-launch-server--field {
      margin-top: 14px;
    }

    .od-first-launch-server--space {
      flex: none;
      height: 24px;
    }

    .od-first-launch-server--tile {
      width: 56px;
      height: 56px;
      margin: 4px 0 16px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-error-container);
      color: var(--od-error);
    }

    /* « Renvoyer le code dans 0:42 »: not a button, the link comes back when the countdown ends. */
    .od-first-launch-server--countdown {
      align-self: flex-start;
      display: flex;
      align-items: center;
      min-height: 48px;
      margin: 4px 0 -12px;
      padding: 0 4px;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-first-launch-server--link {
      align-self: flex-start;
      display: flex;
      align-items: center;
      min-height: 48px;
      margin: 4px 0 -12px;
      padding: 0 4px;
      border: none;
      background: transparent;
      color: var(--od-release-row-main);
      font: inherit;
      font-size: 14px;
      line-height: 19px;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }

    .od-first-launch-server--action {
      width: auto;
      align-self: flex-end;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 22px;
      height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: 24px;
      background: var(--od-text);
      color: var(--od-background);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;

      &:disabled {
        cursor: default;
        background: var(--od-release-disabled-bg);
        color: var(--od-release-disabled-text);
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          opacity: 0.88;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

    .od-first-launch-server--quiet {
      width: auto;
      align-self: flex-end;
      height: 48px;
      margin-top: 4px;
      padding: 0 12px;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--od-release-row-main);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }
    }

    /* The download card, as the divelogs.de one (task 2026-11-16-230): three steps, the bar as wide as the text. */
    .od-first-launch-server--paper {
      margin-top: 12px;
      padding: 20px 20px 22px;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 20px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .od-first-launch-server--step {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .od-first-launch-server--mark {
      flex: none;
      box-sizing: border-box;
      width: 28px;
      height: 28px;
      border: 2px solid var(--od-release-pending);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-release-on-panel);
    }

    .od-first-launch-server--failed {
      border: none;
      background: var(--od-alarm);
    }

    .od-first-launch-server--bang {
      font-size: 15px;
      line-height: 16px;
      font-weight: 700;
    }

    .od-first-launch-server--done {
      border: none;
      background: var(--od-release-ok);
    }

    .od-first-launch-server--current {
      border: 3px solid var(--od-release-row-main);
    }

    .od-first-launch-server--dot {
      width: 10px;
      height: 10px;
      border-radius: 5px;
      background: var(--od-release-row-main);
    }

    .od-first-launch-server--text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-top: 4px;
      min-width: 0;
    }

    .od-first-launch-server--name {
      font-size: 16px;
      line-height: 21px;
      font-weight: 500;
    }

    .od-first-launch-server--name-current {
      font-weight: 600;
    }

    .od-first-launch-server--name-failed {
      font-weight: 600;
      color: var(--od-alarm);
    }

    .od-first-launch-server--waiting {
      color: var(--od-text-2);
    }

    .od-first-launch-server--detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
      overflow-wrap: anywhere;
    }

    .od-first-launch-server--bar {
      min-width: 0;
      max-width: calc(100% - 42px);
      overflow: hidden;
      margin: -4px 0 2px 42px;
      --od-linear-wavy-progress-active: var(--od-release-row-main);
      --od-linear-wavy-progress-track: var(--od-release-track);
    }

    .od-first-launch-server--help {
      margin: 14px 0 22px;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-first-launch-server--cancel {
      width: auto;
      align-self: flex-end;
      height: 48px;
      padding: 0 22px;
      border: 1px solid var(--od-release-field-border);
      border-radius: 24px;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }
    }

    /* Phone: a button alone takes the width of the column (task 2026-11-16-227). */
    @media (max-width: 767.98px) {
      .od-first-launch-server--action,
      .od-first-launch-server--cancel,
      .od-first-launch-server--quiet {
        align-self: stretch;
        justify-content: center;
      }

      .od-first-launch-server--quiet {
        align-self: flex-end;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-first-launch-server--action {
        transition: none;
      }
    }
  }
</style>
