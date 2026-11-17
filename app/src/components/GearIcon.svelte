<script>
  // @ts-check
  // The icon of a piece of equipment, by type (task 2026-11-17-267). Simple strokes on 24 × 24, as Icon.svelte.
  // Decorative: the row's text names the piece.
  import Icon from './Icon.svelte';

  /** @type {{ type: import('../lib/inventory.js').GearType|'kit', size?: number }} */
  let { type, size = 24 } = $props();

  /** @type {Record<string, string>} */
  const paths = {
    regulator: 'M9 4.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 10.5v3a4 4 0 0 0 4 4h1.5M16.5 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    suit: 'M8 3.5l-4.5 3 2 4 2-1V20.5h9V9.5l2 1 2-4-4.5-3c-.5 1.4-1.8 2.2-4 2.2S8.5 4.9 8 3.5z',
    cylinder: 'M10 2.5h4v2c2 .5 3.5 2.2 3.5 4.5v10.5a2.5 2.5 0 0 1-2.5 2.5H9a2.5 2.5 0 0 1-2.5-2.5V9c0-2.3 1.5-4 3.5-4.5z',
    light: 'M8 3h8l1.5 5h-11zM9.5 8v12a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V8M12 11.5v3',
  };
  const path = $derived(paths[type === 'undersuit' ? 'suit' : type]);
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
