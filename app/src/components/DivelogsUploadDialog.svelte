<script>
  // @ts-check
  // « Envoyer vers divelogs.de » (task 2026-11-23-337): what follows the choice in the export dialog, on every device, as
  // basic dialogs over the logbook: the connection (user name and password), the progress (the divelogs.de import's step
  // card and wave), then « Plongées envoyées »; refused credentials bring the connection dialog back with the password
  // field in error, a lost connection leaves the progress dialog with the failed step and « Réessayer ».
  // The user name and the password are never stored: they live in this dialog's fields, the password is emptied as soon
  // as divelogs.de has accepted it (the upload keeps the bearer token for « Réessayer »), and both go with the dialog.
  import { onDestroy, onMount, tick } from 'svelte';
  import { BenthicCore } from 'benthic-core';
  import Md3Dialog from './Md3Dialog.svelte';
  import ReleaseField from './ReleaseField.svelte';
  import DivelogsSteps from './DivelogsSteps.svelte';
  import Icon from './Icon.svelte';
  import { createDivelogsUpload } from '../lib/divelogs-upload.js';
  import { divelogsTransport, divelogsUrl } from '../lib/divelogs-transport.js';
  import { outcomeOf, progressSteps } from '../lib/divelogs-flow.js';
  import { layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ ids: number[], logbookName: string, onclose: () => void }} */
  let { ids, logbookName, onclose } = $props();

  // svelte-ignore state_referenced_locally
  const total = ids.length;
  /** @type {'connect'|'progress'|'done'} */
  let stage = $state('connect');
  let user = $state('');
  let password = $state('');
  let error = $state('');
  let done = $state(0);
  /** The account's name shown on the first step, kept after the password is emptied. */
  let account = $state('');
  /** @type {import('../lib/divelogs-flow.js').UploadFailure|null} */
  let failed = $state(null);
  let signedIn = $state(false);
  let cancelled = false;
  let running = false;
  const phone = $derived(layout.phone);
  const ready = $derived(!!user.trim() && !!password);
  /** @type {HTMLElement|null} */
  let content = $state(null);

  const upload = createDivelogsUpload({
    transport: divelogsTransport,
    base: divelogsUrl(),
    // svelte-ignore state_referenced_locally
    ids,
    exportBatch: async (batch) => {
      const { text } = await BenthicCore.exportDives({ ids: batch, format: 'ssrf', anonymize: false, name: 'divelogs.ssrf', text: true });
      return text ?? '';
    },
  });

  async function run() {
    if (running) return;
    running = true;
    cancelled = false;
    failed = null;
    try {
      if (!upload.signedIn) await upload.login({ user, password });
      signedIn = true;
      // divelogs.de accepted the password: it is not needed again, « Réessayer » goes on with the token.
      password = '';
      await upload.send((n) => (done = n), () => cancelled);
      stage = 'done';
    } catch (e) {
      const outcome = outcomeOf(/** @type {any} */ (e)?.code, upload.signedIn);
      if (outcome.to === 'none') return;
      if (outcome.to === 'connect') {
        stage = 'connect';
        error = t('divelogsUpload.denied');
        return;
      }
      console.error('divelogs.de upload', e);
      failed = outcome.failure;
    } finally {
      running = false;
    }
  }

  function submit() {
    if (!ready || running) return;
    error = '';
    account = user.trim();
    done = 0;
    stage = 'progress';
    void run();
  }

  /** « Annuler » (and Escape, and the system Back): the upload stops before its next batch and nothing is kept. */
  function cancel() {
    cancelled = true;
    password = '';
    user = '';
    onclose();
  }

  onMount(() => {
    // The user name is the focused field.
    void tick().then(() => requestAnimationFrame(() => /** @type {HTMLInputElement|null} */ (content?.querySelector('input'))?.focus({ preventScroll: true })));
  });
  onDestroy(() => {
    cancelled = true;
    password = '';
  });

  const steps = $derived(progressSteps({ failure: failed, signedIn, account, done, total }, t));
</script>

{#snippet check()}
  <span class="bc-divelogs-upload--disc"><Icon name="check" size={28} weight={2.6} /></span>
{/snippet}

<Md3Dialog
  class="bc-divelogs-upload {phone ? 'bc-divelogs-upload--phone' : ''}"
  title={stage === 'connect' ? t('divelogsUpload.title') : stage === 'progress' ? t('divelogsUpload.progressTitle') : t('divelogsUpload.doneTitle')}
  text={stage === 'connect' ? t('divelogsUpload.text', { name: logbookName, n: total }) : stage === 'done' ? t('divelogsUpload.doneText', { name: logbookName, n: total, user: account }) : ''}
  oncancel={stage === 'done' ? onclose : cancel}
  icon={stage === 'done' ? check : undefined}
>
  <div class="bc-divelogs-upload--content" bind:this={content}>
    {#if stage === 'connect'}
      <ReleaseField label={t('divelogsUpload.user')} bind:value={user} autocomplete="username" onenter={submit} />
      <ReleaseField label={t('divelogsUpload.password')} bind:value={password} type="password" autocomplete="current-password" {error} help={t('divelogsUpload.note')} oninput={() => (error = '')} onenter={submit} />
    {:else if stage === 'progress'}
      <DivelogsSteps {steps} />
      {#if !failed}<p class="bc-divelogs-upload--help">{t('divelogsUpload.help')}</p>{/if}
    {/if}
  </div>
  {#snippet actions()}
    {#if stage === 'connect'}
      <button type="button" onclick={cancel}>{t('dialog.cancel')}</button>
      <button type="button" class="bc-divelogs-upload--primary" disabled={!ready} onclick={submit}>{t('divelogsUpload.send')}</button>
    {:else if stage === 'progress'}
      <button type="button" onclick={cancel}>{t('dialog.cancel')}</button>
      {#if failed}<button type="button" class="bc-divelogs-upload--primary" onclick={() => void run()}>{t('divelogsUpload.retry')}</button>{/if}
    {:else}
      <a class="bc-divelogs-upload--link bc-md3-dialog--start" href="https://divelogs.de" target="_blank" rel="noopener noreferrer"><Icon name="openInNew" size={18} />{t('divelogsUpload.open')}</a>
      <button type="button" class="bc-divelogs-upload--primary" onclick={onclose}>{t('divelogsUpload.ok')}</button>
    {/if}
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-divelogs-upload--content {
      padding: 0 24px;
    }

    .bc-divelogs-upload--help {
      margin: 14px 0 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-divelogs-upload--content :global(.bc-divelogs-steps) {
      margin: 0;
    }

    .bc-divelogs-upload--disc {
      width: 56px;
      height: 56px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-ok);
      color: var(--bc-release-on-panel);
    }

    /* The phone's dialogs are 16 dp from the screen sides. */
    :global(.bc-divelogs-upload--phone) :global(.bc-md3-dialog--surface) {
      width: calc(100% - 32px);
    }

    /* The link « Ouvrir divelogs.de » looks like the dialog's text buttons, with its icon. */
    .bc-divelogs-upload--link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 40px;
      padding: 0 12px;
      border-radius: 20px;
      color: var(--bc-action);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      text-decoration: none;
      white-space: nowrap;
    }

    .bc-divelogs-upload--primary:disabled {
      opacity: 0.38;
      cursor: default;
    }

    @media (hover: hover) and (pointer: fine) {
      .bc-divelogs-upload--link:hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
  }
</style>
