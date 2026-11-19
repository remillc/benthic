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
    weights: 'M3 8.5h18v7H3zM8 8.5v7M16 8.5v7M10.5 12h3',
    light: 'M8 3h8l1.5 5h-11zM9.5 8v12a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V8M12 11.5v3',
    // The 7 types added with the fields by type (task 2026-11-19-309): mask, fins, scooter, camera, buoy of a float, knife.
    mask: 'M3.5 9.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2.5a4.5 4.5 0 0 1-4.5 4.5h-1.2l-1.3-2h-3l-1.3 2H8a4.5 4.5 0 0 1-4.5-4.5zM8 11.2h2.5M13.5 11.2H16',
    fins: 'M9 3.5h3.5l3 10.5c.6 2.2 2.4 3.4 5 4.5l-.3 2H7.5c-1.2-1.6-1.7-3.2-1.7-5.2z',
    scooter: 'M3.5 12c0-2.4 2.6-4 6-4h6.5a4 4 0 0 1 0 8H9.5c-3.4 0-6-1.6-6-4zM10 8V5.5h3M20 12h1.5M7 12h4',
    camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    floatBuoy: 'M12 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 13.5V17M2.5 19c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.1-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.1 1.2',
    knife: 'M4.5 19.5l3-3M7.5 16.5L17 7c1.3-1.3 2.5-1.8 3.5-1.5.3 1.2-.2 3-1.5 4.3l-6.5 6.5zM8.5 20.5l-2-2',
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
{:else if path}
  <svg class="od-gear-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
{:else}
  <Icon name="briefcase" {size} weight={1.8} />
{/if}

<style>
  @layer od.components {
    .od-gear-icon {
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  }
</style>
