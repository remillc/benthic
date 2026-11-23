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

  /** `centered`: a tablet (task 2026-11-23-335), the column sits on the panel's axis, 176 dp from its top; the desktop keeps it at the left. @type {{ centered?: boolean }} */
  let { centered = false } = $props();

  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));
</script>

{#if readyMotion.bubbles}<BenthicPlusReadyBubbles panel still={readyMotion.still} />{/if}
<div class="bc-plus-panel" class:bc-plus-panel--centered={centered}>
  <BenthicPlusReadyLogo play={readyMotion.play} size={120} />
  <div class="bc-plus-panel--chip"><BenthicPlusChip /></div>
  <h1 class="bc-plus-panel--title">{t('benthicPlus.ready.title')}</h1>
  <p class="bc-plus-panel--lead">{t(deviceKey('benthicPlus.ready.lead', kind))}</p>
</div>

<style>
  @layer bc.components {
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
    /* A tablet (task 2026-11-23-335): the column is centred on the panel, 176 dp from its top. The disc, then the chip 24 dp
       under it, the title 14 dp under the chip and the line 8 dp under the title. */
    .bc-plus-panel--centered {
      position: absolute;
      inset: 176px 0 auto;
      flex: none;
      box-sizing: border-box;
      align-items: center;
      justify-content: flex-start;
      gap: 0;
      padding: 0 48px;
      text-align: center;

      & .bc-plus-panel--chip {
        margin-top: 24px;
      }

      & .bc-plus-panel--title {
        margin-top: 14px;
      }

      & .bc-plus-panel--lead {
        margin-top: 8px;
      }
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
