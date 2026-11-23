<script>
  // @ts-check
  // The pairing code on screen (inbox task 2026-11-23-338, items 2 and 7; Benthic+ only). `variant="old"`: « Appareil déjà
  // jumelé, montrer le code », the QR with the key K and the pairing id (10 minutes). `variant="new"`: « Nouvel ordinateur
  // sans caméra, montrer le code », the QR with the ephemeral ECDH public key. The text of the code comes from the key
  // module (`payload`); this screen only draws it and counts down to `expiresAt`. `onscan` (phone and tablet) is the
  // « Lire le code d’un ordinateur » button on the left, which opens the scanner. Dialog without ✕: « Annuler ».
  import { onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';
  import { qrPath } from '../lib/qr-draw.js';
  import { remainingMs, remainingText } from '../lib/account-sync-screens.js';

  /**
   * payload: the QR's text. expiresAt: ms since 1970. onscan: given on a device with a camera (old variant).
   * onrenew: « Nouveau code » once the code has expired. now: the clock (tests).
   * @type {{
   *   variant: 'old'|'new',
   *   payload: string,
   *   expiresAt: number,
   *   oncancel: () => void,
   *   onscan?: () => void,
   *   onrenew?: () => void,
   *   now?: () => number,
   * }}
   */
  let { variant, payload, expiresAt, oncancel, onscan, onrenew, now = Date.now } = $props();

  // svelte-ignore state_referenced_locally
  let clock = $state(now());
  onMount(() => {
    const timer = setInterval(() => (clock = now()), 250);
    return () => clearInterval(timer);
  });

  const left = $derived(remainingMs(expiresAt, clock));
  const expired = $derived(left <= 0);
  const code = $derived(qrPath(payload));
</script>

<Md3Dialog title={t(variant === 'old' ? 'accountSync.pair.oldTitle' : 'accountSync.pair.newTitle')} class="bc-pair-show" {oncancel}>
  <div class="bc-pair-show--body">
    <div class="bc-pair-show--card" class:bc-pair-show--expired={expired} role="img" aria-label={t('accountSync.pair.codeLabel')}>
      <svg class="bc-pair-show--code" viewBox="-4 -4 {code.size + 8} {code.size + 8}" shape-rendering="crispEdges" aria-hidden="true"><path d={code.d}></path></svg>
    </div>
    <p class="bc-pair-show--expires" role="timer" data-expired={expired}>
      {expired ? t('accountSync.pair.expired') : t('accountSync.pair.expires', { time: remainingText(left) })}
    </p>
    <p class="bc-pair-show--hint">{t(variant === 'old' ? 'accountSync.pair.oldHint' : 'accountSync.pair.newHint')}</p>
  </div>
  {#snippet actions()}
    {#if onscan}<button type="button" class="bc-md3-dialog--start" data-action="scan" onclick={onscan}>{t('accountSync.pair.scanComputer')}</button>{/if}
    {#if expired && onrenew}<button type="button" data-action="renew" onclick={onrenew}>{t('accountSync.pair.renew')}</button>{/if}
    <button type="button" data-action="cancel" onclick={oncancel}>{t('accountSync.pair.cancel')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-pair-show--body {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* The code stays black on white in both modes: a scanner reads dark modules on a light ground. */
    .bc-pair-show--card {
      width: min(240px, 100%);
      aspect-ratio: 1;
      padding: 8px;
      box-sizing: border-box;
      border-radius: 16px;
      background: var(--bc-qr-paper);
      display: grid;
    }

    .bc-pair-show--expired {
      opacity: 0.25;
    }

    .bc-pair-show--code {
      width: 100%;
      height: 100%;
      fill: var(--bc-qr-ink);
    }

    .bc-pair-show--expires {
      margin: 16px 0 0;
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .bc-pair-show--hint {
      margin: 8px 0 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      text-align: center;
    }
  }
</style>
