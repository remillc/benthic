<script>
  // @ts-check
  // The divelogs.de import of the release edition's first launch (task 2026-11-15-218; mock-ups
  // android-tablette-premier-lancement-production-importer-divelogs-paysage and -progres-paysage): the user name
  // and the password, then the progress on a white paper card with three steps. The credentials live in the
  // form's state only until the download starts, and are never stored. Nothing is added to a logbook here:
  // the dives are read, then « Nouveau carnet » asks where to keep them.
  import { onMount } from 'svelte';
  import { OpenDivesCore } from 'opendives-core';
  import ReleaseField from './ReleaseField.svelte';
  import Icon from './Icon.svelte';
  import LinearWavyProgress from './LinearWavyProgress.svelte';
  import { flow, go, goBack } from '../lib/first-launch.svelte.js';
  import { checkDivelogs, downloadDivelogs } from '../lib/first-launch-import.js';
  import { errorCode } from '../lib/account.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ step: 'importDivelogs'|'importProgress', onread: (read: { path: string, dives: number }) => void }} */
  let { step, onread } = $props();

  const d = flow.divelogs;
  let busy = $state(false);
  let cancelled = false;
  /** The account's name shown on the first step of the progress, kept after the password is cleared. */
  let account = $state(d.user.trim());

  const calls = {
    check: (/** @type {any} */ o) => OpenDivesCore.divelogsCheck(o),
    download: (/** @type {any} */ o) => OpenDivesCore.divelogsDownload(o),
    count: (/** @type {any} */ o) => OpenDivesCore.importCount(o),
    discard: (/** @type {any} */ o) => OpenDivesCore.discardImport(o),
  };

  const ready = $derived(!!d.user.trim() && !!d.password && !busy);

  /** « Importer »: divelogs.de checks the credentials; accepted, the progress screen opens. */
  async function submit() {
    if (!ready) return;
    busy = true;
    d.error = '';
    try {
      d.total = await checkDivelogs(calls, { user: d.user, password: d.password });
      d.done = 0;
      d.phase = 'download';
      go('submit');
    } catch (e) {
      const code = errorCode(e);
      d.error = code === 'LOGIN_FAILED' ? t('bringLogbook.refused') : code === 'NETWORK' || code === 'NETWORK_LOST' ? t('importProgress.offline') : t('importProgress.downloadFailed');
    } finally {
      busy = false;
    }
  }

  /** The progress screen: the download, then the read; « Annuler » keeps nothing. */
  async function run() {
    cancelled = false;
    try {
      const read = await downloadDivelogs(
        calls,
        { user: d.user, password: d.password },
        d.total,
        (s) => {
          d.phase = s.phase;
          d.done = s.done;
          d.total = s.total;
        },
        () => cancelled,
      );
      // The credentials are no longer needed.
      d.password = '';
      if (read) onread(read);
    } catch (e) {
      d.password = '';
      d.error = errorCode(e) === 'NO_DIVES' ? t('importProgress.readFailed') : t('importProgress.downloadFailed');
      if (!cancelled) goBack();
    }
  }

  function cancel() {
    cancelled = true;
    d.password = '';
    goBack();
  }

  onMount(() => {
    if (step === 'importProgress') void run();
    return () => {
      // The form is left for anything but the progress screen: the password is forgotten.
      if (step === 'importDivelogs' && flow.stack[flow.stack.length - 1] !== 'importProgress') d.password = '';
      // Left in any way: the password never outlives the screen.
      if (step === 'importProgress') {
        cancelled = cancelled || d.phase !== 'read';
        d.password = '';
      }
    };
  });
</script>

{#if step === 'importDivelogs'}
  <ReleaseField label={t('welcomeSteps.divelogsUser')} bind:value={d.user} disabled={busy} autocomplete="username" />
  <ReleaseField label={t('welcomeSteps.divelogsPassword')} bind:value={d.password} type="password" disabled={busy} autocomplete="current-password" error={d.error} help={t('welcomeSteps.credentialsNote')} />
  <button type="button" class="od-first-launch-divelogs--action" disabled={!ready} aria-busy={busy} onclick={submit}>{t('welcomeSteps.importAction')}</button>
{:else}
  <div class="od-first-launch-divelogs--paper">
    <div class="od-first-launch-divelogs--step">
      <span class="od-first-launch-divelogs--mark od-first-launch-divelogs--done"><Icon name="check" size={16} weight={2.6} /></span>
      <span class="od-first-launch-divelogs--text">
        <span class="od-first-launch-divelogs--name">{t('welcomeSteps.progressConnect')}</span>
        <span class="od-first-launch-divelogs--detail">{t('welcomeSteps.progressAccount', { user: account })}</span>
      </span>
    </div>
    <div class="od-first-launch-divelogs--step">
      <span class="od-first-launch-divelogs--mark" class:od-first-launch-divelogs--done={d.phase === 'read'} class:od-first-launch-divelogs--current={d.phase === 'download'}>
        {#if d.phase === 'read'}<Icon name="check" size={16} weight={2.6} />{:else}<span class="od-first-launch-divelogs--dot"></span>{/if}
      </span>
      <span class="od-first-launch-divelogs--text">
        <span class="od-first-launch-divelogs--name od-first-launch-divelogs--name-current">{t('welcomeSteps.progressDownload')}</span>
        <span class="od-first-launch-divelogs--detail">{t('welcomeSteps.progressCount', { done: d.done, total: d.total })}</span>
      </span>
    </div>
    <div class="od-first-launch-divelogs--bar">
      <LinearWavyProgress value={d.total ? d.done / d.total : 0} label={t('welcomeSteps.progressDownload')} />
    </div>
    <div class="od-first-launch-divelogs--step">
      <span class="od-first-launch-divelogs--mark" class:od-first-launch-divelogs--current={d.phase === 'read'}>
        {#if d.phase === 'read'}<span class="od-first-launch-divelogs--dot"></span>{/if}
      </span>
      <span class="od-first-launch-divelogs--text">
        <span class="od-first-launch-divelogs--name" class:od-first-launch-divelogs--waiting={d.phase !== 'read'}>{t('welcomeSteps.progressRead')}</span>
      </span>
    </div>
  </div>
  <p class="od-first-launch-divelogs--help">{t('welcomeSteps.progressHelp')}</p>
  <button type="button" class="od-first-launch-divelogs--cancel" onclick={cancel}>{t('welcomeSteps.cancel')}</button>
{/if}

<style>
  @layer od.components {
    .od-first-launch-divelogs--action {
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

    .od-first-launch-divelogs--paper {
      margin-top: 12px;
      padding: 20px 20px 22px;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 20px;
      background: var(--od-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .od-first-launch-divelogs--step {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }

    .od-first-launch-divelogs--mark {
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

    .od-first-launch-divelogs--done {
      border: none;
      background: var(--od-release-ok);
    }

    .od-first-launch-divelogs--current {
      border: 3px solid var(--od-release-row-main);
    }

    .od-first-launch-divelogs--dot {
      width: 10px;
      height: 10px;
      border-radius: 5px;
      background: var(--od-release-row-main);
    }

    .od-first-launch-divelogs--text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-top: 4px;
    }

    .od-first-launch-divelogs--name {
      font-size: 16px;
      line-height: 21px;
      font-weight: 500;
    }

    .od-first-launch-divelogs--name-current {
      font-weight: 600;
    }

    .od-first-launch-divelogs--waiting {
      color: var(--od-text-2);
    }

    .od-first-launch-divelogs--detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-first-launch-divelogs--bar {
      margin: -4px 0 2px 42px;
      --od-linear-wavy-progress-active: var(--od-release-row-main);
      --od-linear-wavy-progress-track: var(--od-release-track);
    }

    .od-first-launch-divelogs--help {
      margin: 14px 0 22px;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-first-launch-divelogs--cancel {
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
      transition: background-color 0.15s;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-first-launch-divelogs--action,
      .od-first-launch-divelogs--cancel {
        transition: none;
      }
    }
  }
</style>
