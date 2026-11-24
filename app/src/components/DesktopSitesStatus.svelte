<script>
  // @ts-check
  // « Nettoyer les sites » on the desktop (task 2026-11-24-395; mock-up bureau-sites-nettoyer-etat): one row for
  // each problem that exists, with its count and what to do. A row opens its step in this pane.
  import Icon from './Icon.svelte';
  import DesktopCleanupHeader from './DesktopCleanupHeader.svelte';
  import { cleanupProblems } from '../lib/site-cleanup.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ counts: { duplicates: number, unused: number, without: number, unplaced: number }, onopen: (kind: string) => void }} */
  let { counts, onopen } = $props();

  const problems = $derived(cleanupProblems(counts));
</script>

<section class="bc-cleanup-status" data-bc-scroll aria-label={t('sites.cleanupTitle')}>
  <DesktopCleanupHeader title={t('sites.cleanupTitle')} />
  {#if problems.length}
    <div class="bc-cleanup-status--surface">
      {#each problems as p (p.kind)}
        <button type="button" class="bc-cleanup-status--row" data-problem={p.kind} onclick={() => onopen(p.kind)}>
          <span class="bc-cleanup-status--icon" aria-hidden="true"><Icon name={p.icon} size={20} /></span>
          <span class="bc-cleanup-status--text">
            <span class="bc-cleanup-status--title">{t(p.title, { n: p.count })}</span>
            <span class="bc-cleanup-status--hint">{t(p.hint)}</span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
      {/each}
    </div>
  {:else}
    <p class="bc-cleanup-status--none" role="status">{t('sites.noPointsToFix')}</p>
  {/if}
</section>

<style>
  @layer bc.components {
    .bc-cleanup-status {
      box-sizing: border-box;
      height: 100%;
      overflow: auto;
      padding: 4px 12px 24px 4px;
    }
    .bc-cleanup-status--surface {
      max-width: 560px;
      border-radius: 16px;
      background: var(--bc-surface);
      overflow: hidden;
    }
    .bc-cleanup-status--row {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      min-height: 64px;
      padding: 8px 12px 8px 16px;
      box-sizing: border-box;
      border: 0;
      background: none;
      font: inherit;
      color: var(--bc-text);
      text-align: left;
      cursor: pointer;
      & + & {
        border-top: 1px solid var(--bc-separator);
      }
      &:hover {
        background: color-mix(in srgb, currentColor 6%, transparent);
      }
    }
    .bc-cleanup-status--icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--bc-surface-2);
    }
    .bc-cleanup-status--text {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .bc-cleanup-status--title {
      font-size: 15px;
    }
    .bc-cleanup-status--hint {
      font-size: 13px;
      color: var(--bc-text-2);
    }
    .bc-cleanup-status--none {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }
  }
</style>
