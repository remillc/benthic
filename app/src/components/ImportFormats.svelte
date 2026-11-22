<script>
  // @ts-check
  // « Voir les formats acceptés » under the two choices of « Importer un carnet », and the basic dialog it
  // opens (task 2026-11-16-223, release edition; mock-ups docs/mockups/android-tablette-premier-lancement-
  // production-importer-formats-paysage.dc.html). A basic dialog (docs/system-design.md, section 5): no close icon, a
  // « Fermer » text button at the bottom right; Md3Dialog closes it with a tap on the scrim, Escape and the
  // system Back (lib/back-button.js). The list is lib/import-formats.js, the same lines as the report.
  import Md3Dialog from './Md3Dialog.svelte';
  import Icon from './Icon.svelte';
  import { FORMAT_COLUMNS, formatsOf, openFormats, closeFormats } from '../lib/import-formats.js';
  import { t } from '../lib/i18n.js';

  const icons = /** @type {const} */ ({ open: 'file', devices: 'wristComputer', logbooks: 'logbook' });
  const state = $state({ formatsOpen: false });
</script>

<button type="button" role="link" class="bc-import-formats--link" onclick={() => openFormats(state)}>{t('importFormats.link')}</button>

{#if state.formatsOpen}
  <Md3Dialog class="bc-import-formats" title={t('importFormats.title')} text={t('importFormats.text')} oncancel={() => closeFormats(state)}>
    <div class="bc-import-formats--columns">
      {#each FORMAT_COLUMNS as column (column)}
        <section class="bc-import-formats--column" aria-labelledby="bc-import-formats-{column}">
          <header class="bc-import-formats--head">
            <span class="bc-import-formats--tile"><Icon name={icons[column]} size={20} /></span>
            <h3 id="bc-import-formats-{column}" class="bc-import-formats--title">{t(`importFormats.column.${column}`)}</h3>
          </header>
          <ul class="bc-import-formats--list">
            {#each formatsOf(column) as format (format.report)}
              <li class="bc-import-formats--line">
                <span class="bc-import-formats--name">{format.name}</span>
                <span class="bc-import-formats--extensions">
                  {#each format.extensions as extension (extension)}<span class="bc-import-formats--extension">{extension}</span>{/each}
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
    {#snippet actions()}
      <button type="button" onclick={() => closeFormats(state)}>{t('dialog.close')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer bc.components {
    /* Under « Un fichier » (task 2026-11-16-226): a 48 dp touch target, 4 dp of padding on each side,
       4 dp from each row (the rows' 12 px gap less 8). */
    .bc-import-formats--link {
      align-self: flex-start;
      width: auto;
      min-height: 48px;
      text-align: start;
      margin: -8px 0;
      padding: 0 4px;
      border: none;
      background: transparent;
      color: var(--bc-release-link);
      font: inherit;
      font-size: 14px;
      line-height: 19px;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-release-link);
        outline-offset: 3px;
        border-radius: 4px;
      }

      @media (hover: hover) {
        &:hover {
          color: var(--bc-release-row-main-hover);
          text-decoration-thickness: 2px;
        }
      }
    }

    :global(.bc-import-formats) :global(.bc-md3-dialog--surface) {
      width: min(1040px, calc(100% - 48px));
    }

    /* The mock-up's « Fermer » is the release blue. */
    :global(.bc-import-formats) :global(.bc-md3-dialog--actions button) {
      color: var(--bc-release-link);
    }

    .bc-import-formats--columns {
      display: flex;
      gap: 12px;
      padding: 0 24px;
      align-items: flex-start;
    }

    .bc-import-formats--column {
      flex: 1;
      min-width: 0;
      box-sizing: border-box;
      padding: 14px 16px 8px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);
    }

    .bc-import-formats--head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0 0 8px;
    }

    .bc-import-formats--tile {
      width: 36px;
      height: 36px;
      flex: none;
      border-radius: 10px;
      background: var(--bc-release-tile);
      color: var(--bc-release-tile-icon);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-import-formats--title {
      flex: 1;
      margin: 0;
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .bc-import-formats--list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .bc-import-formats--line {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 0;
      border-top: 1px solid var(--bc-release-divider);
      font-size: 14px;
      line-height: 19px;
    }

    .bc-import-formats--name {
      flex: 1;
      min-width: 0;
    }

    .bc-import-formats--extensions {
      display: flex;
      gap: 4px;
    }

    .bc-import-formats--extension {
      flex: none;
      padding: 1px 7px;
      border-radius: 6px;
      background: var(--bc-release-hero);
      color: var(--bc-release-chip-text);
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 12px;
      line-height: 18px;
    }

    /* Narrow screens: the columns stack. Phone (task 2026-11-16-227): a 358 dp dialog, at most 780 dp tall; the cards
       scroll inside it (the content area of Md3Dialog) and « Fermer » stays at the bottom. */
    @media (max-width: 767px) {
      :global(.bc-import-formats) :global(.bc-md3-dialog--surface) {
        width: min(358px, calc(100% - 32px));
        max-height: min(780px, calc(100% - 64px));
      }

      .bc-import-formats--columns {
        flex-direction: column;
        align-items: stretch;
        padding: 0 16px;
      }
    }
  }
</style>
