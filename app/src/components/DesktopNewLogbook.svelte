<script>
  // @ts-check
  // The new-logbook dialog (tasks 2026-11-15-173, 207, 208; docs/mockups/bureau-nouveau-carnet-choix,
  // -nuage-fournisseur, -nuage-connexion, -nuage, -nuage-webdav, -git). Step 1: the name, then where to keep the
  // logbook as choice rows (never radio buttons). « Sur cet ordinateur » goes straight to the system's save
  // dialog; the git repository has a second step; the cloud has two: the service, then its connection (a sign-in in
  // the browser, or the address, user name and password of a WebDAV server). The dialog keeps one size and one
  // place at every step; the ✕ top right closes it like Échap. The main process creates the logbook and opens it
  // in a new window (desktop/windows.cjs).
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import { t } from '../lib/i18n.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { reducedMotion } from '../lib/reduced-motion.js';
  import { desktopMac } from '../lib/layout.svelte.js';
  import {
    cloudRows,
    providerAvailable,
    stepCount,
    connectionState,
    cloudErrorKey,
    webdavErrorField,
    webdavServerError,
    secondStep,
    validLogbookName,
    fileNameFor,
    gitUrlError,
    gitFormReady,
    gitUserError,
    gitUserFromUrl,
    cloudFormReady,
    tokenPageUrl,
    creationErrorKey,
  } from '../lib/desktop-logbooks.js';

  /** @type {{ onclose: () => void }} */
  let { onclose } = $props();

  /** @type {import('../lib/desktop-logbooks.js').Where} */
  let where = $state('computer');
  let step = $state(/** @type {import('../lib/desktop-logbooks.js').NewLogbookStep} */ ('choice'));
  let name = $state(t('desktopLogbooks.new.defaultName'));
  let provider = $state('');
  let url = $state('');
  let branch = $state('main');
  let username = $state('');
  /** True once the diver typed a user name: the address no longer fills it in. */
  let userTyped = $state(false);
  let token = $state('');
  let server = $state('');
  let davUser = $state('');
  let davPassword = $state('');
  /** What the server said of the address or of the password when the logbook was created (shown under that field until it is typed in again). */
  let serverError = $state('');
  let passwordError = $state('');
  let busy = $state(false);
  let error = $state('');
  /** What the main process says of each service: available, connected, as whom (never a token). @type {import('../lib/desktop-logbooks.js').CloudStatus[]} */
  let status = $state([]);
  /** The service whose sign-in is open in the browser. */
  let signingIn = $state('');

  /** @param {string} id */
  const statusOf = (id) => status.find((p) => p.provider === id);
  /** @param {string} id */
  const isConnected = (id) => !!statusOf(id)?.connected;
  /** @param {string} id */
  const serviceName = (id) => t(`desktopLogbooks.source.${id}`);

  const rows = cloudRows(desktopMac);
  const urlCheck = liveError(
    () => url,
    (text) => (gitUrlError(text) ? t('desktopLogbooks.new.errorUrl') : ''),
  );
  const userCheck = liveError(
    () => username,
    (text) => (gitUserError(text) ? t('desktopFollowups.newLogbook.errorUsername') : ''),
  );
  const serverCheck = liveError(
    () => server,
    (text) => {
      const problem = webdavServerError(text);
      return problem === 'insecure' ? t('desktopCloud.errors.INSECURE_ADDRESS') : problem ? t('desktopCloud.webdav.errorAddress') : '';
    },
  );
  $effect(() => {
    const owner = gitUserFromUrl(url);
    if (!userTyped) username = owner;
  });
  const nameValid = $derived(validLogbookName(name));
  const gitReady = $derived(gitFormReady({ url, branch, token, username }));
  const cloudReady = $derived(cloudFormReady({ provider, connected: isConnected(provider), webdav: { server, username: davUser, password: davPassword } }));
  const services = t(desktopMac ? 'desktopLogbooks.new.cloudServicesMac' : 'desktopLogbooks.new.cloudServices');
  const count = $derived(stepCount(step, where));
  const stepLine = $derived(step === 'choice' ? t('desktopLogbooks.new.step', count) : t('desktopLogbooks.new.stepNamed', { ...count, name: name.trim() }));
  const connection = $derived(connectionState({ connected: isConnected(provider), signingIn: !!signingIn }));
  const fadeMs = () => (reducedMotion() ? 0 : 150);

  /** @returns {any} */
  const bridge = () => /** @type {any} */ (globalThis).odDesktop;

  async function refreshStatus() {
    try {
      status = await bridge().logbooks.cloudStatus();
    } catch (e) {
      console.error('Reading the cloud services', e);
    }
  }

  onMount(refreshStatus);

  /** A row is chosen. @param {string} id */
  function chooseProvider(id) {
    if (!providerAvailable(statusOf(id))) return;
    provider = id;
    error = '';
  }

  /**
   * « Se connecter à {service} » opens the sign-in in the browser; « Changer de compte » does it again, asking
   * which account. The step switches to the connected state when the diver comes back signed in.
   * @param {boolean} [switchAccount]
   */
  async function signIn(switchAccount = false) {
    if (signingIn || !provider) return;
    const id = provider;
    error = '';
    signingIn = id;
    try {
      status = [await bridge().logbooks.cloudSignIn({ provider: id, switchAccount }), ...status.filter((p) => p.provider !== id)];
    } catch (e) {
      // Cancelled on purpose: nothing to say.
      if (cloudErrorKey(/** @type {any} */ (e)) !== 'desktopCloud.errors.SIGN_IN_CANCELLED') error = t(cloudErrorKey(/** @type {any} */ (e), id));
      await refreshStatus();
    } finally {
      signingIn = '';
    }
  }

  /** « Annuler la connexion »: the page was closed, or the diver changed their mind. */
  function cancelSignIn() {
    if (signingIn) bridge().logbooks.cloudCancelSignIn({ provider: signingIn });
  }

  /** « Rouvrir la page »: the sign-in page again (a tab closed, or opened behind another window). */
  function reopenSignIn() {
    if (signingIn) bridge().logbooks.cloudReopenSignIn({ provider: signingIn });
  }

  /** The ✕, Échap and a click outside: nothing is created, a sign-in still waiting in the browser is abandoned. */
  function close() {
    cancelSignIn();
    onclose();
  }

  function clearWebdav() {
    server = '';
    davUser = '';
    davPassword = '';
    serverError = '';
    passwordError = '';
  }

  /**
   * « Retour »: one step back. A sign-in still waiting is cancelled and any message cleared. Going back to step 1 starts
   * the later steps afresh (service, repository and server fields cleared); from the connection to the services the choice stays.
   */
  function back() {
    cancelSignIn();
    signingIn = '';
    error = '';
    busy = false;
    if (step === 'connect') {
      clearWebdav();
      step = 'provider';
      return;
    }
    provider = '';
    url = '';
    branch = 'main';
    username = '';
    userTyped = false;
    token = '';
    clearWebdav();
    step = 'choice';
    refreshStatus();
  }

  /** « Continuer » of steps 1 and 2. */
  async function next() {
    if (busy) return;
    error = '';
    if (step === 'provider') {
      if (!provider) return;
      await refreshStatus();
      step = 'connect';
      return;
    }
    if (!nameValid) return;
    const second = secondStep(where);
    if (second) {
      if (second === 'provider' && !provider) provider = rows.find((id) => providerAvailable(statusOf(id))) ?? '';
      step = second;
      return;
    }
    await create();
  }

  async function create() {
    busy = true;
    error = '';
    serverError = '';
    passwordError = '';
    try {
      const spec =
        where === 'git'
          ? { where, name: name.trim(), url: url.trim(), username: username.trim(), branch: branch.trim(), token: token.trim() }
          : where === 'cloud'
            ? provider === 'webdav'
              ? { where, name: name.trim(), provider, server: server.trim(), username: davUser.trim(), password: davPassword }
              : { where, name: name.trim(), provider }
            : { where, name: name.trim() };
      const result = await bridge().logbooks.create(spec);
      if (result.canceled) return;
      onclose();
    } catch (e) {
      const failure = /** @type {any} */ (e);
      if (where === 'cloud') {
        const text = t(cloudErrorKey(failure, provider));
        const field = provider === 'webdav' ? webdavErrorField(failure) : '';
        if (field === 'server') serverError = text;
        else if (field === 'password') passwordError = text;
        else error = text;
      } else {
        error = t(creationErrorKey(failure));
      }
    } finally {
      busy = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Enter' || /** @type {HTMLElement} */ (e.target).tagName !== 'INPUT') return;
    if (step === 'choice') {
      e.preventDefault();
      next();
    } else if (step === 'connect' && provider === 'webdav' && cloudReady && !busy) {
      e.preventDefault();
      create();
    }
  }

  /**
   * A step has appeared: the first field is selected, else the chosen row or the main button gets the focus, so
   * that the keyboard (Échap included) keeps working from the dialog.
   * @param {HTMLElement} node
   */
  function focusStep(node) {
    queueMicrotask(() => {
      const input = /** @type {HTMLInputElement|null} */ (node.querySelector('input'));
      if (input) input.select();
      else /** @type {HTMLElement|null} */ (node.querySelector('[role="radio"][aria-checked="true"]') ?? node.querySelector('.od-new-logbook--button:not(:disabled)') ?? node.closest('[role="dialog"]'))?.focus();
    });
  }
</script>

<!-- Échap works wherever the focus is: a step that changes can leave it on the page (a button that goes away). -->
<svelte:window onkeydown={keydown} />
<div class="od-new-logbook">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="od-new-logbook--scrim" onclick={close}></div>
  <div class="od-new-logbook--surface" role="dialog" aria-modal="true" aria-labelledby="od-new-logbook-title" tabindex="-1">
    <button type="button" class="od-new-logbook--close" aria-label={t('desktopLogbooks.new.closeLabel')} title={t('desktopLogbooks.new.closeTip')} onclick={close}><Icon name="close" size={24} weight={2} /></button>
    {#key step}
      <div class="od-new-logbook--page" use:focusStep in:fade={{ duration: fadeMs() }} out:fade={{ duration: fadeMs() }}>
        <div class="od-new-logbook--header">
          <p class="od-new-logbook--step">{stepLine}</p>
          <h2 id="od-new-logbook-title" class="od-new-logbook--title">
            {#if step === 'choice'}{t('desktopLogbooks.new.title')}
            {:else if step === 'provider'}{t('desktopLogbooks.new.cloud')}
            {:else if step === 'git'}{t('desktopLogbooks.new.git')}
            {:else if provider === 'webdav'}{t('desktopLogbooks.new.connectTitleServer')}
            {:else}{t('desktopLogbooks.new.connectTitle', { service: serviceName(provider) })}{/if}
          </h2>
        </div>
        {#if step === 'choice'}
          <div class="od-new-logbook--body">
            <label class="od-new-logbook--label" for="od-new-logbook-name">{t('desktopLogbooks.new.nameLabel')}</label>
            <input id="od-new-logbook-name" class="od-new-logbook--input" type="text" bind:value={name} maxlength="100" autocomplete="off" aria-describedby="od-new-logbook-name-help" />
            <p id="od-new-logbook-name-help" class="od-new-logbook--help">{t('desktopLogbooks.new.nameHelp')}</p>
            <h3 class="od-new-logbook--heading">{t('desktopLogbooks.new.whereLabel')}</h3>
            <div role="radiogroup" aria-label={t('desktopLogbooks.new.whereLabel')} class="od-new-logbook--rows">
              <ChoiceRow name="od-new-logbook-where" selected={where === 'computer'} onselect={() => (where = 'computer')}>
                <span class="od-new-logbook--tile"><Icon name="desktop" size={22} /></span>
                <span class="od-new-logbook--text">
                  <span class="od-new-logbook--row-title">{t('desktopLogbooks.new.computer')}</span>
                  <span class="od-new-logbook--row-help">{t('desktopLogbooks.new.computerHelp')}</span>
                </span>
              </ChoiceRow>
              <ChoiceRow name="od-new-logbook-where" selected={where === 'cloud'} onselect={() => (where = 'cloud')}>
                <span class="od-new-logbook--tile"><Icon name="cloud" size={22} /></span>
                <span class="od-new-logbook--text">
                  <span class="od-new-logbook--row-title">{t('desktopLogbooks.new.cloud')}</span>
                  <span class="od-new-logbook--row-help">{t('desktopLogbooks.new.cloudHelp', { services })}</span>
                </span>
              </ChoiceRow>
              <ChoiceRow name="od-new-logbook-where" selected={where === 'git'} onselect={() => (where = 'git')}>
                <span class="od-new-logbook--tile"><Icon name="git" size={22} /></span>
                <span class="od-new-logbook--text">
                  <span class="od-new-logbook--row-title">{t('desktopLogbooks.new.git')}</span>
                  <span class="od-new-logbook--row-help">{t('desktopLogbooks.new.gitHelp')}</span>
                </span>
              </ChoiceRow>
            </div>
            {#if error}<p class="od-new-logbook--error" role="alert">{error}</p>{/if}
          </div>
          <div class="od-new-logbook--footer">
            <div class="od-new-logbook--actions">
              <button type="button" class="od-new-logbook--text-button" onclick={close}>{t('desktopLogbooks.new.cancel')}</button>
              <button type="button" class="od-new-logbook--button" disabled={!nameValid || busy} onclick={next}>{t('desktopLogbooks.new.continue')}</button>
            </div>
          </div>
        {:else if step === 'provider'}
          <div class="od-new-logbook--body">
            <p class="od-new-logbook--intro">{t('desktopLogbooks.new.providerIntro')}</p>
            <div role="radiogroup" aria-label={t('desktopLogbooks.new.cloud')} class="od-new-logbook--rows">
              {#each rows as id (id)}
                {@const usable = providerAvailable(statusOf(id))}
                <ChoiceRow name="od-new-logbook-provider" selected={provider === id} disabled={!usable} onselect={() => chooseProvider(id)}>
                  <span class="od-new-logbook--logo" data-provider={id}>
                    {#if id === 'webdav'}
                      <!-- WebDAV is a protocol, not a brand: a generic server. -->
                      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="13" width="16" height="7" rx="2" /><path d="M8 7.5h.01M8 16.5h.01" /></svg>
                    {:else}
                      <!-- A neutral square: the services' official logos are added from their brand files (task 173 report). -->
                      <Icon name="cloud" size={20} />
                    {/if}
                  </span>
                  <span class="od-new-logbook--row-title od-new-logbook--grow">{serviceName(id)}</span>
                  {#if !usable}<span class="od-new-logbook--status">{t('desktopLogbooks.new.notAvailable')}</span>{/if}
                </ChoiceRow>
              {/each}
            </div>
          </div>
          <div class="od-new-logbook--footer">
            <div class="od-new-logbook--actions">
              <button type="button" class="od-new-logbook--text-button" onclick={back}>{t('desktopLogbooks.new.back')}</button>
              <button type="button" class="od-new-logbook--button" disabled={!provider || busy} onclick={next}>{t('desktopLogbooks.new.continue')}</button>
            </div>
          </div>
        {:else if step === 'connect' && provider === 'webdav'}
          <div class="od-new-logbook--body">
            <p class="od-new-logbook--intro">{t('desktopCloud.webdav.intro', { file: fileNameFor(name) })}</p>
            <label class="od-new-logbook--label" for="od-new-logbook-server">{t('desktopCloud.webdav.server')}</label>
            <input id="od-new-logbook-server" class="od-new-logbook--input" class:od-new-logbook--invalid={!!(serverCheck.error || serverError)} type="text" bind:value={server} oninput={() => (serverError = '')} placeholder={t('desktopCloud.webdav.serverPlaceholder')} autocomplete="off" autocapitalize="off" spellcheck="false" aria-invalid={!!(serverCheck.error || serverError)} />
            {#if serverCheck.error || serverError}<p class="od-new-logbook--error od-new-logbook--error-small" role="alert">{serverCheck.error || serverError}</p>{/if}
            <label class="od-new-logbook--label" for="od-new-logbook-dav-user">{t('desktopCloud.webdav.username')}</label>
            <input id="od-new-logbook-dav-user" class="od-new-logbook--input" type="text" bind:value={davUser} oninput={() => (passwordError = '')} autocomplete="off" autocapitalize="off" spellcheck="false" />
            <label class="od-new-logbook--label" for="od-new-logbook-dav-password">{t('desktopCloud.webdav.password')}</label>
            <input id="od-new-logbook-dav-password" class="od-new-logbook--input" class:od-new-logbook--invalid={!!passwordError} type="password" bind:value={davPassword} oninput={() => (passwordError = '')} autocomplete="off" spellcheck="false" aria-invalid={!!passwordError} aria-describedby="od-new-logbook-dav-password-help" />
            {#if passwordError}<p class="od-new-logbook--error od-new-logbook--error-small" role="alert">{passwordError}</p>{/if}
            <p id="od-new-logbook-dav-password-help" class="od-new-logbook--help">{t('desktopCloud.webdav.passwordHelp')}</p>
            {#if error}<p class="od-new-logbook--error" role="alert">{error}</p>{/if}
          </div>
          <div class="od-new-logbook--footer">
            <div class="od-new-logbook--actions">
              <button type="button" class="od-new-logbook--text-button" onclick={back}>{t('desktopLogbooks.new.back')}</button>
              <button type="button" class="od-new-logbook--button" disabled={!cloudReady || busy} onclick={create}>{busy ? t('desktopLogbooks.new.creating') : t('desktopLogbooks.new.create')}</button>
            </div>
          </div>
        {:else if step === 'connect'}
          <div class="od-new-logbook--body">
            <div class="od-new-logbook--band">
              <div class="od-new-logbook--end">
                <span class="od-new-logbook--big-tile">
                  <img class="od-new-logbook--mark" src="logo-light.svg" alt="" width="44" height="44" />
                </span>
                <span class="od-new-logbook--end-name">OpenDives</span>
              </div>
              <div class="od-new-logbook--link" class:od-new-logbook--link-ok={connection === 'connected'} role="img" aria-label={t('desktopCloud.connect.linkSign', { service: serviceName(provider) })}>
                <span class="od-new-logbook--line"></span>
                <span class="od-new-logbook--badge"><Icon name={connection === 'connected' ? 'check' : 'link'} size={18} weight={connection === 'connected' ? 2.5 : 2} /></span>
                <span class="od-new-logbook--line"></span>
              </div>
              <div class="od-new-logbook--end">
                <span class="od-new-logbook--big-tile" data-provider={provider}><Icon name="cloud" size={44} /></span>
                <span class="od-new-logbook--end-name">{serviceName(provider)}</span>
              </div>
            </div>
            <div class="od-new-logbook--state" role="status">
              {#if connection === 'connected'}
                <p class="od-new-logbook--state-title">{statusOf(provider)?.account || t('desktopCloud.connect.noAccount')}</p>
                <p class="od-new-logbook--state-text">
                  {t('desktopCloud.connect.ready', { file: fileNameFor(name) })}
                  <button type="button" class="od-new-logbook--link-button" onclick={() => signIn(true)}>{t('desktopCloud.connect.switchAccount')}</button>
                </p>
              {:else if connection === 'waiting'}
                <p class="od-new-logbook--state-title">{t('desktopCloud.connect.waiting')}</p>
                <p class="od-new-logbook--state-text">
                  {t('desktopCloud.connect.waitingText', { service: serviceName(signingIn) })}
                  <button type="button" class="od-new-logbook--link-button" onclick={reopenSignIn}>{t('desktopCloud.connect.reopen')}</button>
                </p>
              {:else}
                <p class="od-new-logbook--state-title">{t('desktopCloud.connect.notYet')}</p>
                <p class="od-new-logbook--state-text">{t('desktopCloud.connect.notYetText', { service: serviceName(provider) })}</p>
              {/if}
            </div>
            {#if error}<p class="od-new-logbook--error od-new-logbook--state-error" role="alert">{error}</p>{/if}
          </div>
          <div class="od-new-logbook--footer">
            <p class="od-new-logbook--privacy"><Icon name="lock" size={16} /><span>{t('desktopCloud.connect.privacy')}</span></p>
            <div class="od-new-logbook--actions">
              <button type="button" class="od-new-logbook--text-button" onclick={back}>{t('desktopLogbooks.new.back')}</button>
              {#if connection === 'waiting'}
                <button type="button" class="od-new-logbook--button" onclick={cancelSignIn}>{t('desktopCloud.connect.cancel')}</button>
              {:else if connection === 'connected'}
                <button type="button" class="od-new-logbook--button" disabled={!cloudReady || busy} onclick={create}>{busy ? t('desktopLogbooks.new.creating') : t('desktopLogbooks.new.create')}</button>
              {:else}
                <button type="button" class="od-new-logbook--button od-new-logbook--button-icon" onclick={() => signIn()}><Icon name="openInNew" size={18} />{t('desktopCloud.connect.signIn', { service: serviceName(provider) })}</button>
              {/if}
            </div>
          </div>
        {:else}
          <div class="od-new-logbook--body">
            <label class="od-new-logbook--label" for="od-new-logbook-url">{t('desktopLogbooks.new.gitUrl')}</label>
            <input id="od-new-logbook-url" class="od-new-logbook--input" class:od-new-logbook--invalid={!!urlCheck.error} type="url" bind:value={url} placeholder={t('desktopLogbooks.new.gitUrlPlaceholder')} autocomplete="off" spellcheck="false" aria-invalid={!!urlCheck.error} />
            {#if urlCheck.error}<p class="od-new-logbook--error od-new-logbook--error-small" role="alert">{urlCheck.error}</p>{/if}
            <div class="od-new-logbook--pair">
              <div>
                <label class="od-new-logbook--label" for="od-new-logbook-username">{t('desktopFollowups.newLogbook.gitUsername')}</label>
                <input id="od-new-logbook-username" class="od-new-logbook--input" class:od-new-logbook--invalid={!!userCheck.error} type="text" bind:value={username} oninput={() => (userTyped = username.trim() !== '')} autocomplete="off" spellcheck="false" aria-invalid={!!userCheck.error} />
                {#if userCheck.error}<p class="od-new-logbook--error od-new-logbook--error-small" role="alert">{userCheck.error}</p>{:else}<p class="od-new-logbook--help">{t('desktopFollowups.newLogbook.gitUsernameHelp')}</p>{/if}
              </div>
              <div>
                <label class="od-new-logbook--label" for="od-new-logbook-branch">{t('desktopLogbooks.new.gitBranch')}</label>
                <input id="od-new-logbook-branch" class="od-new-logbook--input" type="text" bind:value={branch} autocomplete="off" spellcheck="false" />
              </div>
            </div>
            <label class="od-new-logbook--label" for="od-new-logbook-token">{t('desktopLogbooks.new.gitToken')}</label>
            <input id="od-new-logbook-token" class="od-new-logbook--input" type="password" bind:value={token} autocomplete="off" spellcheck="false" />
            <p class="od-new-logbook--help">
              {t('desktopLogbooks.new.gitTokenHelp')}
              <a href={tokenPageUrl(url)} target="_blank" rel="noopener">{t('desktopLogbooks.new.gitTokenLink')}</a>
            </p>
            <p class="od-new-logbook--note"><Icon name="info" size={18} /><span>{t('desktopLogbooks.new.gitNote')}</span></p>
            {#if error}<p class="od-new-logbook--error" role="alert">{error}</p>{/if}
          </div>
          <div class="od-new-logbook--footer">
            <div class="od-new-logbook--actions">
              <button type="button" class="od-new-logbook--text-button" onclick={back}>{t('desktopLogbooks.new.back')}</button>
              <button type="button" class="od-new-logbook--button" disabled={!gitReady || busy} onclick={create}>{busy ? t('desktopLogbooks.new.creating') : t('desktopLogbooks.new.create')}</button>
            </div>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  @layer od.components {
    .od-new-logbook {
      position: fixed;
      inset: 0;
      z-index: 13500;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
    }
    .od-new-logbook--scrim {
      position: absolute;
      inset: 0;
      background: var(--od-scrim);
    }
    /* One frame for every step (560 × 526 dp, the same place): only the page inside changes. */
    .od-new-logbook--surface {
      position: relative;
      box-sizing: border-box;
      width: min(560px, calc(100% - 48px));
      height: min(526px, calc(100% - 48px));
      overflow: hidden;
      border-radius: 28px;
      background: var(--od-dialog);
      color: var(--od-text);
      outline: none;
    }
    /* The pages of two steps overlap while they cross-fade: each fills the frame. */
    .od-new-logbook--page {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      padding: 24px;
    }
    .od-new-logbook--header {
      flex: none;
      padding-inline-end: 32px;
    }
    .od-new-logbook--body {
      flex: 1;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
    }
    .od-new-logbook--footer {
      flex: none;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 12px;
    }
    /* The ✕: 40 dp, round, transparent, pulled 8 dp into the dialog's padding, level with the step line. */
    .od-new-logbook--close {
      position: absolute;
      z-index: 1;
      top: 16px;
      inset-inline-end: 16px;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .od-new-logbook--close:hover {
      background: var(--od-surface-2);
    }
    .od-new-logbook--close:focus-visible {
      outline: 2px solid var(--od-action);
      outline-offset: 0;
    }
    .od-new-logbook--step {
      margin: 0 0 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-new-logbook--title {
      margin: 0 0 16px;
      font-family: var(--od-title-font);
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;
    }
    .od-new-logbook--intro {
      margin: 0 0 12px;
      font-size: 15px;
      line-height: 20px;
      color: var(--od-text-2);
    }
    .od-new-logbook--label {
      display: block;
      margin: 12px 0 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-new-logbook--body > .od-new-logbook--label:first-child {
      margin-top: 0;
    }
    /* The git step has four fields: user name and branch share a row so that the step fits the frame. */
    .od-new-logbook--pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 12px;
      align-items: start;
    }
    .od-new-logbook--input {
      box-sizing: border-box;
      width: 100%;
      height: 48px;
      padding: 0 14px;
      border: var(--od-outline-width) solid var(--od-outline);
      border-radius: 8px;
      background: var(--od-surface);
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
    }
    .od-new-logbook--input:focus-visible {
      outline: 2px solid var(--od-action);
      outline-offset: 0;
    }
    .od-new-logbook--invalid {
      border-color: var(--od-alarm);
    }
    .od-new-logbook--help {
      margin: 4px 0 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-new-logbook--help a {
      color: var(--od-selected);
    }
    .od-new-logbook--heading {
      margin: 16px 0 6px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }
    .od-new-logbook--rows {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .od-new-logbook--tile,
    .od-new-logbook--logo {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-text);
    }
    .od-new-logbook--tile {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--od-surface-2);
    }
    /* The service's logo goes in a 32 dp white square with 8 dp corners. */
    .od-new-logbook--logo {
      color: var(--od-logo-square-ink);
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--od-logo-square);
      box-shadow: inset 0 0 0 1px var(--od-separator);
    }
    .od-new-logbook--text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      text-align: start;
    }
    .od-new-logbook--row-title {
      font-size: 16px;
      line-height: 22px;
    }
    .od-new-logbook--row-help {
      font-size: 14px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-new-logbook--grow {
      flex: 1;
      text-align: start;
    }
    .od-new-logbook--status {
      font-size: 13px;
      color: var(--od-text-2);
    }
    /* Step 3: the soft band with the two tiles joined by a line and a badge. */
    .od-new-logbook--band {
      display: flex;
      align-items: center;
      margin-top: 8px;
      padding: 24px 28px;
      border-radius: 24px;
      background: linear-gradient(180deg, var(--od-link-band) 0%, var(--od-dialog) 100%);
    }
    .od-new-logbook--end {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: 120px;
    }
    .od-new-logbook--big-tile {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      border-radius: 24px;
      background: var(--od-logo-square);
      color: var(--od-logo-square-ink);
      box-shadow: var(--od-tile-shadow);
    }
    .od-new-logbook--end-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--od-text);
    }
    .od-new-logbook--link {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 26px;
      --od-link-color: var(--od-link-off);
      --od-link-badge: var(--od-link-off-badge);
    }
    .od-new-logbook--link-ok {
      --od-link-color: var(--od-link-ok);
      --od-link-badge: var(--od-link-ok-badge);
    }
    .od-new-logbook--line {
      flex: 1;
      height: 0;
      border-top: 2px dashed var(--od-link-color);
    }
    .od-new-logbook--link-ok .od-new-logbook--line {
      border-top-style: solid;
    }
    .od-new-logbook--badge {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 16px;
      background: var(--od-link-badge);
      color: var(--od-link-color);
    }
    .od-new-logbook--state {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 16px;
      text-align: center;
    }
    .od-new-logbook--state-title {
      margin: 0;
      font-size: 17px;
      line-height: 22px;
      font-weight: 500;
    }
    .od-new-logbook--state-text {
      margin: 0;
      font-size: 15px;
      line-height: 20px;
      color: var(--od-text-2);
    }
    .od-new-logbook--state-error {
      text-align: center;
    }
    .od-new-logbook--link-button {
      padding: 0;
      border: 0;
      background: none;
      font: inherit;
      font-weight: 600;
      color: var(--od-selected);
      cursor: pointer;
      white-space: nowrap;
    }
    .od-new-logbook--link-button:focus-visible {
      outline: 2px solid var(--od-action);
      outline-offset: 2px;
      border-radius: 4px;
    }
    .od-new-logbook--privacy {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin: 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-new-logbook--privacy :global(svg) {
      flex: none;
      margin-top: 1px;
    }
    .od-new-logbook--note {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin: 12px 0 0;
      font-size: 14px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-new-logbook--error {
      margin: 12px 0 0;
      font-size: 14px;
      line-height: 18px;
      color: var(--od-alarm);
    }
    .od-new-logbook--error-small {
      margin-top: 4px;
      font-size: 13px;
    }
    .od-new-logbook--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .od-new-logbook--button,
    .od-new-logbook--text-button {
      flex: none;
      width: auto;
      min-width: 0;
      height: 40px;
      padding: 0 24px;
      border-radius: 20px;
      border: none;
      font: inherit;
      font-size: 15px;
      cursor: pointer;
    }
    .od-new-logbook--button {
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
    }
    .od-new-logbook--button-icon {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 24px 0 16px;
    }
    .od-new-logbook--text-button {
      padding: 0 16px;
      background: transparent;
      color: var(--od-selected);
      font-weight: 600;
    }
    .od-new-logbook--button:disabled {
      opacity: 0.38;
      cursor: default;
    }
    .od-new-logbook--button:focus-visible,
    .od-new-logbook--text-button:focus-visible {
      outline: 2px solid var(--od-action);
      outline-offset: 2px;
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .od-new-logbook--button,
      .od-new-logbook--text-button {
        transition: box-shadow 120ms linear;
      }
      .od-new-logbook--button:not(:disabled):hover,
      .od-new-logbook--text-button:not(:disabled):hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .od-new-logbook--button,
      .od-new-logbook--text-button {
        transition: none;
      }
    }

    /* Mouse: a text action underlines. */
    @media (hover: hover) and (pointer: fine) {
      .od-new-logbook--link-button:hover,
      .od-new-logbook--help a:hover {
        text-decoration: underline;
      }
    }
  }
</style>
