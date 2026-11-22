<script>
  // @ts-check
  // The ready step's blue panel on a tablet and on the desktop.
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import BenthicPlusReadyLogo from './BenthicPlusReadyLogo.svelte';
  import BenthicPlusReadyBubbles from './BenthicPlusReadyBubbles.svelte';
  import { readyMotion } from '../lib/ready-motion.svelte.js';
  import { deviceKey, deviceKind } from '../lib/first-launch-phone.js';
  import { desktopApp, ios, layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));
</script>

{#if readyMotion.bubbles}<BenthicPlusReadyBubbles panel still={readyMotion.still} />{/if}
<div class="bc-plus-panel">
  <BenthicPlusReadyLogo play={readyMotion.play} size={120} />
  <BenthicPlusChip />
  <h1 class="bc-plus-panel--title">{t('benthicPlus.ready.title')}</h1>
  <p class="bc-plus-panel--lead">{t(deviceKey('benthicPlus.ready.lead', kind))}</p>
</div>

<style>
  @layer od.components {
    .bc-plus-panel {
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 16px;
      padding-bottom: 96px;
    }
    .bc-plus-panel--title {
      margin: 0;
      max-width: 540px;
      font-size: 40px;
      line-height: 48px;
      font-weight: 400;
      letter-spacing: -0.5px;
    }
    .bc-plus-panel--lead {
      margin: 0;
      max-width: 520px;
      font-size: 16px;
      line-height: 22px;
      color: var(--bc-release-on-panel-soft);
    }
  }
</style>
