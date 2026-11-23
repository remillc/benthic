<script>
  // @ts-check
  // « Demande refusée » after « Les codes sont différents » (task 2026-11-23-349 item 8; Benthic+ only), on the paired device: the
  // codes did not match, so the request may not have come from the diver's own device. Says that nothing was shared and what to
  // check (the sign-in code goes by e-mail). « OK » closes it.
  import Md3Dialog from './Md3Dialog.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ deviceName: string, onclose: () => void }} */
  let { deviceName, onclose } = $props();
</script>

<Md3Dialog title={t('accountSync.pair.mismatchTitle')} text={t('accountSync.pair.mismatchText', { name: deviceName })} class="bc-pair-mismatch" oncancel={onclose}>
  <p class="bc-pair-mismatch--advice">{t('accountSync.pair.mismatchAdvice')}</p>
  {#snippet actions()}
    <button type="button" data-action="ok" onclick={onclose}>{t('dialog.ok')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-pair-mismatch--advice {
      margin: 0;
      padding: 0 24px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }
  }
</style>
