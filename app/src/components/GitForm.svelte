<script>
  // @ts-check
  // The git form of Android phones, one component for the first launch's step page and for Compte
  // (task 2026-11-16-247; docs/mockups/android-premier-lancement-alpha-git*.dc.html and
  // git-config-*-android.dc.html): the sentence that says what it is for, the link to « Comment créer un dépôt »,
  // the address (checked when it loses the focus), the user name, the token with its link, the branch and
  // « Connecter ». The title is the page's: the hatched band's heading on the first launch, the app bar's
  // title in Compte. The state is the controller's (lib/git-form.svelte.js).
  //
  // Spacing, MD3 4 dp grid: 8 dp title to sentence (the page), 16 dp sentence to link to first field, 16 dp
  // between fields, 4 dp field to help line, the token link 4 dp under the token help line, 24 dp before
  // « Connecter ». Every link keeps a 48 dp touch target; only the visible gaps are those.
  import AccountField from './AccountField.svelte';
  import SelectField from './SelectField.svelte';
  import Icon from './Icon.svelte';
  import LoadingIndicator from './LoadingIndicator.svelte';
  import { deviceKey } from '../lib/first-launch.js';
  import { layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   form: ReturnType<typeof import('../lib/git-form.svelte.js').createGitForm>,
   *   onhelp: (which: 'repository'|'token', e: MouseEvent) => void,
   *   action?: boolean,
   * }}
   * action false: no « Connecter » (the page draws its own button).
   */
  let { form, onhelp, action = true } = $props();

  const state = $derived(form.addressState);
</script>

<div class="od-git-form">
  <p class="od-git-form--intro">{t(deviceKey('gitRepo.introPhone', layout.phone))}</p>
  <a href="/git/repository" class="od-git-form--link od-git-form--link-repository" onclick={(e) => onhelp('repository', e)}>{t('gitRepo.repositoryHow')}</a>

  <AccountField
    label={t('gitRepo.address')}
    rowLabel={t('gitRepo.address')}
    outlined
    mono
    bind:value={form.url}
    error={form.addressShown}
    disabled={form.busy}
    onchange={form.checkAddress}
  />
  {#if state === 'checking'}
    <p class="od-git-form--status">{t('gitRepo.addressChecking')}</p>
  {:else if state === 'public' || state === 'publicEmpty'}
    <p class="od-git-form--status od-git-form--ok"><Icon name="check" size={16} />{t(state === 'public' ? 'gitRepo.addressPublic' : 'gitRepo.addressPublicEmpty')}</p>
  {:else if state === 'private'}
    <p class="od-git-form--status"><Icon name="info" size={16} />{t('gitRepo.addressPrivate')}</p>
  {/if}

  <AccountField
    label={t('gitRepo.username')}
    rowLabel={t('gitRepo.username')}
    outlined
    autocomplete="username"
    bind:value={form.username}
    error={form.usernameError}
    disabled={form.busy}
    onchange={form.checkAccess}
  />
  <AccountField
    label={t('gitRepo.token')}
    rowLabel={t('gitRepo.token')}
    outlined
    type="password"
    autocomplete="off"
    bind:value={form.token}
    supporting={form.accessState === 'checking' ? t('gitRepo.tokenChecking') : form.edit ? t('gitRepo.tokenKeep') : t('gitRepo.tokenHelper')}
    error={form.tokenError}
    disabled={form.busy}
    onchange={form.checkAccess}
  />
  <a href="/git/token" class="od-git-form--link od-git-form--link-token" onclick={(e) => onhelp('token', e)}>{t('gitRepo.tokenHow')}</a>

  <SelectField
    outlined
    label={t('gitRepo.branch')}
    bind:value={form.branch}
    options={form.branches.map((b) => ({ value: b, label: b }))}
    supporting={form.branchHelper}
    disabled={form.accessState !== 'ok' || form.busy}
  />

  {#if form.formError}<p class="od-git-form--error" role="alert"><Icon name="error" size={18} />{form.formError}</p>{/if}

  {#if action}
    <button type="submit" class="od-git-form--connect" disabled={!form.canConnect} aria-busy={form.busy}>
      {#if form.busy}<LoadingIndicator size={18} label="" />{t('gitRepo.connecting')}{:else}{t('gitRepo.connect')}{/if}
    </button>
  {/if}
</div>

<style>
  @layer od.components {
    .od-git-form {
      --od-outlined-gap: 16px;
      display: flex;
      flex-direction: column;
    }

    .od-git-form--intro {
      margin: 8px 0 0;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    /* A link: 48 dp target, the visible gaps drawn with negative margins (the text is 19 dp tall). */
    .od-git-form--link {
      align-self: flex-start;
      box-sizing: border-box;
      min-height: 48px;
      display: flex;
      align-items: center;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-code-active);
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          text-decoration-thickness: 2px;
        }
      }

      &.od-git-form--link-repository {
        margin: 2px 0 -14px;
      }

      &.od-git-form--link-token {
        margin: -10px 0 -14px;
        padding: 0 4px 0 16px;
      }
    }

    .od-git-form--status {
      margin: 4px 0 0 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      gap: 4px;

      /* The one green of the theme (the check mark of a found repository). */
      &.od-git-form--ok {
        color: var(--od-oxygen);
      }
    }

    .od-git-form--error {
      margin: 16px 0 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-alarm);
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .od-git-form--connect {
      margin-top: 24px;
      width: 100%;
      height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: 24px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      letter-spacing: 0.1px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;

      @media (hover: hover) {
        &:hover:not(:disabled) {
          background: color-mix(in srgb, var(--od-primary-action) 88%, var(--od-on-primary-action));
        }
      }

      /* MD3 disabled: on-surface at 12 % behind, 38 % in front. */
      &:disabled {
        background: color-mix(in srgb, var(--od-text) 12%, transparent);
        color: color-mix(in srgb, var(--od-text) 38%, transparent);
        cursor: default;
      }
    }
  }
</style>
