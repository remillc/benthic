<script>
  // @ts-check
  // The photo of a dive computer (tasks 2026-11-19-302 and 303; docs/architecture.md, section 12): a square tile with
  // rounded corners, the photo filling it on a white ground. States (lib/dc-image-state.js): while the photo loads, or
  // when it cannot be fetched, the generic icon shows in a tile that already has its size (no spinner, no message, no
  // layout shift); the photo replaces it with a short fade when it arrives from the network, directly when the device
  // already had it. A failed fetch is asked again when the device is back online, or at the next display after a pause.
  // A model the catalog does not list has no tile: the `fallback` (by default the generic icon, 24 px) as before.
  // `photo`: the diver's own photo of this piece (OpenDives+ inventory, account data): it wins over the catalog.
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';
  import { loadComputerImage, knownImageEntry, getCatalog, forgetFailures, sizeFor } from '../lib/dc-images.js';
  import { initialImageState, nextImageState } from '../lib/dc-image-state.js';
  import { connection } from '../lib/online.svelte.js';
  import { ios } from '../lib/layout.svelte.js';

  /**
   * `model`: the text Subsurface keeps ("Shearwater Perdix AI"). `size`: the tile's side in px (48 in lists, 40 in
   * the download choice, 192 on the edit screen). `radius`: the corner in px, 12 (10 on iPhone) by default.
   * `fallback`: what to show for a model without a photo.
   * @type {{ model: string, size?: number, radius?: number, vendor?: string, photo?: string, fallback?: import('svelte').Snippet, class?: string }}
   */
  let { model, size = 48, radius, vendor = '', photo = '', fallback, class: extra = '' } = $props();

  let state = $state(initialImageState());
  /** The catalog is loaded: `known` is then the entry, or null for a model without a photo. */
  let catalogReady = $state(knownImageEntry('', '') !== undefined);
  let token = 0;

  /** @param {import('../lib/dc-image-state.js').ImageEvent} event */
  function send(event) {
    const before = state.phase;
    state = nextImageState(state, event);
    if (before !== 'loading' && state.phase === 'loading') load();
  }

  async function load() {
    const mine = ++token;
    const result = await loadComputerImage(model, sizeFor(size), vendor);
    if (mine === token) send({ type: 'result', src: result.src, cached: result.cached, now: Date.now() });
  }

  // A new model: start again. The catalog first (kept on the device, so it is quick), then the photo.
  $effect(() => {
    void model;
    void vendor;
    if (photo) return;
    // Only the model, the vendor and the photo start it again: `send` reads the state it writes, which would make
    // this effect depend on its own output (effect_update_depth_exceeded).
    return untrack(() => {
      token++;
      state = initialImageState();
      let current = true;
      if (knownImageEntry(model, vendor)) send({ type: 'show', now: Date.now() });
      getCatalog().then(() => {
        if (!current) return;
        catalogReady = true;
        if (state.phase === 'idle' && knownImageEntry(model, vendor)) send({ type: 'show', now: Date.now() });
      });
      return () => {
        current = false;
      };
    });
  });

  // Back online: ask again for what failed.
  $effect(() => {
    if (!connection.online || photo) return;
    untrack(() => {
      forgetFailures();
      send({ type: 'online', now: Date.now() });
    });
  });

  const hasPhoto = $derived(!!photo || (catalogReady && !!knownImageEntry(model, vendor)));
  const src = $derived(photo || (state.phase === 'ready' ? state.src : null));
  const fade = $derived(!photo && state.fade);
  let shown = $state(false);
  $effect(() => {
    void src;
    shown = false;
  });
  const corner = $derived(radius ?? (ios ? 10 : 12));
</script>

{#if hasPhoto}
  <span class="od-dc-tile {extra}" style:width="{size}px" style:height="{size}px" style:border-radius="{corner}px" class:od-dc-tile--shown={shown || !fade}>
    <span class="od-dc-tile--placeholder" aria-hidden="true"><Icon name="wristComputer" size={size >= 96 ? 72 : 24} weight={1.8} /></span>
    {#if src}
      <img class="od-dc-tile--image" {src} alt="" width={size} height={size} onload={() => (shown = true)} onerror={() => (state = { ...state, phase: 'failed', src: null, failedAt: Date.now() })} />
    {/if}
  </span>
{:else if fallback}
  {@render fallback()}
{:else}
  <Icon name="wristComputer" size={24} weight={1.8} />
{/if}

<style>
  @layer od.components {
    .od-dc-tile {
      flex: none;
      position: relative;
      display: block;
      overflow: hidden;
      background: var(--od-surface-container-high);
    }

    .od-dc-tile--placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--od-text-2);
    }

    .od-dc-tile--image {
      position: absolute;
      inset: 0;
      background: var(--od-photo-ground);
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 150ms linear;
    }

    .od-dc-tile--shown .od-dc-tile--image {
      opacity: 1;
    }

    @media (prefers-reduced-motion: reduce) {
      .od-dc-tile--image {
        transition: none;
      }
    }
  }
</style>
