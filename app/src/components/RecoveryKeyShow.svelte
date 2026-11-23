<script>
  // @ts-check
  // « Clé de secours, affichée une seule fois » (inbox task 2026-11-23-338, item 10; Benthic+ only): the 26 base32
  // characters in groups of four, monospace, in a dashed box; « Copier » (outlined) calls `oncopy` with the key in groups
  // of four; « Je l’ai notée » (`ondone`) closes it for good: the key is never shown again, so Back and the scrim do
  // nothing here.
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { recoveryKeyGroups, recoveryKeyText } from '../lib/account-sync-screens.js';

  /** @type {{ recoveryKey: string, oncopy: (text: string) => void, ondone: () => void }} */
  let { recoveryKey, oncopy, ondone } = $props();

  let copied = $state(false);
  const groups = $derived(recoveryKeyGroups(recoveryKey));

  function copy() {
    oncopy(recoveryKeyText(recoveryKey));
    copied = true;
  }
</script>

<Md3Dialog title={t('accountSync.key.showTitle')} text={t('accountSync.key.showText')} class="bc-recovery-show" oncancel={() => {}}>
  <div class="bc-recovery-show--body">
    <p class="bc-recovery-show--key" aria-label={t('accountSync.key.label')}>
      {#each groups as group, i (i)}<span class="bc-recovery-show--group">{group}</span>{' '}{/each}
    </p>
    <button type="button" class="bc-recovery-show--copy" data-action="copy" onclick={copy}>
      <Icon name={copied ? 'check' : 'copy'} size={18} />{t(copied ? 'accountSync.key.copied' : 'accountSync.key.copy')}
    </button>
  </div>
  {#snippet actions()}
    <button type="button" data-action="done" onclick={ondone}>{t('accountSync.key.done')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-recovery-show--body {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .bc-recovery-show--key {
      width: 100%;
      margin: 0;
      padding: 20px 16px;
      box-sizing: border-box;
      border: 2px dashed var(--bc-outline);
      border-radius: 16px;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Roboto Mono', monospace;
      font-size: 20px;
      line-height: 32px;
      font-weight: 500;
      letter-spacing: 1px;
      text-align: center;
      user-select: all;
    }

    .bc-recovery-show--group {
      display: inline-block;
    }

    .bc-recovery-show--copy {
      min-height: 40px;
      padding: 0 20px 0 16px;
      border: 1px solid var(--bc-outline);
      border-radius: 20px;
      background: none;
      color: var(--bc-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
  }
</style>
