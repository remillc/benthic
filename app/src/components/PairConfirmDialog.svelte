<script>
  // @ts-check
  // « Donner accès à « <appareil> » ? » (to-do #183; Benthic+ only), on a device that holds the account key: the new device's
  // name and the 6-digit verification code, to compare with the one the new device shows. Nothing is committed before
  // « Autoriser » (`onconfirm`); « Refuser » (`onrefuse`) deletes the request; Back and the scrim (`onlater`) leave it for later.
  // `busy` disables the buttons while the key is wrapped and pushed.
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';
  import { groupedCode } from '../lib/account-sync-screens.js';

  /** @type {{ deviceName: string, code: string, onconfirm: () => void, onrefuse: () => void, onlater: () => void, busy?: boolean }} */
  let { deviceName, code, onconfirm, onrefuse, onlater, busy = false } = $props();
</script>

<Md3Dialog title={t('accountSync.pair.approveTitle', { name: deviceName })} text={t('accountSync.pair.approveText')} class="bc-pair-confirm" oncancel={onlater}>
  <p class="bc-pair-confirm--label">{t('accountSync.pair.codeLabel')}</p>
  <p class="bc-pair-confirm--code" data-code={code} aria-label={code.split('').join(' ')}>{groupedCode(code)}</p>
  {#snippet actions()}
    <button type="button" data-action="refuse" disabled={busy} onclick={onrefuse}>{t('accountSync.pair.refuse')}</button>
    <button type="button" data-action="confirm" disabled={busy} onclick={onconfirm}>{t('accountSync.pair.allow')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-pair-confirm--label {
      margin: 0;
      padding: 0 24px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      text-align: center;
    }

    .bc-pair-confirm--code {
      margin: 4px 0 0;
      padding: 0 24px;
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 40px;
      line-height: 48px;
      font-weight: 500;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
      text-align: center;
      color: var(--bc-text);
    }
  }
</style>
