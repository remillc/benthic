<script>
  // @ts-check
  // The new device's side of the pairing by approval (to-do #183; Benthic+ only; no camera, the same on a phone, a tablet and a
  // computer). `kind="waiting"`: « Demander l’accès » → « En attente d’autorisation », the 6-digit code large (monospace), how
  // long the request lives and what to do on the paired device; « Annuler ». `kind="declined"|"expired"|"failed"`: what
  // happened, « Fermer » and « Demander de nouveau ».
  import { onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import LinearWavyProgress from './LinearWavyProgress.svelte';
  import { t, language } from '../lib/i18n.js';
  import { groupedCode, namesText, remainingMs, remainingText } from '../lib/account-sync-screens.js';

  /**
   * @type {{
   *   kind: 'waiting'|'declined'|'expired'|'failed',
   *   code?: string,
   *   names?: string[],
   *   by?: string,
   *   onlost?: () => void,
   *   expiresAt?: number,
   *   oncancel: () => void,
   *   onagain?: () => void,
   *   now?: () => number,
   * }}
   */
  let { kind, code = '', names = [], by = '', expiresAt = 0, oncancel, onagain, onlost, now = Date.now } = $props();

  // svelte-ignore state_referenced_locally
  let clock = $state(now());
  onMount(() => {
    const timer = setInterval(() => (clock = now()), 250);
    return () => clearInterval(timer);
  });
  const left = $derived(remainingMs(expiresAt, clock));
</script>

{#if kind === 'waiting'}
  <Md3Dialog title={t('accountSync.pair.askTitle')} class="bc-pair-request" {oncancel}>
    <div class="bc-pair-request--body">
      {#if names.length}<p class="bc-pair-request--names">{t('accountSync.pair.askNames', { names: namesText(names, language) })}</p>{/if}
      <p class="bc-pair-request--status" role="status">{t('accountSync.pair.waiting')}</p>
      <div class="bc-pair-request--wave"><LinearWavyProgress indeterminate label={t('accountSync.pair.waiting')} /></div>
      <p class="bc-pair-request--label">{t('accountSync.pair.codeLabel')}</p>
      {#if code}
        <p class="bc-pair-request--code" data-code={code} aria-label={code.split('').join(' ')}>{groupedCode(code)}</p>
      {:else}
        <p class="bc-pair-request--code bc-pair-request--code-empty" aria-hidden="true">••• •••</p>
      {/if}
      {#if code}<p class="bc-pair-request--expires" role="timer">{t('accountSync.pair.expires', { time: remainingText(left) })}</p>{/if}
      {#if !names.length}<p class="bc-pair-request--hint">{t('accountSync.pair.askHint')}</p>{/if}
    </div>
    {#snippet actions()}
      <button type="button" data-action="cancel" onclick={oncancel}>{t('accountSync.pair.cancel')}</button>
    {/snippet}
  </Md3Dialog>
{:else}
  <Md3Dialog
    title={t(kind === 'declined' ? 'accountSync.pair.declinedTitle' : kind === 'expired' ? 'accountSync.pair.expiredTitle' : 'accountSync.pair.endedTitle')}
    text={kind === 'declined' ? (by ? t('accountSync.pair.declinedText', { name: by }) : t('accountSync.pair.declinedTextAnon')) : t(kind === 'expired' ? 'accountSync.pair.expiredText' : 'accountSync.pair.endedText')}
    class="bc-pair-request"
    {oncancel}
  >
    <span></span>
    {#snippet actions()}
      {#if kind === 'expired' && onlost}<button type="button" class="bc-md3-dialog--start bc-pair-request--lost" data-action="lost" onclick={onlost}>{t('accountSync.unlock.lost')}</button>{/if}
      <button type="button" data-action="cancel" onclick={oncancel}>{t('accountSync.pair.close')}</button>
      {#if onagain}<button type="button" data-action="again" onclick={onagain}>{t('accountSync.pair.again')}</button>{/if}
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer bc.components {
    /* Stacked (a phone): « Plus d’appareil ni de clé ? » on its own line above « Fermer » and « Nouvelle demande » (task 2026-11-23-350). */
    :global(.bc-dialog-stacked .bc-md3-dialog--actions .bc-pair-request--lost) {
      order: 1;
    }

    .bc-pair-request--body {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .bc-pair-request--names {
      margin: 0 0 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      text-align: center;
    }

    .bc-pair-request--status {
      margin: 0;
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
    }

    .bc-pair-request--wave {
      width: 160px;
      margin-top: 8px;
    }

    .bc-pair-request--label {
      margin: 16px 0 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-pair-request--code {
      margin: 4px 0 0;
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 48px;
      line-height: 56px;
      font-weight: 500;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
      text-align: center;
      color: var(--bc-text);
    }

    .bc-pair-request--code-empty {
      color: var(--bc-text-2);
    }

    .bc-pair-request--expires {
      margin: 12px 0 0;
      font-size: 14px;
      line-height: 20px;
      font-variant-numeric: tabular-nums;
      color: var(--bc-text-2);
      text-align: center;
    }

    .bc-pair-request--hint {
      margin: 8px 0 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      text-align: center;
    }
  }
</style>
