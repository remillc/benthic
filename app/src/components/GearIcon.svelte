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

  // The 20 drawings of the type board of « Nouvelle pièce » (docs/mockups/android-tablette-profil-piece-nouvelle-type-paysage.dc.html,
  // task 2026-11-22-324): 24 grid, round caps and joins, no fill. The mock-up's rectangles and circles are written as paths.
  /** @type {Record<string, string>} */
  const paths = {
    computer: 'M9.5 6h5a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1 -3.5 3.5h-5a3.5 3.5 0 0 1 -3.5 -3.5v-5a3.5 3.5 0 0 1 3.5 -3.5zM9 6V3h6v3M9 18v3h6v-3M9 12h1.5l1-2 1.5 4 1-2H15',
    regulator: 'M7 11a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M10.6 11a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0M7 9.5H4.8a1.5 1.5 0 0 0 0 3H7M9.5 18.6c1 .9 2.2 1.4 3.5 1.4s2.5-.5 3.5-1.4M19 10.5h.5a2 2 0 0 0 2-2V3',
    suit: 'M9 3h6l4.5 3.5-2 3-2.5-1.5V21H9V8L6.5 9.5l-2-3zM12 8v6',
    undersuit: 'M8.5 4l-4.5 2.5 1.5 4.5 2-1V20h9V10l2 1 1.5-4.5L15.5 4c-.6 1.4-1.9 2.2-3.5 2.2S9.1 5.4 8.5 4zM8 13h8M8 16h8',
    cylinder: 'M10 2.5h4M12 2.5V5M9 8a3 3 0 0 1 6 0v12a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 20zM9 11.5h6',
    rebreather: 'M7.53 2.00a1.95 1.95 0 0 1 1.95 1.95V17.32a1.95 1.95 0 0 1 -3.89 0V3.95a1.95 1.95 0 0 1 1.95 -1.95zM16.47 2.00a1.95 1.95 0 0 1 1.95 1.95V17.32a1.95 1.95 0 0 1 -3.89 0V3.95a1.95 1.95 0 0 1 1.95 -1.95zM9.47 3.89H14.53V19.89H9.47zM10.9 19.89L9.9 22.40H14.1L13.1 19.89M10.74 3.89C10.42 2.63 9.16 2.21 7.89 2.11M13.26 3.89C13.58 2.63 14.84 2.21 16.11 2.11',
    // Three cells on a line (mock-up profil-piece-nouvelle-type-menu-android).
    o2Cells: 'M2.8 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0M8.8 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0M14.8 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0M3 18h18',
    bcd: 'M8.5 3L5 5.5V19a2 2 0 0 0 2 2h3.5V10l1.5 1.5 1.5-1.5v11H17a2 2 0 0 0 2-2V5.5L15.5 3M8.5 3c.6 1.6 1.9 2.5 3.5 2.5s2.9-.9 3.5-2.5M5 13h5.5M13.5 13H19M5 16.5h5.5M13.5 16.5H19',
    light: 'M4 8.5h7a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1 -1.5 1.5h-7a1.5 1.5 0 0 1 -1.5 -1.5v-3a1.5 1.5 0 0 1 1.5 -1.5zM13.5 7h1.5a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-1.5a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1zM5.5 14.5V20a1.5 1.5 0 0 0 3 0v-5.5M18.5 7.5l2.5-1.5M19 11.5h2.5M18.5 15.5l2.5 1.5',
    weights: 'M5 10H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2M9 10h6M9 14h6M19 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2M6 7.5h2a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1zM16 7.5h2a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1z',
    mask: 'M3.5 9a2.5 2.5 0 0 1 2.5-2.5h12A2.5 2.5 0 0 1 20.5 9v3.5a3.5 3.5 0 0 1-3.5 3.5h-2.3l-1.2-2a1.75 1.75 0 0 0-3 0l-1.2 2H7a3.5 3.5 0 0 1-3.5-3.5zM12 6.5v4.5M3.5 10H2M20.5 10H22',
    fins: 'M9 2.5h6l.6 5.5 2.7 11.6a1.6 1.6 0 0 1-1.6 1.9H7.3a1.6 1.6 0 0 1-1.6-1.9L8.4 8zM8.4 8h7.2M10.3 11.5l-.9 7.5M13.7 11.5l.9 7.5',
    scooter: 'M16 8.5H6a3.5 3.5 0 0 0 0 7h10zM17.5 5.5h2a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1 -1.5 1.5h-2a1.5 1.5 0 0 1 -1.5 -1.5v-10a1.5 1.5 0 0 1 1.5 -1.5zM18.5 8v8M2.5 12h2',
    camera: 'M3 8h4l2-2.5h6L17 8h4v11H3zM8.5 13a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0',
    dsmb: 'M7 3h10l-2 14H9zM12 17v4',
    floatBuoy: 'M10 3h4v13a2 2 0 0 1-4 0zM12 18v4',
    knife: 'M9.5 3.5a7 7 0 0 0-4.5 6.5v4a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6v-4a7 7 0 0 0-4.5-6.5L12 9zM10.5 8.6l1.5 2.4 1.5-2.4M10.4 16a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0',
    diveKnife: 'M10.9 15.8L18.3 8.4L20.4 5.6L21.1 2.0L17.0 4.3L14.5 6.8L14.5 8.0L13.3 8.0L13.4 9.2L12.2 9.1L12.3 10.3L11.1 10.2L8.2 13.1zM7.0 11.9L12.1 17.0M8.4 13.3L2.9 18.8L2.7 20.2L3.8 21.3L5.2 21.1L10.7 15.6M6.6 15.1L8.9 17.4M4.8 16.9L7.1 19.2',
    compass: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M15.5 8.5l-2 5-5 2 2-5z',
    other: 'M10.7 5.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0M10.7 12a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0M10.7 18.5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0',
  };
  // An « Autre » piece named like a surface marker buoy shows the buoy of « Parachute de palier ».
  const shown = $derived(type === 'buoy' || (type === 'other' && isBuoyName(name)) ? 'dsmb' : type);
  const path = $derived(paths[shown]);
</script>

{#snippet computerIcon()}
  <svg class="bc-gear-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={paths.computer} /></svg>
{/snippet}

{#if type === 'computer' && piece && tile}
  <DcTile model={piece.computerModel || piece.name || name} size={tile} {radius} photo={ownPhoto(piece.photoId)} fallback={computerIcon} />
{:else if type === 'kit'}
  <Icon name="briefcase" {size} weight={1.8} />
{:else}
  <svg class="bc-gear-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={path ?? paths.other} /></svg>
{/if}

<style>
  @layer bc.components {
    .bc-gear-icon {
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  }
</style>
