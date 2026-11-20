<script>
  // @ts-check
  // The icon of a piece of equipment, by type (task 2026-11-17-267). Simple strokes on 24 × 24, as Icon.svelte.
  // Decorative: the row's text names the piece.
  import Icon from './Icon.svelte';
  import DcTile from './DcTile.svelte';
  import { isBuoyName } from '../lib/inventory.js';
  import { ownPhoto } from '../lib/gear-photos.svelte.js';
  import { ios } from '../lib/layout.svelte.js';

  /**
   * A computer shows its photo (task 2026-11-19-306) when `piece` is given: the diver's own, else the catalog's
   * for the model; a model without a photo keeps the icon. `tile`: the side in px of the tile the photo fills (the
   * size of the icon it replaces); `radius`: its corner.
   * @type {{ type: import('../lib/inventory.js').GearType|'kit'|'buoy', name?: string, size?: number, piece?: { computerModel?: string, name?: string, photoId?: string }, tile?: number, radius?: number }}
   */
  let { type, name = '', size = 24, piece, tile = 0, radius = ios ? 8 : 10 } = $props();

  /** @type {Record<string, string>} */
  const paths = {
    regulator: 'M9 4.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 10.5v3a4 4 0 0 0 4 4h1.5M16.5 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    suit: 'M8 3.5l-4.5 3 2 4 2-1V20.5h9V9.5l2 1 2-4-4.5-3c-.5 1.4-1.8 2.2-4 2.2S8.5 4.9 8 3.5z',
    cylinder: 'M10 2.5h4v2c2 .5 3.5 2.2 3.5 4.5v10.5a2.5 2.5 0 0 1-2.5 2.5H9a2.5 2.5 0 0 1-2.5-2.5V9c0-2.3 1.5-4 3.5-4.5z',
    // The vest: collar, centre opening, two straps (task 2026-11-18-283).
    bcd: 'M8.5 3L5 5.5V19a2 2 0 0 0 2 2h3.5V10l1.5 1.5 1.5-1.5v11H17a2 2 0 0 0 2-2V5.5L15.5 3M8.5 3c.6 1.6 1.9 2.5 3.5 2.5s2.9-.9 3.5-2.5M5 13h5.5M13.5 13H19M5 16.5h5.5M13.5 16.5H19',
    // The surface marker buoy (« Saucisse »): a flat-top tube, two bands, two wave lines.
    buoy: 'M9.5 17V3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5V17M9.5 7h5M9.5 10.5h5M2.5 18.5c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.1-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.1 1.2M5 21.5c1.4 0 1.4-1 2.8-1s1.4 1 2.8 1 1.4-1 2.8-1 1.4 1 2.8 1 1.4-1 2.8-1',
    weights: 'M5 10H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2M9 10h6M9 14h6M19 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2M6 7.5h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM16 7.5h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z',
    light: 'M4 8.5h7a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5zM13.5 7h1.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM5.5 14.5V20a1.5 1.5 0 0 0 3 0v-5.5M18.5 7.5l2.5-1.5M19 11.5h2.5M18.5 15.5l2.5 1.5',
    // The 7 types added with the fields by type (task 2026-11-19-309): mask, fins, scooter, camera, buoy of a float, knife.
    // Redrawn from the mock-ups (task 2026-11-19-310): weight belt, light, fins and knife.
    mask: 'M3.5 9.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2.5a4.5 4.5 0 0 1-4.5 4.5h-1.2l-1.3-2h-3l-1.3 2H8a4.5 4.5 0 0 1-4.5-4.5zM8 11.2h2.5M13.5 11.2H16',
    fins: 'M5 3h3.5l.5 5.5 2 11a1.2 1.2 0 0 1-1.2 1.5H3.7a1.2 1.2 0 0 1-1.2-1.5l2-11zM15.5 3H19l.5 5.5 2 11a1.2 1.2 0 0 1-1.2 1.5h-6.1a1.2 1.2 0 0 1-1.2-1.5l2-11zM6.75 11v7M17.25 11v7',
    camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    floatBuoy: 'M12 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 13.5V17M2.5 19c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.1-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.1 1.2',
    knife: 'M9.5 3.5a7 7 0 0 0-4.5 6.5v4a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6v-4a7 7 0 0 0-4.5-6.5L12 9zM10.5 8.6l1.5 2.4 1.5-2.4M10.4 16a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0z',
    diveKnife: 'M5 19l5-5m-1-2 3 3m-1-2 5-7 4-2-2 4-6 6M4 20l2 2 4-4-2-2z',
    compass: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM15.5 8.5l-2 5-5 2 2-5zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2',
  };
  // An « Autre » piece named like a surface marker buoy shows the buoy.
  const shown = $derived(type === 'dsmb' || (type === 'other' && isBuoyName(name)) ? 'buoy' : type === 'undersuit' ? 'suit' : type);
  const path = $derived(paths[shown]);
</script>

{#snippet computerIcon()}
  <Icon name="wristComputer" {size} weight={1.8} />
{/snippet}

{#if type === 'computer' && piece && tile}
  <DcTile model={piece.computerModel || piece.name || name} size={tile} {radius} photo={ownPhoto(piece.photoId)} fallback={computerIcon} />
{:else if type === 'computer'}
  <Icon name="wristComputer" {size} weight={1.8} />
{:else if type === 'scooter'}
  <svg class="bc-gear-icon bc-gear-icon--scooter" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 7.8h1.8c1.8 0 3.2 1.9 3.2 4.2s-1.4 4.2-3.2 4.2H5M10 10c.5-.3 1-.4 1.6-.4h6.8c2.4 0 4 1 4 2.4s-1.6 2.4-4 2.4h-6.8c-.6 0-1.1-.1-1.6-.4M18.5 9.6c.5 1.5.5 3.3 0 4.8" />
    <ellipse cx="5" cy="12" rx="3.3" ry="4.2" />
    <path class="bc-gear-icon--propeller" fill-rule="evenodd" d="M4.62 11.5c-.36-.8-.3-1.7.25-1.8.55-.1.77.66.5 1.8.28.13.4.32.43.57.8.04 1.36.4 1.27.85-.1.45-.67.55-1.14.25l-.53-.36c-.2.11-.42.11-.62 0-.65.51-1.26.63-1.5.25-.27-.43.18-.88 1.12-.99.03-.25.1-.44.22-.57zM4.96 11.86a.28.28 0 1 0 0 .56.28.28 0 0 0 0-.56z" />
  </svg>
{:else if path}
  <svg class="bc-gear-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
{:else}
  <Icon name="briefcase" {size} weight={1.8} />
{/if}

<style>
  @layer od.components {
    .bc-gear-icon {
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .bc-gear-icon--scooter {
      stroke-width: 1.2;
    }

    .bc-gear-icon--propeller {
      fill: currentColor;
      stroke: none;
    }
  }
</style>
