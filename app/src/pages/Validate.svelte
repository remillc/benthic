<script>
  // @ts-check
  // « Faire valider la plongée » (inbox task 2026-11-19-309, point 2; Benthic+; docs/mockups/validation-choix-android,
  // validation-signature-android and validation-qr-android): one screen for the dive (or the checked dives, `?ids=1,2,3`),
  // in three steps. The choice (« Signature sur cet écran » or « Code QR »); the signature (name, role, instructor number,
  // the frame, « Effacer », « Signer »); the QR code made by the server, valid 10 minutes, whose answer arrives through
  // the server. A full screen on every layout. The records and the server are in lib/validation.svelte.js.
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import ButtonGroup from '../components/ButtonGroup.svelte';
  import SignaturePad from '../components/SignaturePad.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { qrSummary } from '../lib/qr-send.js';
  import { qrPath } from '../lib/qr-draw.js';
  import { ServerError } from '../lib/server-api.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import { ROLES, MAX_DIVES, secondsLeft, signerProblems } from '../lib/validation.js';
  import { addSignature, beginQr, divesOf, refreshOne, removeValidation, signerIdentity } from '../lib/validation.svelte.js';

  /** @type {{ f7route: { query: { ids?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  const ids = (f7route.query.ids ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX_DIVES);

  /** @type {'choose'|'sign'|'qr'} */
  let step = $state('choose');
  /** @type {Record<string, any>[]} */
  let dives = $state([]);
  let failed = $state(false);
  const prefs = $derived(logbook.prefs);
  const many = $derived(ids.length > 1);
  const summary = $derived(dives.length === 0 ? '' : many ? t('validation.summaryMany', { n: String(dives.length) }) : qrSummary(/** @type {any} */ (dives[0]), prefs));

  onMount(async () => {
    try {
      dives = await divesOf(ids);
    } catch (e) {
      console.error('Validate: read the dives', e);
      failed = true;
    }
  });

  // --- Signature ---------------------------------------------------------------------------------------------------

  const identity = signerIdentity();
  let name = $state(identity.name);
  let role = $state(identity.role);
  let instructorNumber = $state(identity.instructorNumber);
  let touched = $state(false);
  let inked = $state(false);
  let saving = $state(false);
  /** @type {SignaturePad|undefined} */
  let pad = $state();
  const problems = $derived(signerProblems({ name, role }));
  const canSign = $derived(!problems.name && !problems.role && inked && !saving);
  const roleOptions = ROLES.map((r) => ({ value: r, label: t(`validation.roles.${r}`) }));

  async function sign() {
    touched = true;
    if (!canSign || !pad) return;
    saving = true;
    try {
      await addSignature({ dives, signer: { name, role, instructorNumber }, signature: pad.toDataUrl() });
      showSnackbar(t(many ? 'validation.signedMany' : 'validation.signed'));
      f7router.back();
    } catch (e) {
      console.error('Validate: save', e);
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'validation.readOnly' : 'validation.saveFailed'));
      saving = false;
    }
  }

  // --- QR code -----------------------------------------------------------------------------------------------------

  /** Codes per second when the summary needs several codes (the same rhythm as « Partager par code QR »). */
  const RATE = 4;
  /** @type {{ id: string, expiresAt: string }|null} */
  let code = $state(null);
  /** @type {{ size: number, d: string }[]} */
  let drawings = $state([]);
  let shown = $state(0);
  let secsLeft = $state(0);
  /** '' or a key of validation.qrError.* */
  let qrError = $state('');
  let making = $state(false);
  let kept = false;
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let tick;
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let poll;
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let flip;

  const clocks = $derived(Math.floor(secsLeft / 60) + ":" + String(secsLeft % 60).padStart(2, '0'));

  async function makeCode() {
    if (making) return;
    making = true;
    qrError = '';
    stopTimers();
    // A code that nobody confirmed is replaced, not piled up.
    if (code) await removeValidation(code.id).catch((e) => console.error('Validate: replace the code', e));
    try {
      const made = await beginQr(dives);
      code = { id: made.id, expiresAt: made.expiresAt };
      drawings = made.chunks.map(qrPath);
      shown = 0;
      secsLeft = secondsLeft(made.expiresAt, new Date());
      tick = setInterval(() => (secsLeft = secondsLeft(made.expiresAt, new Date())), 1000);
      poll = setInterval(check, 4000);
      if (drawings.length > 1) flip = setInterval(() => (shown = (shown + 1) % drawings.length), 1000 / RATE);
      BenthicCore.keepScreenAwake({ on: true }).catch((e) => console.error('Keep the screen awake', e));
    } catch (e) {
      console.error('Validate: QR code', e);
      code = null;
      drawings = [];
      const c = e instanceof ServerError ? e.code : 'UNREACHABLE';
      qrError = c === 'SUBSCRIPTION_REQUIRED' ? 'plus' : c === 'TOO_MANY_REQUESTS' ? 'tooMany' : c === 'UNREACHABLE' ? 'offline' : 'failed';
    } finally {
      making = false;
    }
  }

  /** The signer's answer, asked every few seconds while the code is on screen. */
  async function check() {
    if (!code) return;
    const record = await refreshOne(code.id);
    if (record?.status === 'confirmed') {
      kept = true;
      showSnackbar(t('validation.confirmedBy', { name: record.signer.name }));
      f7router.back();
    }
  }

  function stopTimers() {
    clearInterval(tick);
    clearInterval(poll);
    clearInterval(flip);
  }

  /** « Terminé »: the validation stays, waiting for the signer. */
  function done() {
    kept = true;
    f7router.back();
  }

  /** Leaves the QR step without « Terminé »: the code is dropped when nobody answered. */
  async function dropCode() {
    stopTimers();
    BenthicCore.keepScreenAwake({ on: false }).catch(() => {});
    if (code && !kept) await removeValidation(code.id).catch((e) => console.error('Validate: drop the code', e));
    code = null;
    drawings = [];
  }

  /** @param {'choose'|'sign'|'qr'} next */
  async function go(next) {
    if (step === 'qr') await dropCode();
    step = next;
    if (next === 'qr') void makeCode();
  }

  /** The back arrow: one step back, then the page. */
  function back() {
    if (step !== 'choose') void go('choose');
    else f7router.back();
  }

  onDestroy(() => {
    stopTimers();
    if (step === 'qr') void dropCode();
  });

  const title = $derived(step === 'sign' ? t('validation.signTitle') : step === 'qr' ? t('validation.qrTitle') : t(many ? 'validation.chooseTitleMany' : 'validation.chooseTitle', { n: String(ids.length) }));
  const current = $derived(drawings[shown]);
</script>

<Page class="bc-validate">
  <Navbar {title}>
    {#snippet left()}
      <Link iconOnly onClick={back}>
        <Icon name="arrowBack" /><span class="bc-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      {#if step === 'sign'}
        <Link onClick={sign} class={canSign ? '' : 'disabled'}>{t('validation.sign')}</Link>
      {/if}
    {/snippet}
  </Navbar>

  {#if failed}
    <p class="bc-validate--message" role="alert">{t('validation.loadFailed')}</p>
  {:else if step === 'choose'}
    <p class="bc-validate--summary">{summary}</p>
    <div class="bc-validate--choices">
      <button type="button" class="bc-validate--choice bc-validate--choice-signature" disabled={!dives.length} onclick={() => go('sign')}>
        <Icon name="edit" />
        <span class="bc-validate--choice-text">
          <span class="bc-validate--choice-title">{t('validation.chooseSignature')}</span>
          <span class="bc-validate--choice-help">{t('validation.chooseSignatureText')}</span>
        </span>
        <Icon name="chevron" />
      </button>
      <button type="button" class="bc-validate--choice bc-validate--choice-qr" disabled={!dives.length} onclick={() => go('qr')}>
        <Icon name="qr" />
        <span class="bc-validate--choice-text">
          <span class="bc-validate--choice-title">{t('validation.chooseQr')}</span>
          <span class="bc-validate--choice-help">{t('validation.chooseQrText')}</span>
        </span>
        <Icon name="chevron" />
      </button>
    </div>
  {:else if step === 'sign'}
    <p class="bc-validate--summary">{summary}</p>
    <div class="bc-validate--fields">
      <TextField label={t('validation.name')} bind:value={name} invalid={touched && !!problems.name} supporting={touched && problems.name ? t('validation.nameRequired') : ''} autocomplete="name" />
      <div class="bc-validate--role">
        <span class="bc-validate--label" id="od-validate-role">{t('validation.role')}</span>
        <ButtonGroup options={roleOptions} value={role} onchange={(v) => (role = v)} ariaLabelledby="od-validate-role" />
      </div>
      <TextField label={t('validation.number')} bind:value={instructorNumber} />
      <div class="bc-validate--pad">
        <span class="bc-validate--label">{t('validation.padLabel')}</span>
        <SignaturePad bind:this={pad} label={t('validation.padLabel')} onchange={(v) => (inked = v)} />
        <button type="button" class="bc-text-button bc-validate--clear" onclick={() => pad?.clear()} disabled={!inked}>{t('validation.clear')}</button>
      </div>
      {#if touched && !inked}<p class="bc-validate--error" role="alert">{t('validation.signatureRequired')}</p>{/if}
      <p class="bc-validate--attest">{t(many ? 'validation.attestMany' : 'validation.attest', { name: name.trim() || t('validation.theSigner') })}</p>
    </div>
  {:else}
    <p class="bc-validate--summary">{summary}</p>
    {#if qrError}
      <p class="bc-validate--message" role="alert">{t(`validation.qrError.${qrError}`)}</p>
      <div class="bc-validate--actions">
        {#if qrError !== 'plus'}
          <button type="button" class="bc-validate--secondary" onclick={makeCode} disabled={making}>{t('validation.retry')}</button>
        {/if}
        <button type="button" class="bc-validate--primary" onclick={() => go('sign')}>{t('validation.chooseSignature')}</button>
      </div>
    {:else if current}
      <div class="bc-validate--qr" class:bc-validate--qr-expired={secsLeft === 0} role="img" aria-label={t('validation.qrLabel')}>
        <svg class="bc-validate--code" viewBox="-4 -4 {current.size + 8} {current.size + 8}" shape-rendering="crispEdges" aria-hidden="true"><path d={current.d}></path></svg>
      </div>
      {#if secsLeft > 0}
        <p class="bc-validate--expires" role="timer">{t('validation.qrExpires', { time: clocks })}</p>
      {:else}
        <p class="bc-validate--expires bc-validate--expired" role="status">{t('validation.qrExpired')}</p>
        <div class="bc-validate--actions"><button type="button" class="bc-validate--secondary" onclick={makeCode} disabled={making}>{t('validation.qrNew')}</button></div>
      {/if}
      <p class="bc-validate--help">{t('validation.qrHelp')}</p>
      <div class="bc-validate--actions"><button type="button" class="bc-validate--primary" onclick={done}>{t('validation.qrDone')}</button></div>
    {:else}
      <p class="bc-validate--message" role="status">{t('validation.qrPreparing')}</p>
    {/if}
  {/if}
</Page>

<style>
  @layer od.components {
    :global(.bc-validate.page) {
      background: var(--bc-background);
    }

    .bc-validate--summary {
      margin: 8px 20px 0;
      font-size: 15px;
      color: var(--bc-text-2);
    }

    .bc-validate--message {
      margin: 24px 24px 0;
      font-size: 15px;
      line-height: 22px;
      color: var(--bc-text);
    }

    .bc-validate--choices {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-validate--choice {
      width: 100%;
      box-sizing: border-box;
      padding: 16px;
      border: none;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      text-align: left;
      font: inherit;
      background: var(--bc-surface);
      color: var(--bc-text);
      &:disabled {
        opacity: 0.5;
      }
    }

    .bc-validate--choice-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bc-validate--choice-title {
      font-size: 17px;
      font-weight: 600;
    }

    .bc-validate--choice-help {
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text-2);
    }

    .bc-validate--fields {
      margin-top: 8px;
      padding: 0 16px calc(24px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-validate--role,
    .bc-validate--pad {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .bc-validate--label {
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-validate--clear {
      align-self: flex-end;
    }

    .bc-validate--attest {
      margin: 0 4px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-validate--error {
      margin: 0 4px;
      font-size: 14px;
      color: var(--bc-alarm);
    }

    /* White 20 dp card: the code is always black on white, whatever the mode (as « Partager par code QR »). */
    .bc-validate--qr {
      box-sizing: border-box;
      width: min(310px, calc(100% - 48px));
      aspect-ratio: 1;
      margin: 24px auto 0;
      padding: 20px;
      border-radius: 24px;
      background: var(--bc-qr-paper);
    }

    .bc-validate--qr-expired {
      opacity: 0.25;
    }

    .bc-validate--code {
      display: block;
      width: 100%;
      height: 100%;
      fill: var(--bc-qr-ink);
    }

    .bc-validate--expires {
      margin: 16px 0 0;
      text-align: center;
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--bc-text);
    }

    .bc-validate--expired {
      color: var(--bc-alarm);
    }

    .bc-validate--help {
      margin: 16px 32px 0;
      text-align: center;
      font-size: 15px;
      line-height: 22px;
      color: var(--bc-text-2);
    }

    .bc-validate--actions {
      margin: 24px 16px calc(24px + var(--f7-safe-area-bottom, 0px));
      display: flex;
      justify-content: center;
      gap: 12px;
    }

    .bc-validate--primary,
    .bc-validate--secondary {
      height: 48px;
      padding: 0 28px;
      border-radius: 24px;
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      width: auto;
    }

    .bc-validate--primary {
      border: none;
      background: var(--bc-action);
      color: var(--bc-on-action);
    }

    .bc-validate--secondary {
      background: none;
      border: var(--bc-outline-width) solid var(--bc-outline);
      color: var(--bc-text);
    }

    .bc-validate--primary:disabled,
    .bc-validate--secondary:disabled {
      opacity: 0.5;
    }
  }
</style>
