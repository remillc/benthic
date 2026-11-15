<script>
  // @ts-check
  // The new-logbook dialog, in two steps (task 2026-11-15-173; docs/mockups/bureau-nouveau-carnet-choix,
  // -nuage, -git). Step 1: the name, then where to keep the logbook as choice rows (never radio buttons).
  // « Sur cet ordinateur » goes straight to the system's save dialog; the cloud and the git repository have a
  // second step. The main process creates the logbook and opens it in a new window (desktop/windows.cjs).
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import ChoiceRow from './ChoiceRow.svelte';
  import { t } from '../lib/i18n.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { logbooks } from '../lib/desktop-logbooks.svelte.js';
  import {
    CLOUD_PROVIDERS,
    providerRow,
    defaultCloudFolder,
    cloudFolderError,
    cloudErrorKey,
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
  let step = $state(/** @type {'choice'|'cloud'|'git'} */ ('choice'));
  let name = $state(t('desktopLogbooks.new.defaultName'));
  let provider = $state('');
  let folder = $state('');
  let url = $state('');
  let branch = $state('main');
  let username = $state('');
  /** True once the diver typed a user name: the address no longer fills it in. */
  let userTyped = $state(false);
  let token = $state('');
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

  const providers = CLOUD_PROVIDERS;
  const folderCheck = liveError(
    () => folder,
    (text) => (cloudFolderError(text) ? t('desktopCloud.folderError') : ''),
  );
  const urlCheck = liveError(
    () => url,
    (text) => (gitUrlError(text) ? t('desktopLogbooks.new.errorUrl') : ''),
  );
  const userCheck = liveError(
    () => username,
    (text) => (gitUserError(text) ? t('desktopFollowups.newLogbook.errorUsername') : ''),
  );
  $effect(() => {
    const owner = gitUserFromUrl(url);
    if (!userTyped) username = owner;
  });
  const nameValid = $derived(validLogbookName(name));
  const gitReady = $derived(gitFormReady({ url, branch, token, username }));
  const cloudReady = $derived(cloudFormReady({ provider, connected: isConnected(provider), folder }));
  const services = t('desktopLogbooks.new.cloudServices');

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

  /** A row is chosen: its folder starts at the service's default. @param {string} id */
  function chooseProvider(id) {
    if (!statusOf(id)?.available || signingIn) return;
    provider = id;
    folder = defaultCloudFolder(id);
    error = '';
  }

  /** « Se connecter à {service} »: the browser opens on the service's sign-in page. @param {string} id */
  async function signIn(id) {
    if (signingIn) return;
    error = '';
    signingIn = id;
    try {
      status = [await bridge().logbooks.cloudSignIn({ provider: id }), ...status.filter((p) => p.provider !== id)];
    } catch (e) {
      // Cancelled on purpose: nothing to say.
      if (cloudErrorKey(/** @type {any} */ (e)) !== 'desktopCloud.errors.SIGN_IN_CANCELLED') error = t(cloudErrorKey(/** @type {any} */ (e)));
    } finally {
      signingIn = '';
    }
  }

  /** « Annuler la connexion »: the page was closed, or the diver changed their mind. */
  function cancelSignIn() {
    if (signingIn) bridge().logbooks.cloudCancelSignIn({ provider: signingIn });
  }

  // Another service chosen, or the dialog left: a sign-in still waiting is cancelled.
  $effect(() => {
    provider;
    return () => cancelSignIn();
  });

  async function signOut() {
    try {
      status = [await bridge().logbooks.cloudSignOut({ provider }), ...status.filter((p) => p.provider !== provider)];
    } catch (e) {
      console.error('Signing out of the service', e);
    }
  }

  /** Step 1 « Continuer ». */
  async function next() {
    if (!nameValid || busy) return;
    const second = secondStep(where);
    error = '';
    if (second) {
      step = second;
      return;
    }
    await create();
  }

  async function create() {
    busy = true;
    error = '';
    try {
      const spec =
        where === 'git'
          ? { where, name: name.trim(), url: url.trim(), username: username.trim(), branch: branch.trim(), token: token.trim() }
          : where === 'cloud'
            ? { where, name: name.trim(), provider, folder: folder.trim() }
            : { where, name: name.trim() };
      const result = await bridge().logbooks.create(spec);
      if (result.canceled) return;
      onclose();
    } catch (e) {
      error = t(where === 'cloud' ? cloudErrorKey(/** @type {any} */ (e)) : creationErrorKey(/** @type {any} */ (e)));
    } finally {
      busy = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    } else if (e.key === 'Enter' && step === 'choice' && /** @type {HTMLElement} */ (e.target).tagName === 'INPUT') {
      e.preventDefault();
      next();
    }
  }

  /** @param {HTMLElement} node */
  function focusFirst(node) {
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('input'))?.select());
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="od-new-logbook" onkeydown={keydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="od-new-logbook--scrim" onclick={onclose}></div>
  <div class="od-new-logbook--surface" role="dialog" aria-modal="true" aria-labelledby="od-new-logbook-title" use:focusFirst>
    {#if step === 'choice'}
      <p class="od-new-logbook--step">{t('desktopLogbooks.new.step', { n: 1 })}</p>
      <h2 id="od-new-logbook-title" class="od-new-logbook--title">{t('desktopLogbooks.new.title')}</h2>
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
      <div class="od-new-logbook--actions">
        <button type="button" class="od-new-logbook--text-button" onclick={onclose}>{t('desktopLogbooks.new.cancel')}</button>
        <button type="button" class="od-new-logbook--button" disabled={!nameValid || busy} onclick={next}>{t('desktopLogbooks.new.continue')}</button>
      </div>
    {:else if step === 'cloud'}
      <p class="od-new-logbook--step">{t('desktopLogbooks.new.stepNamed', { name: name.trim() })}</p>
      <h2 id="od-new-logbook-title" class="od-new-logbook--title">{t('desktopLogbooks.new.cloud')}</h2>
      <p class="od-new-logbook--intro">{t('desktopLogbooks.new.cloudIntro')}</p>
      <div role="radiogroup" aria-label={t('desktopLogbooks.new.cloud')} class="od-new-logbook--rows">
        {#each providers as id (id)}
          {@const row = providerRow(statusOf(id), signingIn === id, t)}
          <ChoiceRow name="od-new-logbook-provider" selected={provider === id} disabled={row.state === 'unavailable' || (!!signingIn && signingIn !== id)} onselect={() => chooseProvider(id)}>
            <!-- A neutral square: the services' official logos are added from their brand files (task 173 report). -->
            <span class="od-new-logbook--logo" data-provider={id}><Icon name="cloud" size={20} /></span>
            <span class="od-new-logbook--row-title od-new-logbook--grow">{t(`desktopLogbooks.source.${id}`)}</span>
            <span class="od-new-logbook--status" class:od-new-logbook--status-connected={row.state === 'connected'}>{row.text}</span>
          </ChoiceRow>
        {/each}
      </div>
      {#if provider && !isConnected(provider)}
        <button type="button" class="od-new-logbook--secondary od-new-logbook--sign-in" onclick={() => (signingIn ? cancelSignIn() : signIn(provider))}>{signingIn ? t('desktopCloud.cancelSignIn') : t('desktopCloud.signIn', { service: t(`desktopLogbooks.source.${provider}`) })}</button>
      {:else if isConnected(provider)}
        <button type="button" class="od-new-logbook--text-button od-new-logbook--sign-out" onclick={signOut}>{t('desktopCloud.signOut', { service: t(`desktopLogbooks.source.${provider}`) })}</button>
      {/if}
      <label class="od-new-logbook--label" for="od-new-logbook-folder">{t('desktopLogbooks.new.folderLabel')}</label>
      <input id="od-new-logbook-folder" class="od-new-logbook--input" class:od-new-logbook--invalid={!!folderCheck.error} type="text" bind:value={folder} placeholder={t('desktopCloud.folderPlaceholder')} disabled={!isConnected(provider)} autocomplete="off" spellcheck="false" aria-invalid={!!folderCheck.error} />
      {#if folderCheck.error}
        <p class="od-new-logbook--error od-new-logbook--error-small" role="alert">{folderCheck.error}</p>
      {:else if provider}
        <p class="od-new-logbook--help">{t('desktopCloud.folderHelp', { file: fileNameFor(name), service: t(`desktopLogbooks.source.${provider}`) })}</p>
      {/if}
      {#if error}<p class="od-new-logbook--error" role="alert">{error}</p>{/if}
      <div class="od-new-logbook--actions">
        <button type="button" class="od-new-logbook--text-button" onclick={() => (step = 'choice')}>{t('desktopLogbooks.new.back')}</button>
        <button type="button" class="od-new-logbook--button" disabled={!cloudReady || busy} onclick={create}>{busy ? t('desktopLogbooks.new.creating') : t('desktopLogbooks.new.create')}</button>
      </div>
    {:else}
      <p class="od-new-logbook--step">{t('desktopLogbooks.new.stepNamed', { name: name.trim() })}</p>
      <h2 id="od-new-logbook-title" class="od-new-logbook--title">{t('desktopLogbooks.new.git')}</h2>
      <label class="od-new-logbook--label" for="od-new-logbook-url">{t('desktopLogbooks.new.gitUrl')}</label>
      <input id="od-new-logbook-url" class="od-new-logbook--input" class:od-new-logbook--invalid={!!urlCheck.error} type="url" bind:value={url} placeholder={t('desktopLogbooks.new.gitUrlPlaceholder')} autocomplete="off" spellcheck="false" aria-invalid={!!urlCheck.error} />
      {#if urlCheck.error}<p class="od-new-logbook--error od-new-logbook--error-small" role="alert">{urlCheck.error}</p>{/if}
      <label class="od-new-logbook--label" for="od-new-logbook-username">{t('desktopFollowups.newLogbook.gitUsername')}</label>
      <input id="od-new-logbook-username" class="od-new-logbook--input" class:od-new-logbook--invalid={!!userCheck.error} type="text" bind:value={username} oninput={() => (userTyped = username.trim() !== '')} autocomplete="off" spellcheck="false" aria-invalid={!!userCheck.error} />
      {#if userCheck.error}<p class="od-new-logbook--error od-new-logbook--error-small" role="alert">{userCheck.error}</p>{:else}<p class="od-new-logbook--help">{t('desktopFollowups.newLogbook.gitUsernameHelp')}</p>{/if}
      <label class="od-new-logbook--label" for="od-new-logbook-branch">{t('desktopLogbooks.new.gitBranch')}</label>
      <input id="od-new-logbook-branch" class="od-new-logbook--input" type="text" bind:value={branch} autocomplete="off" spellcheck="false" />
      <label class="od-new-logbook--label" for="od-new-logbook-token">{t('desktopLogbooks.new.gitToken')}</label>
      <input id="od-new-logbook-token" class="od-new-logbook--input" type="password" bind:value={token} autocomplete="off" spellcheck="false" />
      <p class="od-new-logbook--help">
        {t('desktopLogbooks.new.gitTokenHelp')}
        <a href={tokenPageUrl(url)} target="_blank" rel="noopener">{t('desktopLogbooks.new.gitTokenLink')}</a>
      </p>
      <p class="od-new-logbook--note"><Icon name="info" size={18} /><span>{t('desktopLogbooks.new.gitNote')}</span></p>
      {#if error}<p class="od-new-logbook--error" role="alert">{error}</p>{/if}
      <div class="od-new-logbook--actions">
        <button type="button" class="od-new-logbook--text-button" onclick={() => (step = 'choice')}>{t('desktopLogbooks.new.back')}</button>
        <button type="button" class="od-new-logbook--button" disabled={!gitReady || busy} onclick={create}>{busy ? t('desktopLogbooks.new.creating') : t('desktopLogbooks.new.create')}</button>
      </div>
    {/if}
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
    .od-new-logbook--surface {
      position: relative;
      box-sizing: border-box;
      width: min(560px, calc(100% - 48px));
      max-height: calc(100% - 48px);
      overflow-x: hidden;
      overflow-y: auto;
      padding: 24px;
      border-radius: 28px;
      background: var(--od-dialog);
      color: var(--od-text);
      outline: none;
    }
    .od-new-logbook--step {
      margin: 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
    .od-new-logbook--title {
      margin: 0 0 16px;
      font-family: var(--od-title-font);
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
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
    .od-new-logbook--input {
      box-sizing: border-box;
      width: 100%;
      height: 50px;
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
    .od-new-logbook--input:disabled {
      opacity: 0.38;
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
      margin: 20px 0 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
    }
    .od-new-logbook--rows {
      display: flex;
      flex-direction: column;
      gap: 4px;
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
    .od-new-logbook--status-connected {
      color: var(--od-text);
    }
    .od-new-logbook--sign-in {
      margin-top: 12px;
      height: 40px;
    }
    .od-new-logbook--sign-out {
      margin-top: 8px;
      padding: 0;
      height: auto;
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
      margin-top: 24px;
    }
    .od-new-logbook--button,
    .od-new-logbook--secondary,
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
    .od-new-logbook--secondary {
      flex: none;
      height: 50px;
      background: var(--od-surface-2);
      color: var(--od-text);
    }
    .od-new-logbook--text-button {
      background: transparent;
      color: var(--od-selected);
      font-weight: 600;
    }
    .od-new-logbook--button:disabled,
    .od-new-logbook--secondary:disabled {
      opacity: 0.38;
      cursor: default;
    }
    .od-new-logbook--button:focus-visible,
    .od-new-logbook--secondary:focus-visible,
    .od-new-logbook--text-button:focus-visible {
      outline: 2px solid var(--od-action);
      outline-offset: 2px;
    }
  }
</style>
