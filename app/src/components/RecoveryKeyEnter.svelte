<script>
  // @ts-check
  // « Nouvel appareil, saisir la clé de secours » (inbox task 2026-11-23-338, item 3; Benthic+ only): one monospace
  // field, spaces and dashes optional, « Déverrouiller ». The field is checked while typing (length, characters);
  // `error` is the key module's answer (« wrong ») shown under the field after `onrecoverykey` was refused. `busy` while the
  // key is tried.
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import TextField from './TextField.svelte';
  import { t } from '../lib/i18n.js';
  import { normalizeRecoveryKey, recoveryKeyProblem } from '../lib/account-sync-screens.js';

  /**
   * onrecoverykey gets the key as typed, normalised (26 upper-case characters).
   * @type {{ onrecoverykey: (text: string) => void, oncancel: () => void, error?: ''|'wrong', busy?: boolean }}
   */
  let { onrecoverykey, oncancel, error = '', busy = false } = $props();

  let value = $state('');
  /** The refusal is shown until the next keystroke. */
  let refusal = $state(true);
  let touched = $state(false);
  const problem = $derived(recoveryKeyProblem(value));
  // « La clé compte 26 caractères » only once something was typed and the diver stopped (or left the field).
  const message = $derived(
    problem === 'characters' ? t('accountSync.key.errorCharacters') : problem === 'length' && touched ? t('accountSync.key.errorLength') : error === 'wrong' && refusal && !problem ? t('accountSync.key.errorWrong') : '',
  );

  function oninput() {
    refusal = false;
  }

  function submit() {
    if (problem || busy) return;
    refusal = true;
    onrecoverykey(normalizeRecoveryKey(value));
  }
</script>

<Md3Dialog title={t('accountSync.key.enterTitle')} class="bc-recovery-enter" {oncancel}>
  {#snippet icon()}<span class="bc-recovery-key-icon" style="color: var(--bc-secondary)"><Icon name="key" size={32} /></span>{/snippet}
  <form class="bc-recovery-enter--body" onsubmit={(e) => (e.preventDefault(), submit())}>
    <div class="bc-recovery-enter--field" onfocusout={() => (touched = !!value)}>
      <TextField label={t('accountSync.key.field')} bind:value {oninput} invalid={!!message} supporting={message || t('accountSync.key.hint')} autocomplete="off" />
    </div>
  </form>
  {#snippet actions()}
    <button type="button" data-action="cancel" onclick={oncancel}>{t('accountSync.key.cancel')}</button>
    <button type="button" data-action="unlock" disabled={!!problem || busy} onclick={submit}>{t('accountSync.key.unlock')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-recovery-enter--body {
      padding: 0 12px;
      --bc-field-margin: 12px;
    }

    .bc-recovery-enter--field :global(input) {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Roboto Mono', monospace;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    :global(.bc-recovery-enter .bc-md3-dialog--actions button:disabled) {
      opacity: 0.38;
      cursor: default;
    }
  }
</style>
