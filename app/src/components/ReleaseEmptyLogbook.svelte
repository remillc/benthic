<script>
  // @ts-check
  // The empty logbook of the release edition on a tablet (task 2026-11-15-220, part 2; mock-up
  // docs/mockups/android-tablette-carnet-vide-paysage.dc.html): in the detail pane, a centred 520 dp column with the
  // smooth decorative profile (no bubbles), the title and its line, « Télécharger mes plongées », then a paper with
  // « Importer un fichier », « Télécharger depuis divelogs.de » and « Noter une plongée à la main ». Every
  // « Créer le carnet » of the first launch lands here. Drawn by pages/Logbook.svelte over the empty detail pane.
  import DecorativeProfile from './DecorativeProfile.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   downloadRoute: string,
   *   choices: { key: string, icon: 'download'|'cloud'|'edit', text: string, note: string }[],
   *   routes: Record<string, string>,
   *   onchoose: (key: string) => void,
   * }}
   */
  let { downloadRoute, choices, routes, onchoose } = $props();
</script>

<div class="od-release-empty">
  <div class="od-release-empty--column">
    <DecorativeProfile trace class="od-release-empty--profile" />
    <h2 class="od-release-empty--title">{t('logbook.emptyTitle')}</h2>
    <p class="od-release-empty--text">{t('logbook.emptyText')}</p>
    <a href={downloadRoute} class="od-release-empty--download">
      <Icon name="bluetooth" size={20} weight={2} />{t('logbook.emptyPair')}
    </a>
    <nav class="od-release-empty--paper" aria-label={t('logbook.emptyOthers')}>
      {#each choices as c (c.key)}
        <a href={routes[c.key] ?? '#'} class="od-release-empty--row" onclick={(e) => { e.preventDefault(); onchoose(c.key); }}>
          <span class="od-release-empty--tile"><Icon name={c.icon} size={22} weight={2} /></span>
          <span class="od-release-empty--texts">
            <span class="od-release-empty--row-title">{c.text}</span>
            <span class="od-release-empty--row-note">{c.note}</span>
          </span>
          <span class="od-release-empty--chevron"><Icon name="chevron" size={20} weight={2} /></span>
        </a>
      {/each}
    </nav>
  </div>
</div>

<style>
  @layer od.components {
    /* Over the empty detail pane of the list-and-detail pair: to the right of the rail and the list. */
    .od-release-empty {
      position: fixed;
      top: 0;
      bottom: 0;
      right: 0;
      left: calc(var(--od-nav-width, 96px) + var(--f7-page-master-width, 340px));
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-y: auto;
      background: var(--od-background);
    }

    /* The pane is not empty any more (a dive form, the download): the column leaves. */
    :global(.view-master-detail:has(.page-master-detail)) .od-release-empty {
      display: none;
    }

    .od-release-empty--column {
      box-sizing: border-box;
      width: min(520px, 100%);
      padding: 24px;
      display: flex;
      flex-direction: column;
    }

    :global(.od-release-empty--profile) {
      height: 160px;
      width: 100%;
      margin-bottom: 36px;
    }

    .od-release-empty--title {
      margin: 0;
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
    }

    .od-release-empty--text {
      margin: 4px 0 24px;
      font-size: 16px;
      line-height: 23px;
      color: var(--od-text-2);
    }

    .od-release-empty--download {
      box-sizing: border-box;
      height: 56px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: var(--od-text);
      color: var(--od-background);
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          opacity: 0.88;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

    .od-release-empty--paper {
      margin-top: 14px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-release-empty--row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--od-release-divider);
      color: var(--od-text);
      text-decoration: none;
      cursor: pointer;
      transition: background-color 0.15s;

      &:last-child {
        border-bottom: none;
      }

      @media (hover: hover) {
        &:hover {
          background: var(--od-surface-2);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: -2px;
      }
    }

    .od-release-empty--tile {
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
    }

    .od-release-empty--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-release-empty--row-title {
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .od-release-empty--row-note {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-release-empty--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    @media (prefers-reduced-motion: reduce) {
      .od-release-empty--row {
        transition: none;
      }
    }
  }
</style>
