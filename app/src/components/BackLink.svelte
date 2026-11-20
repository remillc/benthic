<script>
  // @ts-check
  // The Back button of a pushed page. iPhone: the chevron and the title of the page it returns to (« ‹ Compte »), as iOS
  // does (task 2026-11-19-289); elsewhere the arrow alone, named for screen readers.
  import { Link } from 'framework7-svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** `label`: the previous page's title, shown on iPhone. `name`: the arrow's accessible name. */
  let { label = '', name = '' } = $props();
</script>

{#if ios && label}
  <Link back class="bc-back-link"><i class="icon icon-back"></i><span>{label}</span></Link>
{:else}
  <Link back iconOnly>
    <i class="icon icon-back"></i>
    <span class="bc-sr-only">{name || label || t('detail.back')}</span>
  </Link>
{/if}
