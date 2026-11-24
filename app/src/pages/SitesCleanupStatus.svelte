<script>
  // @ts-check
  // « Nettoyer les sites », the status page (task 2026-11-24-395; mock-ups sites-nettoyer-etat-android,
  // ios-sites-nettoyer-etat): one row per problem that exists, with a round icon, the count, what to do and a
  // chevron. Each row opens its own screen; Back from there returns here.
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import { cleanupCounts, logbook } from '../lib/sites.svelte.js';
  import { cleanupProblems } from '../lib/site-cleanup.js';
  import { t } from '../lib/i18n.js';

  let loaded = $state(false);
  let problems = $state(/** @type {ReturnType<typeof cleanupProblems>} */ ([]));

  $effect(() => {
    logbook.sitesVersion;
    cleanupCounts().then((counts) => {
      problems = cleanupProblems(counts);
      loaded = true;
    });
  });
</script>

<Page class="bc-sites-cleanup-status">
  <Navbar title={t('sites.cleanupTitle')}>
    {#snippet left()}
      <Link back iconOnly><i class="icon icon-back"></i><span class="bc-sr-only">{t('common.back')}</span></Link>
    {/snippet}
  </Navbar>

  {#if problems.length}
    <nav class="bc-sites-cleanup-status--surface" aria-label={t('sites.todoLabel')}>
      {#each problems as p (p.kind)}
        <a href={p.route} class="bc-sites-cleanup-status--row" data-problem={p.kind}>
          <span class="bc-sites-cleanup-status--icon" aria-hidden="true"><Icon name={p.icon} size={22} /></span>
          <span class="bc-sites-cleanup-status--text">
            <span class="bc-sites-cleanup-status--title">{t(p.title, { n: p.count })}</span>
            <span class="bc-sites-cleanup-status--hint">{t(p.hint)}</span>
          </span>
          <span class="bc-sites-cleanup-status--chevron" aria-hidden="true"><Icon name="chevron" size={20} /></span>
        </a>
      {/each}
    </nav>
  {:else if loaded}
    <p class="bc-intro" role="status">{t('sites.noPointsToFix')}</p>
  {/if}
</Page>

<style>
  @layer bc.components {
    .bc-sites-cleanup-status--surface {
      margin: 8px 16px 0;
      border-radius: 20px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-sites-cleanup-status--row {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 72px;
      padding: 8px 12px 8px 16px;
      box-sizing: border-box;
      color: var(--bc-text);
      text-decoration: none;

      & + & {
        border-top: 1px solid var(--bc-separator);
      }
    }

    .bc-sites-cleanup-status--icon {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      background: var(--bc-surface-2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-sites-cleanup-status--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-sites-cleanup-status--title {
      font-size: 16px;
      line-height: 24px;
    }

    .bc-sites-cleanup-status--hint {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-sites-cleanup-status--chevron {
      flex: none;
      color: var(--bc-text-2);
    }
  }
</style>
