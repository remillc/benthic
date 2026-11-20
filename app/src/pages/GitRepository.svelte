<script>
  // @ts-check
  // "Votre propre dépôt git" (docs/mockups/android-premier-lancement-alpha-git*.dc.html,
  // git-config-*-android.dc.html; spec, section 4, "Own git repository instead of the cloud"): the logbook in
  // the user's own git repository.
  // - Android phone (task 2026-11-16-247): one form, components/GitForm.svelte, under the hatched band of the
  //   first launch (« Retour », the title, the About link) or under the app bar « ← Votre propre dépôt git »
  //   of Compte. Connecting from the first launch goes through the download screen (FirstDownload), then the
  //   logbook opens with a snackbar.
  // - Android tablet, first launch (task 2026-11-16-257; docs/mockups/android-tablette-premier-lancement-alpha-git-*.dc.html):
  //   the same form in the step column of the first launch, beside or under the blue panel (EditorialPage
  //   firstLaunch), « Connecter » the page's own button. « Comment créer un dépôt » and « Comment créer un jeton
  //   d'accès » replace the form in that column (components/GitHelp.svelte), « Retour » brings the form back with its
  //   fields as they were (the state is the controller's); the panel does not move.
  // - Tablets (account flow) and iPhone: the editorial layout of the account flow (EditorialPage): the fields in
  //   its card, « Connecter » its main action.
  // The questions to the server and the state are the same in both (lib/git-form.svelte.js).
  import { onMount, tick } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import AccountField from '../components/AccountField.svelte';
  import EditorialPage from '../components/EditorialPage.svelte';
  import GitForm from '../components/GitForm.svelte';
  import GitHelp from '../components/GitHelp.svelte';
  import SelectField from '../components/SelectField.svelte';
  import Icon from '../components/Icon.svelte';
  import { createGitForm } from '../lib/git-form.svelte.js';
  import { repositoryName } from '../lib/git-address.js';
  import { accountReady, deviceDiveCount, importDeviceDives, logbook, repositoryChanged, syncNow } from '../lib/logbook.svelte.js';
  import { ios, layout, desktopApp } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, welcome?: boolean, edit?: boolean }} */
  let { f7router, welcome = false, edit = false } = $props();

  /** The Android phone's form (task 2026-11-16-247); never the desktop app's, which can be a few pixels under 768 dp wide (task 2026-11-16-242). */
  const phone = $derived(!ios && layout.phone && !desktopApp);
  /** The first launch of an Android tablet and of the desktop app: the form in the step column beside the blue panel (task 2026-11-16-257). */
  const panelled = $derived(welcome && !ios && !phone);
  /** The help shown in the column in place of the form, on a tablet. @type {'repository'|'token'|null} */
  let help = $state(null);

  // The route decides `edit` once: the page is not reused for another mode.
  // svelte-ignore state_referenced_locally
  const form = createGitForm({
    edit,
    pending: edit
      ? async () => {
          if (logbook.pending > 0) await syncNow();
          return logbook.pending > 0 ? t('gitRepo.pending') : '';
        }
      : undefined,
    onconnected: async ({ repository, empty }) => {
      if (welcome && !ios && !empty) {
        // The logbook of the repository comes down on the download screen, then the snackbar says where it stays.
        f7router.navigate('/welcome/git/downloading', { props: { git: true, repository, branch: form.branch } });
        return;
      }
      showSnackbar(t('gitRepo.connected', { repository: repositoryName(repository) }));
      if (edit) {
        f7router.back(f7router.history[0], { force: true });
        repositoryChanged();
      } else if (welcome) {
        accountReady();
      } else {
        // From Account without an account (task 2026-11-14-135): back to Account, the
        // repository's logbook loaded, then the dives of this device added and sent there.
        f7router.back(f7router.history[0], { force: true });
        await accountReady();
        if ((await deviceDiveCount()) > 0) await importDeviceDives();
      }
    },
  });

  /**
   * @param {'repository'|'token'} which
   * @param {MouseEvent} e
   */
  function openHelp(which, e) {
    e.preventDefault();
    if (panelled) {
      help = which;
      // The keyboard goes with the diver to « Retour ».
      tick().then(() => /** @type {HTMLElement|null} */ (document.querySelector('.bc-git-repository .bc-editorial-page--retour'))?.focus());
      return;
    }
    f7router.navigate(`${welcome ? '/welcome' : '/account'}/git/${which === 'token' ? 'token' : 'repository'}`);
  }

  /** « Retour » in the help: the form comes back, the focus on the link that opened the help. */
  function closeHelp() {
    const which = help;
    help = null;
    tick().then(() => /** @type {HTMLElement|null} */ (document.querySelector(`.bc-git-repository .bc-git-form--link-${which}`))?.focus());
  }

  onMount(form.load);

  const heading = $derived(t('gitRepo.titlePhone'));
</script>

{#if phone && welcome}
  <EditorialPage class="bc-git-repository"
    firstLaunch
    helpLink
    title={heading}
    {heading}
    intro=""
    busy={form.busy}
    busyLabel={t('gitRepo.connecting')}
    onaction={form.connect}
  >
    <GitForm {form} onhelp={openHelp} />
  </EditorialPage>
{:else if panelled}
  <EditorialPage class="bc-git-repository"
    firstLaunch
    helpLink={!help}
    title={heading}
    heading={help ? t(help === 'token' ? 'tokenHelp.title' : 'repoHelp.title') : heading}
    intro=""
    action={help ? '' : t('gitRepo.connect')}
    busy={form.busy}
    busyLabel={t('gitRepo.connecting')}
    actionDisabled={!form.canConnect}
    onaction={form.connect}
    onback={help ? closeHelp : undefined}
  >
    {#if help}
      <GitHelp kind={help} embedded />
    {:else}
      <GitForm {form} onhelp={openHelp} action={false} />
    {/if}
  </EditorialPage>
{:else if phone}
  <Page class="bc-git-repository bc-git-repository--compte">
    <Navbar title={heading}>
      {#snippet left()}
        <Link back iconOnly>
          <i class="icon icon-back"></i>
          <span class="bc-sr-only">{t('detail.back')}</span>
        </Link>
      {/snippet}
    </Navbar>
    <form
      class="bc-git-repository--compte-body"
      novalidate
      onsubmit={(e) => {
        e.preventDefault();
        form.connect();
      }}
    >
      <GitForm {form} onhelp={openHelp} />
    </form>
  </Page>
{:else}
<EditorialPage class="bc-git-repository"
  helpLink={welcome}
  title={t('gitRepo.title')}
  heading={t('gitRepo.heading')}
  intro={t('gitRepo.intro')}
  action={t('gitRepo.connect')}
  busyLabel={t('gitRepo.connecting')}
  busy={form.busy}
  actionDisabled={!form.canConnect}
  onaction={form.connect}
>
  <AccountField
    label={t('gitRepo.address')}
    rowLabel={t('gitRepo.address')}
    bind:value={form.url}
    error={form.addressShown}
    disabled={form.busy}
    position="single"
    onchange={form.checkAddress}
  />
  {#if form.addressState === 'checking'}
    <p class="bc-git-repository--status">{t('gitRepo.addressChecking')}</p>
  {:else if form.addressState === 'public' || form.addressState === 'publicEmpty'}
    <p class="bc-git-repository--status bc-git-repository--ok"><Icon name="check" size={16} />{t(form.addressState === 'public' ? 'gitRepo.addressPublic' : 'gitRepo.addressPublicEmpty')}</p>
  {:else if form.addressState === 'private'}
    <p class="bc-git-repository--status"><Icon name="info" size={16} />{t('gitRepo.addressPrivate')}</p>
  {/if}

  <AccountField
    label={t('gitRepo.username')}
    rowLabel={t('gitRepo.username')}
    autocomplete="username"
    bind:value={form.username}
    error={form.usernameError}
    disabled={form.busy}
    position="first"
    onchange={form.checkAccess}
  />
  <AccountField
    label={t('gitRepo.token')}
    rowLabel={t('gitRepo.token')}
    type="password"
    autocomplete="off"
    bind:value={form.token}
    supporting={form.accessState === 'checking' ? t('gitRepo.tokenChecking') : form.edit ? t('gitRepo.tokenKeep') : t('gitRepo.tokenHelper')}
    error={form.tokenError}
    disabled={form.busy}
    position="last"
    onchange={form.checkAccess}
  />
  <a href="/git/token" class="bc-git-repository--help" onclick={(e) => openHelp('token', e)}>{t('gitRepo.tokenHow')}</a>

  <SelectField
    label={t('gitRepo.branch')}
    bind:value={form.branch}
    options={form.branches.map((b) => ({ value: b, label: b }))}
    supporting={form.branchHelper}
    disabled={form.accessState !== 'ok' || form.busy}
  />

  {#if form.formError}<p class="bc-git-repository--form-error" role="alert"><Icon name="error" size={18} />{form.formError}</p>{/if}

  <p class="bc-git-repository--note">{t('gitRepo.note')}</p>
</EditorialPage>
{/if}

<style>
  @layer od.components {
    /* Android phone, first launch: the sentence under the title is the form's (8 dp under it). */
    :global(.bc-git-repository .bc-editorial-page--band-body .bc-editorial-page--title) {
      margin-bottom: 0;
    }

    /* Android phone, Compte: under the app bar, the same 16 dp sides as the first launch. */
    .bc-git-repository--compte-body {
      padding: 8px 16px calc(var(--f7-safe-area-bottom) + 24px);
    }

    .bc-git-repository--status {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--bc-text-2);
      display: flex;
      align-items: center;
      gap: 6px;

      /* The one green of the theme (the check mark of a found repository). */
      &.bc-git-repository--ok :global(svg) {
        color: var(--bc-oxygen);
      }

      :global(.ios) & {
        margin: 4px 32px 0;
      }
    }

    .bc-git-repository--help {
      margin: 8px 0 0;
      padding: 8px 16px;
      display: inline-block;
      font-size: 14px;
      font-weight: 500;
      color: var(--bc-text);
      text-decoration: underline;

      :global(.ios) & {
        margin: 8px 16px 0;
        padding: 8px 0;
      }
    }

    .bc-git-repository--form-error {
      margin: 16px 16px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-alarm);
      display: flex;
      align-items: flex-start;
      gap: 8px;

      :global(.ios) & {
        margin: 16px 24px 0;
      }
    }

    /* The note: plain text, no background. */
    .bc-git-repository--note {
      margin: 16px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);

      :global(.ios) & {
        margin: 24px 24px 0;
      }
    }
  }
</style>
