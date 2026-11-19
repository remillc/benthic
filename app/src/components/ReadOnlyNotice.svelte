<script>
  // @ts-check
  // The warning of the equipment inventory once an OpenDives+ subscription has ended (task 2026-11-17-267):
  // the inventory is read only for 30 days, then the diver loses it unless they subscribe again or export it.
  // Shown only while the flag of the store (lib/inventory.svelte.js) is set.
  import Icon from './Icon.svelte';
  import { gear } from '../lib/inventory.svelte.js';
  import { formatDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ onexport?: () => void }} */
  let { onexport } = $props();
</script>

{#if gear.readOnly}
  <div class="od-read-only-notice" role="status">
    <span class="od-read-only-notice--icon"><Icon name="warning" size={24} /></span>
    <span class="od-read-only-notice--texts">
      <span class="od-read-only-notice--title">{t('gear.inventory.readOnlyTitle')}</span>
      <span class="od-read-only-notice--text">
        {gear.daysLeft > 0 ? t('gear.inventory.readOnlyText', { date: formatDate(gear.until) }) : t('gear.inventory.readOnlyExpired')}
      </span>
      {#if onexport}<button type="button" class="od-read-only-notice--button" onclick={onexport}>{t('gear.inventory.readOnlyExport')}</button>{/if}
    </span>
  </div>
{/if}

<style>
  @layer od.components {
    .od-read-only-notice {
      margin: 8px 16px 0;
      padding: 12px 16px;
      border-radius: 16px;
      display: flex;
      gap: 12px;
      background: var(--od-alarm-tint);
      color: var(--od-text);
    }

    .od-read-only-notice--icon {
      flex: none;
      display: flex;
      color: var(--od-alarm);
    }

    .od-read-only-notice--texts {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .od-read-only-notice--title {
      font-size: 16px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-read-only-notice--text {
      font-size: 14px;
      line-height: 20px;
    }

    .od-read-only-notice--button {
      width: auto;
      margin-top: 8px;
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: var(--od-tonal);
      color: var(--od-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }
  }
</style>
