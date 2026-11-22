<script>
  // @ts-check
  // DEVELOPMENT ONLY: the « Outils de développement » row of the account sheets, under the first card. Loaded through
  // `import()` behind the development switch (lib/dev-switch.js), so a build without VITE_DEV_ACCOUNTS=1 does not contain it.
  import Icon from './Icon.svelte';
  import { devUi } from '../lib/dev-tools-ui.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';

  const english = typeof navigator !== 'undefined' && !/^fr/i.test(navigator.language);
  const label = english ? 'Development tools' : 'Outils de développement';

  function open() {
    navigation.accountOpen = false;
    devUi.open = true;
  }
</script>

<button type="button" class="bc-dev-tools-row" onclick={open}>
  <span class="bc-dev-tools-row--icon"><Icon name="tune" size={20} /></span>
  <span class="bc-dev-tools-row--label">{label}</span>
  <span class="bc-dev-tools-row--tag">DEV</span>
  <span class="bc-dev-tools-row--chevron"><Icon name="chevron" size={18} /></span>
</button>

<style>
  @layer od.components {
    .bc-dev-tools-row {
      display: flex;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      width: 100%;
      min-height: 48px;
      margin: 8px 0;
      padding: 0 14px 0 12px;
      border: 1.5px dashed var(--bc-dev);
      border-radius: 16px;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      &:active {
        background: var(--bc-dev-tint);
      }
    }
    .bc-dev-tools-row--icon {
      display: inline-flex;
      color: var(--bc-dev);
    }
    .bc-dev-tools-row--label {
      flex: 1;
      min-width: 0;
      font-weight: 500;
    }
    .bc-dev-tools-row--tag {
      padding: 1px 7px;
      border-radius: 6px;
      background: var(--bc-dev);
      color: var(--bc-on-dev);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.6px;
    }
    .bc-dev-tools-row--chevron {
      display: inline-flex;
      color: var(--bc-text-2);
    }
  }
</style>
