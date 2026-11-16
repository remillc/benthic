<script>
  // @ts-check
  // Alpha first launch on a phone, after signing in (task 2026-11-16-233; docs/mockups/
  // android-premier-lancement-beta-compte-subsurface-telechargement.dc.html): the three steps of the
  // download in a white card (connection, the dives with « n sur N » and the wavy indicator, the copy on the
  // phone), the line that says to keep the app open, « Annuler ». When the logbook is there, first launch
  // closes and a snackbar says it stays on the phone. « Annuler » signs the account out again.
  import { onMount } from 'svelte';
  import EditorialPage from '../components/EditorialPage.svelte';
  import Icon from '../components/Icon.svelte';
  import LinearWavyProgress from '../components/LinearWavyProgress.svelte';
  import { announceFirstLaunch, showFailure } from '../lib/account.js';
  import { deviceKey, downloadSteps } from '../lib/first-launch.js';
  import { layout } from '../lib/layout.svelte.js';
  import { downloadAccountLogbook, logbook, signOut } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any, email?: string }} */
  let { f7router, email = '' } = $props();

  let cancelled = false;
  let cancelling = $state(false);
  const steps = $derived(downloadSteps(logbook.firstDownload?.progress ?? null));
  const count = $derived(logbook.firstDownload && logbook.firstDownload.total ? t('firstLaunch.download.count', { n: logbook.firstDownload.n, total: logbook.firstDownload.total }) : '');
  /** @type {{ key: 'connect'|'dives'|'copy', detail: string }[]} */
  const rows = $derived([
    { key: 'connect', detail: email },
    { key: 'dives', detail: steps.dives === 'running' ? count : '' },
    { key: 'copy', detail: '' },
  ]);

  onMount(() => {
    downloadAccountLogbook(() => cancelled).then((ok) => {
      if (ok) announceFirstLaunch('downloaded');
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
    f7router.back('/welcome/sign-in', { force: true });
  }
</script>

<EditorialPage class="od-first-download"
  firstLaunch
  noRetour
  helpLink
  title={t('signIn.title')}
  heading={t('signIn.heading')}
  intro=""
  secondary={{ label: t('accountStep.cancel'), onclick: cancel, disabled: cancelling }}
  closable={false}
>
  <ol class="od-first-download--steps" aria-label={t('firstLaunch.download.stepsLabel')}>
    {#each rows as row (row.key)}
      {@const state = steps[row.key]}
      <li class="od-first-download--state-{state}" aria-current={state === 'running' ? 'step' : undefined}>
        <span class="od-first-download--mark" aria-hidden="true">
          {#if state === 'done'}
            <span class="od-first-download--done"><Icon name="check" size={18} weight={2.4} /></span>
          {:else if state === 'running'}
            <span class="od-first-download--running"><span></span></span>
          {:else}
            <span class="od-first-download--waiting"></span>
          {/if}
        </span>
        <span class="od-first-download--text">
          <span class="od-first-download--label">{t(row.key === 'copy' ? deviceKey('firstLaunch.download.copy', layout.phone) : `firstLaunch.download.${row.key}`)}</span>
          {#if row.detail}<span class="od-first-download--detail">{row.detail}</span>{/if}
          {#if row.key === 'dives' && state === 'running'}
            <span class="od-first-download--bar">
              <LinearWavyProgress value={steps.value} indeterminate={steps.value <= 0} label={t('firstLaunch.download.progressLabel')} />
            </span>
          {/if}
        </span>
      </li>
    {/each}
  </ol>
  <p class="od-first-download--note">{t('firstLaunch.download.note')}</p>
</EditorialPage>

<style>
  @layer od.components {
    .od-first-download--steps {
      margin: 12px 0 0;
      padding: 20px 20px 22px;
      list-style: none;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 20px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;

      li {
        display: flex;
        gap: 14px;
        align-items: flex-start;
      }
    }

    .od-first-download--mark {
      flex: none;
      padding-top: 1px;
      display: flex;
    }

    .od-first-download--done,
    .od-first-download--running,
    .od-first-download--waiting {
      box-sizing: border-box;
      width: 28px;
      height: 28px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-first-download--done {
      background: var(--od-first-done);
      color: var(--od-on-first-done);
    }

    .od-first-download--running {
      border: 3px solid var(--od-code-active);

      span {
        width: 10px;
        height: 10px;
        border-radius: 5px;
        background: var(--od-code-active);
      }
    }

    .od-first-download--waiting {
      border: 2px solid var(--od-first-pending-ring);
    }

    .od-first-download--text {
      flex: 1;
      min-width: 0;
      padding-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-first-download--label {
      font-size: 16px;
      line-height: 21px;
      font-weight: 500;
      color: var(--od-text);

      .od-first-download--state-running & {
        font-weight: 600;
      }

      .od-first-download--state-waiting & {
        color: var(--od-text-2);
      }
    }

    .od-first-download--detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
      overflow-wrap: anywhere;
    }

    .od-first-download--bar {
      margin-top: 8px;
      display: block;
    }

    .od-first-download--note {
      margin: 14px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }
  }
</style>
