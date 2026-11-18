<script>
  // @ts-check
  // DEVELOPMENT ONLY: the « Outils de développement » row of the account sheets, under the first card. Loaded through
  // `import()` behind the development switch (lib/dev-switch.js), so a build without VITE_DEV_ACCOUNTS=1 does not contain it.
  import { devUi } from '../lib/dev-tools-ui.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';

  const english = typeof navigator !== 'undefined' && !/^fr/i.test(navigator.language);
  const label = english ? 'Development tools' : 'Outils de développement';

  function open() {
    navigation.accountOpen = false;
    devUi.open = true;
  }
</script>

<button type="button" class="od-dev-tools-row" onclick={open}>
  <span class="od-dev-tools-row--tag">DEV</span>
  <span class="od-dev-tools-row--label">{label}</span>
</button>

<style>
  @layer od.components {
    .od-dev-tools-row {
      display: flex;
      align-items: center;
      gap: 10px;
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      margin: 8px 0;
      padding: 0 16px;
      border: 2px dashed var(--od-alarm, #b3261e);
      border-radius: 12px;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      cursor: pointer;
    }
    .od-dev-tools-row--tag {
      padding: 1px 6px;
      border-radius: 6px;
      background: var(--od-alarm, #b3261e);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
  }
</style>
