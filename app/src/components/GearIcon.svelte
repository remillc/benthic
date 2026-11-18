<script>
  // @ts-check
  // The icon of a piece of equipment, by type (task 2026-11-17-267). Simple strokes on 24 × 24, as Icon.svelte.
  // Decorative: the row's text names the piece.
  import Icon from './Icon.svelte';
  import { isBuoyName } from '../lib/inventory.js';

  /** @type {{ type: import('../lib/inventory.js').GearType|'kit'|'buoy', name?: string, size?: number }} */
  let { type, name = '', size = 24 } = $props();

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
  };
  // An « Autre » piece named like a surface marker buoy shows the buoy.
  const shown = $derived(type === 'other' && isBuoyName(name) ? 'buoy' : type === 'undersuit' ? 'suit' : type);
  const path = $derived(paths[shown]);
</script>

{#if type === 'computer'}
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
