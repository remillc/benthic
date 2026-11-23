<script>
  // @ts-check
  // « Ce que le fichier contient » (task 2026-11-23-360): one row per part of the `.benthic` file and its count, read from the
  // manifest (only the parts the file has), then the note on the pale yellow container: the file holds personal information in
  // clear text, Benthic encrypts it on this device.
  import Icon from './Icon.svelte';
  import { contentsRows } from '../lib/benthic-import-text.js';
  import { deviceKey } from '../lib/first-launch-phone.js';
  import { formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ counts: import('../lib/benthic-import.js').Counts, sensitive: boolean, kind: 'phone'|'iphone'|'tablet'|'desktop' }} */
  let { counts, sensitive, kind } = $props();

  const rows = $derived(contentsRows(counts, t, (n) => formatNumber(n)));
</script>

<section class="bc-benthic-contents" aria-label={t('benthicImport.contentsTitle')}>
  <h3 class="bc-benthic-contents--title">{t('benthicImport.contentsTitle')}</h3>
  <ul class="bc-benthic-contents--rows">
    {#each rows as row (row.key)}
      <li class="bc-benthic-contents--row" data-row={row.key}>
        <span class="bc-benthic-contents--label">{row.title}</span>
        <span class="bc-benthic-contents--value">{row.value}</span>
      </li>
    {/each}
  </ul>
  {#if sensitive}
    <p class="bc-benthic-contents--note">
      <span class="bc-benthic-contents--lock"><Icon name="lock" size={20} /></span>
      <span>{t(deviceKey('benthicImport.note', kind))}</span>
    </p>
  {/if}
</section>

<style>
  @layer bc.components {
    .bc-benthic-contents {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-benthic-contents--title {
      margin: 8px 0 0;
      font-size: 14px;
      line-height: 19px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-benthic-contents--rows {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 16px;
      background: var(--bc-surface);
    }

    .bc-benthic-contents--row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px;
      font-size: 15px;
      line-height: 20px;

      & + & {
        border-top: 1px solid var(--bc-surface-container-highest);
      }
    }

    .bc-benthic-contents--label {
      font-weight: 500;
    }

    .bc-benthic-contents--value {
      color: var(--bc-text-2);
      text-align: end;
      white-space: nowrap;
    }

    .bc-benthic-contents--note {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin: 4px 0 0;
      padding: 14px 16px;
      border-radius: 16px;
      background: var(--bc-first-tile-warn);
      font-size: 14px;
      line-height: 19px;
    }

    .bc-benthic-contents--lock {
      flex: none;
      display: flex;
      color: var(--bc-pending);
    }
  }
</style>
