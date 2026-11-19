<script>
  // @ts-check
  // <PhotoBusy>: the indeterminate indicator laid over a photo or scan slot while the picture is read, shrunk and sealed
  // (cards, insurance, medical certificates, other documents). Android: the Material 3 Expressive loading indicator;
  // iOS: an activity-indicator ring. Reduced motion: the loading indicator is one still shape, the ring turns slowly.
  // The label is read once (role status).
  import { f7 } from 'framework7-svelte';
  import LoadingIndicator from './LoadingIndicator.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ size?: number, class?: string }} */
  let { size = 32, class: extraClass = '' } = $props();
  const ios = f7.theme === 'ios';
  const label = t('diverProfile.cert.photoReading');
</script>

<span class="od-photo-busy {extraClass}">
  {#if ios}
    <span class="od-photo-busy--ring" role="status" aria-label={label} style:width="{size}px" style:height="{size}px"></span>
  {:else}
    <LoadingIndicator {size} {label} />
  {/if}
</span>

<style>
  @layer od.components {
    .od-photo-busy {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: inherit;
      background: color-mix(in srgb, var(--od-surface) 72%, transparent);
    }

    .od-photo-busy--ring {
      box-sizing: border-box;
      border: 3px solid var(--od-text-2);
      border-right-color: transparent;
      border-radius: 50%;
      animation: od-photo-busy-spin 0.9s linear infinite;
    }

    @keyframes od-photo-busy-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-photo-busy--ring {
        animation-duration: 3s;
      }
    }
  }
</style>
