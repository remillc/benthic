<script>
  // @ts-check
  // Alpha first launch on a phone, after signing in (task 2026-11-16-233; docs/mockups/
  // android-premier-lancement-beta-compte-subsurface-telechargement.dc.html): the three steps of the
  // download in a white card (connection, the dives with « n sur N » and the wavy indicator, the copy on the
  // phone), the line that says to keep the app open, « Annuler ». When the logbook is there, first launch
  // closes and a snackbar says it stays on the phone. « Annuler » signs the account out again.
  // `git` (task 2026-11-16-247; docs/mockups/android-premier-lancement-alpha-git-telechargement.dc.html): the
  // same screen for a logbook in the diver's own git repository: « Connexion au dépôt » with the repository and
  // the branch, a snackbar that says where it comes from; « Annuler » forgets the access and returns to the form.
  import { onMount } from 'svelte';
  import EditorialPage from '../components/EditorialPage.svelte';
  import Icon from '../components/Icon.svelte';
  import LinearWavyProgress from '../components/LinearWavyProgress.svelte';
  import { announceFirstLaunch, showFailure } from '../lib/account.js';
  import { deviceKey, downloadSteps } from '../lib/first-launch.js';
  import { deviceKind } from '../lib/layout.svelte.js';
  import { downloadAccountLogbook, logbook, signOut } from '../lib/logbook.svelte.js';
  import { repositoryLabel } from '../lib/git-address.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, email?: string, git?: boolean, repository?: string, branch?: string }} */
  let { f7router, email = '', git = false, repository = '', branch = '' } = $props();

  let cancelled = false;
  let cancelling = $state(false);
  const steps = $derived(downloadSteps(logbook.firstDownload?.progress ?? null));
  const count = $derived(logbook.firstDownload && logbook.firstDownload.total ? t('firstLaunch.download.count', { n: logbook.firstDownload.n, total: logbook.firstDownload.total }) : '');
  /** @type {{ key: 'connect'|'dives'|'copy', detail: string }[]} */
  const rows = $derived([
    { key: 'connect', detail: git ? `${repositoryLabel(repository)} · ${branch}` : email },
    { key: 'dives', detail: steps.dives === 'running' ? count : '' },
    { key: 'copy', detail: '' },
  ]);

  onMount(() => {
    downloadAccountLogbook(() => cancelled).then((ok) => {
      if (ok) announceFirstLaunch(git ? 'gitDownloaded' : 'downloaded');
      else if (!cancelled) {
        // The account is signed in, the logbook did not come: back to the sign-in, nothing is lost.
        logbook.error = null;
        showFailure('');
        f7router.back();
      }
    });
  });

  async function cancel() {
    cancelled = true;
    cancelling = true;
    try {
      await signOut();
    } catch (e) {
      console.error('Cancelling the first download', e);
    }
    logbook.error = null;
    cancelling = false;
    f7router.back(git ? '/welcome/git' : '/welcome/sign-in', { force: true });
  }
</script>

<EditorialPage class="bc-first-download"
  firstLaunch
  noRetour
  helpLink
  title={git ? t('gitRepo.titlePhone') : t('signIn.title')}
  heading={git ? t('gitRepo.titlePhone') : t('signIn.heading')}
  intro=""
  secondary={{ label: t('accountStep.cancel'), onclick: cancel, disabled: cancelling }}
  closable={false}
>
  <ol class="bc-first-download--steps" aria-label={t('firstLaunch.download.stepsLabel')}>
    {#each rows as row (row.key)}
      {@const state = steps[row.key]}
      <li class="bc-first-download--state-{state}" aria-current={state === 'running' ? 'step' : undefined}>
        <span class="bc-first-download--mark" aria-hidden="true">
          {#if state === 'done'}
            <span class="bc-first-download--done"><Icon name="check" size={18} weight={2.4} /></span>
          {:else if state === 'running'}
            <span class="bc-first-download--running"><span></span></span>
          {:else}
            <span class="bc-first-download--waiting"></span>
          {/if}
        </span>
        <span class="bc-first-download--text">
          <span class="bc-first-download--label">{t(row.key === 'copy' ? deviceKey('firstLaunch.download.copy', deviceKind()) : row.key === 'connect' && git ? 'firstLaunch.download.gitConnect' : `firstLaunch.download.${row.key}`)}</span>
          {#if row.detail}<span class="bc-first-download--detail">{row.detail}</span>{/if}
          {#if row.key === 'dives' && state === 'running'}
            <span class="bc-first-download--bar">
              <LinearWavyProgress value={steps.value} indeterminate={steps.value <= 0} label={t('firstLaunch.download.progressLabel')} />
            </span>
          {/if}
        </span>
      </li>
    {/each}
  </ol>
  <p class="bc-first-download--note">{t('firstLaunch.download.note')}</p>
</EditorialPage>

<style>
  @layer od.components {
    .bc-first-download--steps {
      margin: 12px 0 0;
      padding: 20px 20px 22px;
      list-style: none;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;

      li {
        display: flex;
        gap: 14px;
        align-items: flex-start;
      }
    }

    .bc-first-download--mark {
      flex: none;
      padding-top: 1px;
      display: flex;
    }

    .bc-first-download--done,
    .bc-first-download--running,
    .bc-first-download--waiting {
      box-sizing: border-box;
      width: 28px;
      height: 28px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-first-download--done {
      background: var(--bc-first-done);
      color: var(--bc-on-first-done);
    }

    .bc-first-download--running {
      border: 3px solid var(--bc-code-active);

      span {
        width: 10px;
        height: 10px;
        border-radius: 5px;
        background: var(--bc-code-active);
      }
    }

    .bc-first-download--waiting {
      border: 2px solid var(--bc-first-pending-ring);
    }

    .bc-first-download--text {
      flex: 1;
      min-width: 0;
      padding-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-first-download--label {
      font-size: 16px;
      line-height: 21px;
      font-weight: 500;
      color: var(--bc-text);

      .bc-first-download--state-running & {
        font-weight: 600;
      }

      .bc-first-download--state-waiting & {
        color: var(--bc-text-2);
      }
    }

    .bc-first-download--detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
      overflow-wrap: anywhere;
    }

    .bc-first-download--bar {
      margin-top: 8px;
      display: block;
    }

    .bc-first-download--note {
      margin: 14px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }
  }
</style>
