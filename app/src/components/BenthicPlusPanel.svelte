<script>
  // @ts-check
  // The blue panel's content on the OpenDives+ « Vos données de santé » and « Votre carnet est prêt » steps, on a tablet
  // and on the desktop (task 2026-11-18-275, bureau-odplus-sante and bureau-odplus-pret): the same header as the phone's
  // (the lock or the logo that turns into the check mark, the chip, the title and the lead), in the panel; on « prêt » the
  // disc is 120 px, the ring spreads 56 px and the bubbles rise across the whole panel.
  import Icon from './Icon.svelte';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import BenthicPlusReadyLogo from './BenthicPlusReadyLogo.svelte';
  import BenthicPlusReadyBubbles from './BenthicPlusReadyBubbles.svelte';
  import { readyMotion } from '../lib/ready-motion.svelte.js';
  import { deviceKey, deviceKind } from '../lib/first-launch-phone.js';
  import { desktopApp, ios, layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ step: 'odplusReady'|'odplusHealth' }} */
  let { step } = $props();

  const ready = $derived(step === 'odplusReady');
  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));
</script>

{#if ready && readyMotion.bubbles}<BenthicPlusReadyBubbles panel still={readyMotion.still} />{/if}
<div class="od-plus-panel">
  {#if ready}
    <BenthicPlusReadyLogo play={readyMotion.play} size={120} />
  {:else}
    <span class="od-plus-panel--lock"><Icon name="lock" size={44} weight={2} /></span>
  {/if}
  <BenthicPlusChip />
  <h1 class="od-plus-panel--title">{t(ready ? 'odplus.ready.title' : 'odplus.health.title')}</h1>
  <p class="od-plus-panel--lead">{ready ? t(deviceKey('odplus.ready.lead', kind)) : t('odplus.health.lead')}</p>
</div>

<style>
  @layer od.components {
    .od-plus-panel {
      position: relative;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 16px;
      padding-bottom: 96px;
    }
    .od-plus-panel--lock {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--od-release-on-panel) 16%, transparent);
      color: var(--od-release-on-panel);
    }
    .od-plus-panel--title {
      margin: 0;
      max-width: 540px;
      font-size: 40px;
      line-height: 48px;
      font-weight: 400;
      letter-spacing: -0.5px;
    }
    .od-plus-panel--lead {
      margin: 0;
      max-width: 520px;
      font-size: 16px;
      line-height: 22px;
      color: var(--od-release-on-panel-soft);
    }
  }
</style>
