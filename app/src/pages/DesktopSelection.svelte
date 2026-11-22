<script>
  // @ts-check
  // The desktop's detail pane when several dives are selected (task 2026-11-15-169, mock-up
  // bureau-carnet-menu-contextuel): « 2 plongées sélectionnées », their numbers, the time under
  // water and the deepest depth, and how to act on them.
  import { Page } from 'framework7-svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { desk } from '../lib/desktop-logbook.svelte.js';
  import { selectionSummary } from '../lib/desktop-table.js';
  import { formatDepth, formatNumber } from '../lib/format.js';
  import { t, locale } from '../lib/i18n.js';

  const conjunction = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });

  const dives = $derived(logbook.dives.filter((d) => desk.selection.ids.includes(d.id)));
  const summary = $derived(selectionSummary(dives));

  /** « 6 et 7 », « 2, 5 et 9 »; past eight numbers, the first ones and « … ». */
  const numbers = $derived.by(() => {
    const list = summary.numbers.filter(Boolean).map((n) => formatNumber(n));
    if (list.length > 8) return `${list.slice(0, 7).join(', ')}…`;
    return conjunction.format(list);
  });
</script>

<Page class="bc-desktop-selection">
  <div class="bc-desktop-selection--body" role="status">
    <h2 class="bc-desktop-selection--title">{t('desktop.selected', { n: summary.count })}</h2>
    <p class="bc-desktop-selection--figures bc-value">
      {[
        numbers ? t('desktop.numbers', { numbers }) : '',
        t('desktop.underWater', { n: Math.round(summary.seconds / 60) }),
        t('desktop.deepest', { depth: formatDepth(summary.maxDepthMm, logbook.prefs) }),
      ]
        .filter(Boolean)
        .join(' · ')}
    </p>
    <p class="bc-desktop-selection--hint">{t('desktop.selectionHint')}</p>
  </div>
</Page>

<style>
  @layer bc.components {
    .bc-desktop-selection--body {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      padding: 24px;
      text-align: center;
    }
    .bc-desktop-selection--title {
      margin: 0 0 8px;
      font-family: var(--bc-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-selection--figures {
      margin: 0 0 6px;
      font-size: 15px;
      color: var(--bc-text);
    }
    .bc-desktop-selection--hint {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }
  }
</style>
