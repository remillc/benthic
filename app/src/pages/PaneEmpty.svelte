<script>
  // @ts-check
  // The detail pane of a tablet list-and-detail layout, back to its first view (« Choisissez
  // une plongée pour la voir ici »), as a page: in a master-detail pair Framework7 does not go
  // back to the master alone, so a pane is emptied by showing this page with reloadDetail
  // (to-do #33). Same text and look as the empty view drawn by App.svelte.
  import { Page } from 'framework7-svelte';
  import { t } from '../lib/i18n.js';
</script>

<Page class="bc-pane-empty">
  <p class="bc-pane-empty--text">{t('tablet.noDive')}</p>
</Page>

<style>
  @layer bc.components {
    :global(.page.bc-pane-empty) {
      --f7-page-bg-color: var(--bc-surface);
    }

    :global(.bc-pane-empty .page-content) {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-pane-empty--text {
      margin: 0;
      padding: 24px;
      color: var(--bc-text-2);
      font-size: 16px;
      text-align: center;
    }
  }
</style>
