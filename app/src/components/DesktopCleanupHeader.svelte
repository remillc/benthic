<script>
  // @ts-check
  // The head of a step of « Nettoyer les sites » on the desktop (task 2026-11-24-395): « ‹ Nettoyer les sites »
  // above the title, which brings back the status page, and, on the right of the title, the step's action.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ title: string, onback?: () => void, action?: import('svelte').Snippet }} */
  let { title, onback, action } = $props();
</script>

<header class="bc-cleanup-header">
  {#if onback}
    <button type="button" class="bc-cleanup-header--back" onclick={onback}>
      <Icon name="arrowBack" size={18} />
      <span>{t('sites.cleanupTitle')}</span>
    </button>
  {/if}
  <div class="bc-cleanup-header--line">
    <h2 class="bc-cleanup-header--title">{title}</h2>
    {#if action}<div class="bc-cleanup-header--action">{@render action()}</div>{/if}
  </div>
</header>

<style>
  @layer bc.components {
    .bc-cleanup-header {
      margin-bottom: 8px;
    }
    .bc-cleanup-header--back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 32px;
      padding: 0 8px 0 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-on-table-selected);
      cursor: pointer;
      &:hover {
        text-decoration: underline;
      }
    }
    .bc-cleanup-header--line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .bc-cleanup-header--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 24px;
      line-height: 30px;
      font-weight: 500;
    }
  }
</style>
