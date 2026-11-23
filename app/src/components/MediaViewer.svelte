<script>
  // @ts-check
  // The popup of a photo or video full screen (tasks 2026-11-23-367 and 368). Like the gallery's, it stays mounted and opens and
  // closes with `open`; its content (MediaViewerBody.svelte) exists only while it is open, and `start` is the picture it opens on.
  import { Popup } from 'framework7-svelte';
  import MediaViewerBody from './MediaViewerBody.svelte';
  import { t } from '../lib/i18n.js';
  import { ios, layout } from '../lib/layout.svelte.js';

  /** @type {{ open: boolean, start: number, onclose: () => void } & Record<string, any>} */
  let { open, start, onclose, ...rest } = $props();

  const desk = $derived(layout.desktop);
  const variant = $derived(desk ? 'desk' : ios ? 'ios' : 'md');
  const wide = $derived(desk || !layout.phone);
</script>

<Popup class="bc-media-viewer bc-media-viewer--{variant}{wide ? ' bc-media-viewer--wide' : ''}" opened={open} tabletFullscreen push={false} swipeToClose={false} closeByBackdropClick={false} onPopupClosed={onclose} aria-label={t('detail.mediaGallery')}>
  {#if open}<MediaViewerBody {...rest} {start} {onclose} />{/if}
</Popup>
