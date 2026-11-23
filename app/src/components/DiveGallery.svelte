<script>
  // @ts-check
  // The popup of the gallery of a dive's photos and videos (tasks 2026-11-23-367 and 368). It stays mounted with the dive's section
  // and opens and closes with `open`; its content (DiveGalleryBody.svelte) exists only while it is open. Framework7 moves a
  // popup's element to the page's root when it opens, so a popup that was created and destroyed with an `{#if}` would leave its
  // element behind.
  import { Popup } from 'framework7-svelte';
  import DiveGalleryBody from './DiveGalleryBody.svelte';
  import { t } from '../lib/i18n.js';
  import { ios, layout } from '../lib/layout.svelte.js';

  /** @type {{ open: boolean, onclose: () => void } & Record<string, any>} */
  let { open, onclose, ...rest } = $props();

  const desk = $derived(layout.desktop);
  const variant = $derived(desk ? 'desk' : ios ? 'ios' : 'md');
</script>

<Popup
  class="bc-dive-gallery bc-dive-gallery--{variant}{desk ? ' bc-dive-gallery--dialog' : ''}"
  opened={open}
  tabletFullscreen={!desk}
  push={false}
  swipeToClose={false}
  closeByBackdropClick={desk}
  onPopupClosed={onclose}
  aria-label={t('detail.mediaGallery')}
>
  {#if open}<DiveGalleryBody {...rest} {onclose} />{/if}
</Popup>
