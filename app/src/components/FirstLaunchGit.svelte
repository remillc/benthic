<script>
  // @ts-check
  // The git step of the release edition's first launch (task 2026-11-15-218; mock-ups
  // android-tablette-premier-lancement-production-git-paysage and -ouvrir-git-paysage): the address, the
  // branch and the access token, then « Créer le carnet » (the repository must be empty) or « Ouvrir le carnet »
  // (it must hold a logbook). Same calls as the beta's git setup (pages/GitRepository.svelte): git_check, then
  // git_connect. The form has no user name: the token is sent with the first segment of the address as its user
  // name (GitHub, GitLab and Gitea accept any name with a token). The token stays in this field, passed to the
  // plugin and cleared; nothing is stored here.
  import { OpenDivesCore } from 'opendives-core';
  import ReleaseField from './ReleaseField.svelte';
  import Icon from './Icon.svelte';
  import { errorCode } from '../lib/account.js';
  import { normaliseGitUrl, validGitToken, validGitUsername } from '../lib/account-validation.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { accountReady } from '../lib/logbook.svelte.js';
  import { flow } from '../lib/first-launch.svelte.js';
  import { gitProblem, gitProblemFromCode, gitUserName } from '../lib/first-launch-git.js';
  import { deviceKey } from '../lib/first-launch-phone.js';
  import { layout, desktopApp } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   create: boolean,
   *   router: any,
   *   afterConnect?: () => Promise<unknown>,
   *   onswitch?: () => void,
   *   onconnect?: (access: { url: string, username: string, branch: string, token: string }) => Promise<unknown>,
   * }}
   * `create`: the repository must be empty (a new logbook); otherwise it must hold a logbook. `afterConnect`
   * runs once the logbook is open (the imported dives, the label). `onswitch`: the link to the other path
   * (« Ouvrir mon carnet OpenDives » when creating, « Créer un carnet » when opening). `onconnect` replaces the
   * connection and what follows it (the desktop app's window without a logbook, whose main process creates the
   * logbook from the address, the branch and the token: task 2026-11-16-228); what it throws is told as below.
   */
  let { create, router, afterConnect, onswitch, onconnect } = $props();

  let url = $state('');
  let branch = $state('main');
  let token = $state('');
  let busy = $state(false);
  let formError = $state('');
  /** The repository does not fit the path: told under the address, with the link to the other path. */
  let problem = $state(/** @type {''|'notEmpty'|'noLogbook'} */ (flow.gitProblem));
  const problemText = $derived(problem === 'notEmpty' ? t('welcomeSteps.gitNotEmpty') : problem === 'noLogbook' ? t('welcomeSteps.gitEmptyOpen') : '');
  const hint = $derived(
    problem ? t(problem === 'notEmpty' ? 'welcomeSteps.gitNotEmptyHint' : 'welcomeSteps.gitEmptyOpenHint').split('{link}') : [],
  );
  const switchText = $derived(t(create ? 'welcomeSteps.openTitle' : 'welcomeSteps.createTitle'));
  /** Typing again clears what was told about the repository. */
  const edited = () => {
    problem = '';
    formError = '';
  };

  const addressLive = liveError(
    () => url,
    (text) => (!/^https:\/\//i.test(text.trim()) ? t('gitRepo.addressNotHttps') : normaliseGitUrl(text) ? '' : t('gitRepo.addressInvalid')),
  );
  const tokenLive = liveError(() => token, (text) => (validGitToken(text.trim()) ? '' : t('gitRepo.tokenInvalid')));
  const ready = $derived(!!url.trim() && !!branch.trim() && !!token.trim() && !addressLive.error && !tokenLive.error && !busy);

  async function run() {
    if (!ready) return;
    busy = true;
    formError = '';
    problem = '';
    try {
      const address = url.trim();
      const username = gitUserName(address, validGitUsername);
      const found = await OpenDivesCore.gitCheck({ url: address, username, token: token.trim() });
      if (found.status === 'denied') {
        formError = t('gitRepo.tokenDenied');
        return;
      }
      if (found.status !== 'ok') {
        formError = t('gitRepo.addressNone');
        return;
      }
      if (create && !found.empty) {
        problem = gitProblem(create, found);
        return;
      }
      if (!create && found.empty) {
        problem = gitProblem(create, found);
        return;
      }
      if (!create && !found.branches.includes(branch.trim())) {
        formError = t('welcomeSteps.gitBranchMissing');
        return;
      }
      if (onconnect) {
        await onconnect({ url: address, username, branch: branch.trim(), token: token.trim() });
        token = '';
        return;
      }
      await OpenDivesCore.gitConnect({ url: address, username, token: token.trim(), branch: branch.trim(), empty: !!found.empty });
      token = '';
      await accountReady();
      await afterConnect?.();
    } catch (e) {
      const code = errorCode(e);
      if (code === 'DENIED' || code === 'BAD_CREDENTIALS') formError = t('gitRepo.tokenDenied');
      else if (code === 'NETWORK') formError = t('gitRepo.errorNetwork');
      else if (code === 'BAD_ADDRESS') formError = t('gitRepo.addressInvalid');
      else if (gitProblemFromCode(create, code)) problem = gitProblemFromCode(create, code);
      else formError = t('gitRepo.errorFailed');
    } finally {
      busy = false;
    }
  }

  /** @param {MouseEvent} e */
  function tokenHelp(e) {
    e.preventDefault();
    router.navigate('/welcome/git/token');
  }

  /** @param {MouseEvent} e */
  function switchPath(e) {
    e.preventDefault();
    onswitch?.();
  }

  const note = $derived(t('welcomeSteps.gitNote').split('{link}'));
</script>

<div class="od-first-launch-git">
  <ReleaseField label={t('welcomeSteps.gitAddress')} bind:value={url} mono error={addressLive.error || problemText} disabled={busy} autocomplete="url" oninput={edited} />
  <div class="od-first-launch-git--pair">
    <ReleaseField class="od-first-launch-git--branch" label={t('welcomeSteps.gitBranch')} bind:value={branch} mono disabled={busy} oninput={edited} />
    <ReleaseField class="od-first-launch-git--token" label={t('welcomeSteps.gitToken')} bind:value={token} type="password" error={tokenLive.error} disabled={busy} />
  </div>
  {#if problem}
    <!-- The repository does not fit this path (mock-ups …-git-erreur-paysage, …-ouvrir-git-erreur-paysage). -->
    <p class="od-first-launch-git--hint">{hint[0]}<a href={create ? '/welcome/open' : '/welcome/new'} class="od-first-launch-git--link" onclick={switchPath}>{switchText}</a>{hint[1]}</p>
  {:else}
    <div class="od-first-launch-git--token-help">
      <span>{t(deviceKey('welcomeSteps.gitTokenHelp', layout.phone, desktopApp))}</span>
      <a href="/welcome/git/token" class="od-first-launch-git--link" onclick={tokenHelp}>{t('welcomeSteps.gitTokenLink')}</a>
    </div>

    {#if create}
      <p class="od-first-launch-git--note">
        <span class="od-first-launch-git--note-icon"><Icon name="info" size={20} /></span>
        <span>{note[0]}<a href="/welcome/open" class="od-first-launch-git--link od-first-launch-git--inline" onclick={switchPath}>{t('welcomeSteps.openTitle')}</a>{note[1]}</span>
      </p>
    {/if}
  {/if}
  {#if formError}<p class="od-first-launch-git--error" role="alert">{formError}</p>{/if}

  <button type="button" class="od-first-launch-git--action" disabled={!ready} aria-busy={busy} onclick={run}>
    {busy ? t(create ? 'welcomeSteps.creating' : 'welcomeSteps.opening') : t(create ? 'welcomeSteps.createLogbook' : 'welcomeSteps.openLogbook')}
  </button>
</div>

<style>
  @layer od.components {
    .od-first-launch-git {
      display: flex;
      flex-direction: column;
    }

    .od-first-launch-git--pair {
      display: flex;
      gap: 12px;

      :global(.od-first-launch-git--branch) {
        width: 160px;
        flex: none;
      }

      :global(.od-first-launch-git--token) {
        flex: 1;
      }
    }

    .od-first-launch-git--token-help {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin: 4px 0 0 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-first-launch-git--hint {
      margin: 6px 0 0 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-first-launch-git--link {
      color: var(--od-release-row-main);
      text-decoration: underline;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          color: var(--od-release-row-main-hover);
        }
      }
    }

    .od-first-launch-git--inline {
      text-underline-offset: 2px;
      white-space: nowrap;
    }

    .od-first-launch-git--note {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin: 18px 0 0;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--od-release-note);
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text);
    }

    .od-first-launch-git--note-icon {
      flex: none;
      display: flex;
      color: var(--od-release-row-main);
    }

    .od-first-launch-git--error {
      margin: 14px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-alarm);
    }

    .od-first-launch-git--action {
      width: auto;
      align-self: flex-end;
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
        opacity: 0.38;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          opacity: 0.88;
        }
      }
    }

/* Phone (task 2026-11-16-227): the button takes the width of the column. */
    @media (max-width: 767.98px) {
      .od-first-launch-git--action {
        align-self: stretch;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-first-launch-git--action {
        transition: none;
      }
    }
  }
</style>
