<script>
  // @ts-check
  // The card of a `.benthic` file (task 2026-11-23-360): the Benthic logo, the file's name and « Export complet de Benthic, 2026-11-20 ».
  // On « Nouveau carnet », on the progress screen and in the replace overlay.
  import { exportDay } from '../lib/benthic-import-text.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ name: string, exportedAt: string }} */
  let { name, exportedAt } = $props();
</script>

<div class="bc-benthic-file-card">
  <span class="bc-benthic-file-card--logo"><img src="logo-light.svg" alt="" width="32" height="32" /></span>
  <span class="bc-benthic-file-card--text">
    <span class="bc-benthic-file-card--name">{name}</span>
    {#if exportedAt}<span class="bc-benthic-file-card--detail">{t('benthicImport.fileCardDetail', { date: exportDay(exportedAt) })}</span>{/if}
  </span>
</div>

<style>
  @layer bc.components {
    .bc-benthic-file-card {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 14px 16px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 16px;
      background: var(--bc-surface);
    }

    .bc-benthic-file-card--logo {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: var(--bc-release-panel, #0f3a63);
    }

    .bc-benthic-file-card--text {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 2px;
    }

    .bc-benthic-file-card--name {
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .bc-benthic-file-card--detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }
  }
</style>
