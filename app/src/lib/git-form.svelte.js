// @ts-check
// The state and the questions of the git form (docs/mockups/android-premier-lancement-alpha-git*.dc.html,
// git-config-*-android.dc.html; spec, section 4, "Own git repository instead of the cloud"). One controller
// serves every screen of the form: the first launch's step page, Compte, and the layouts of the tablets and
// the iPhone (pages/GitRepository.svelte), so that they all ask the same questions in the same way.
// - When the address field loses its focus, the server is asked for the references of the repository
//   (git ls-remote): found / private or missing / no git answer.
// - With the user name and the token, the same question authenticated (as for a push) confirms the repository
//   and the right to write, and lists the branches; refused: the token field is in error. An empty repository
//   offers "main". The branch list is dimmed until then.
// - Opened from Account ("Modifier le dépôt"), the fields hold the connected repository; the token stays empty
//   to keep the saved one.
// The token stays in this form: it is only passed to the plugin, never kept, stored or logged here.
// Create it while a component initialises (it uses effects).
import { OpenDivesCore } from 'opendives-core';
import { errorCode } from './account.js';
import { normaliseGitUrl, validGitToken, validGitUsername } from './account-validation.js';
import { liveError } from './live-validation.svelte.js';
import { t } from './i18n.js';
import { branchWaitingKey, repositoryLabel, repositoryName } from './git-address.js';

export { repositoryLabel, repositoryName, branchWaitingKey };

/**
 * @param {{
 *   edit?: boolean,
 *   onconnected?: (done: { repository: string, branch: string, empty: boolean }) => void|Promise<void>,
 *   pending?: () => Promise<string>,
 * }} [options]
 *   edit: the fields hold the connected repository. onconnected: called once gitConnect has succeeded (the
 *   page decides what follows: the download screen, or the logbook). pending: edit only, sends the changes
 *   that are not sent yet and answers an error text when some remain.
 */
export function createGitForm({ edit = false, onconnected = () => {}, pending } = {}) {
  let url = $state('');
  let username = $state('');
  let token = $state('');
  let branch = $state('');
  /** @type {string[]} */
  let branches = $state([]);
  let emptyRepo = $state(false);
  /** The branch of the connected repository, preselected when editing. */
  let currentBranch = '';

  let addressState = $state(/** @type {'idle'|'checking'|'public'|'publicEmpty'|'private'|'none'|'notHttps'|'invalid'} */ ('idle'));
  let accessState = $state(/** @type {'idle'|'checking'|'ok'|'denied'} */ ('idle'));
  let formError = $state('');
  let busy = $state(false);
  /** Increases at each question, so that an answer that arrives late is ignored. */
  let ticket = 0;

  const addressFailed = $derived(addressState === 'none' || addressState === 'notHttps' || addressState === 'invalid');
  const addressError = $derived(
    addressState === 'none'
      ? t('gitRepo.addressNone')
      : addressState === 'notHttps'
        ? t('gitRepo.addressNotHttps')
        : addressState === 'invalid'
          ? t('gitRepo.addressInvalid')
          : '',
  );
  // The form of each field is checked as the diver types (lib/account-validation.js); what only the server
  // knows (the repository exists, the token is accepted) comes after.
  const addressLive = liveError(
    () => url,
    (text) => (!/^https:\/\//i.test(text.trim()) ? t('gitRepo.addressNotHttps') : normaliseGitUrl(text) ? '' : t('gitRepo.addressInvalid')),
  );
  const addressShown = $derived(addressError || addressLive.error);
  const usernameLive = liveError(() => username, (text) => (validGitUsername(text.trim()) ? '' : t('gitRepo.usernameInvalid')));
  const tokenLive = liveError(() => token, (text) => (validGitToken(text.trim()) ? '' : t('gitRepo.tokenInvalid')));
  const tokenError = $derived(accessState === 'denied' ? t('gitRepo.tokenDenied') : tokenLive.error);
  const canConnect = $derived(accessState === 'ok' && !!branch && !busy);

  /** The address field lost its focus (or was filled): the anonymous question. */
  async function checkAddress() {
    const mine = ++ticket;
    resetAccess();
    const address = url.trim();
    if (!address) {
      addressState = 'idle';
      return;
    }
    if (!/^https:\/\//i.test(address)) {
      addressState = 'notHttps';
      return;
    }
    addressState = 'checking';
    try {
      const found = await OpenDivesCore.gitCheck({ url: address });
      if (mine !== ticket) return;
      addressState =
        found.status === 'public' ? (found.empty ? 'publicEmpty' : 'public') : found.status === 'auth' ? 'private' : 'none';
    } catch (e) {
      if (mine !== ticket) return;
      addressState = errorCode(e) === 'BAD_ADDRESS' ? 'invalid' : 'none';
    }
    if (!addressFailed) await checkAccess();
  }

  /** Address, user name or token changed: the access has to be checked again. */
  function resetAccess() {
    accessState = 'idle';
    branches = [];
    emptyRepo = false;
    branch = '';
    formError = '';
  }

  /**
   * The authenticated question, once the address holds a repository, and the user name and the token are
   * there: confirms the access and lists the branches.
   */
  async function checkAccess() {
    resetAccess();
    const name = username.trim();
    const secret = token.trim();
    if (addressFailed || addressState === 'idle' || addressState === 'checking') return;
    if (!name || !validGitUsername(name) || (secret ? !validGitToken(secret) : !edit)) return;
    const mine = ++ticket;
    accessState = 'checking';
    try {
      const found = await OpenDivesCore.gitCheck({ url: url.trim(), username: name, token: secret, useStored: edit && !secret });
      if (mine !== ticket) return;
      if (found.status === 'ok') {
        emptyRepo = found.empty;
        branches = found.empty ? ['main'] : found.branches;
        branch = branches.includes(currentBranch) ? currentBranch : branches.includes('main') ? 'main' : (branches[0] ?? '');
        accessState = 'ok';
      } else if (found.status === 'denied') {
        accessState = 'denied';
      } else {
        accessState = 'idle';
        addressState = 'none';
      }
    } catch (e) {
      if (mine !== ticket) return;
      accessState = 'idle';
      formError = errorCode(e) === 'BAD_CREDENTIALS' ? t('gitRepo.tokenDenied') : t('gitRepo.errorNetwork');
    }
  }

  async function connect() {
    if (!canConnect) return;
    if (pending) {
      const problem = await pending();
      if (problem) {
        formError = problem;
        return;
      }
    }
    busy = true;
    formError = '';
    try {
      await OpenDivesCore.gitConnect({ url: url.trim(), username: username.trim(), token: token.trim(), branch, empty: emptyRepo });
      token = '';
    } catch (e) {
      busy = false;
      const code = errorCode(e);
      if (code === 'DENIED') accessState = 'denied';
      else if (code === 'NETWORK') formError = t('gitRepo.errorNetwork');
      else if (code === 'NO_LOG' || code === 'LOG_EXISTS' || code === 'NOT_EMPTY') {
        formError = t('gitRepo.errorNoLog');
        accessState = 'idle';
      } else formError = t('gitRepo.errorFailed');
      return;
    }
    try {
      await onconnected({ repository: url.trim(), branch, empty: emptyRepo });
    } finally {
      busy = false;
    }
  }

  /** Editing: the fields hold the connected repository. */
  async function load() {
    if (!edit) return;
    try {
      const saved = await OpenDivesCore.gitConfig();
      url = saved.url;
      username = saved.username;
      currentBranch = saved.branch;
      await checkAddress();
    } catch (e) {
      console.error('Reading the connected repository', e);
    }
  }

  const branchHelper = $derived(
    accessState !== 'ok'
      ? t(branchWaitingKey(addressState))
      : emptyRepo
        ? t('gitRepo.branchEmpty', { name: 'main' })
        : t('gitRepo.branchesRead', { n: branches.length, list: branches.join(', ') }),
  );

  return {
    edit,
    get url() { return url; },
    set url(v) { url = v; },
    get username() { return username; },
    set username(v) { username = v; },
    get token() { return token; },
    set token(v) { token = v; },
    get branch() { return branch; },
    set branch(v) { branch = v; },
    get branches() { return branches; },
    get emptyRepo() { return emptyRepo; },
    get addressState() { return addressState; },
    get accessState() { return accessState; },
    get formError() { return formError; },
    get busy() { return busy; },
    get addressShown() { return addressShown; },
    get usernameError() { return usernameLive.error; },
    get tokenError() { return tokenError; },
    get canConnect() { return canConnect; },
    get branchHelper() { return branchHelper; },
    checkAddress,
    checkAccess,
    connect,
    load,
  };
}
