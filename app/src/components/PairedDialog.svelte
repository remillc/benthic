<script>
  // @ts-check
  // « Nouvel appareil, jumelé » (inbox task 2026-11-23-338, item 4; Benthic+ only): a green check, « Appareil jumelé », OK.
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ onclose: () => void }} */
  let { onclose } = $props();
</script>

<Md3Dialog title={t('accountSync.pair.doneTitle')} class="bc-paired" oncancel={onclose}>
  <div class="bc-paired--body">
    <span class="bc-paired--check" aria-hidden="true"><Icon name="checkCircle" size={56} weight={1.8} /></span>
    <p class="bc-paired--text">{t('accountSync.pair.doneText')}</p>
  </div>
  {#snippet actions()}
    <button type="button" data-action="ok" onclick={onclose}>{t('dialog.ok')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-paired--body {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .bc-paired--check {
      color: var(--bc-status-ok);
      display: flex;
    }

    .bc-paired--text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      text-align: center;
    }
  }
</style>
