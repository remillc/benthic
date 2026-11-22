<script>
  // @ts-check
  // The cylinder cards of the desktop detail's Gaz tab (task 2026-11-16-262; mock-ups
  // bureau-carnet-onglet-gaz and android-edition-bouteille): one card per cylinder with the drawn
  // cylinder, the gas, the type and the pressures; the selected one has a neutral background and a dark
  // 2 dp outline (not blue); then a dashed « Ajouter une bouteille » card and the legend. The colours are
  // the drawing's own tokens (--bc-cylinder-*) and the card tokens of theme.css (--bc-gas-card-*).
  import CylinderDrawing from './CylinderDrawing.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   cards: { index: number, gas: string, type: string, range: string, ratio: number, startRatio: number|null, hatched: boolean, label: string }[],
   *   selected: number,
   *   onselect: (index: number) => void,
   *   onadd: () => void,
   * }}
   */
  let { cards, selected, onselect, onadd } = $props();
</script>

<div class="bc-desktop-gas-cards" role="group" aria-label={t('desktopDetail.gasCards')}>
  {#each cards as card (card.index)}
    <button type="button" class="bc-desktop-gas-cards--card" class:bc-desktop-gas-cards--selected={card.index === selected} aria-pressed={card.index === selected} aria-label={card.label} onclick={() => onselect(card.index)}>
      <CylinderDrawing ratio={card.ratio} startRatio={card.startRatio} hatched={card.hatched} width={64} />
      <span class="bc-desktop-gas-cards--gas">{card.gas}</span>
      {#if card.type}<span class="bc-desktop-gas-cards--line">{card.type}</span>{/if}
      {#if card.range}<span class="bc-desktop-gas-cards--line bc-value">{card.range}</span>{/if}
    </button>
  {/each}
  <button type="button" class="bc-desktop-gas-cards--add" onclick={onadd}>
    <Icon name="plus" size={24} />
    <span class="bc-desktop-gas-cards--add-title">{t('desktopDetail.addCylinder')}</span>
    <span class="bc-desktop-gas-cards--add-sub">{t('desktopDetail.addCylinderUses')}</span>
  </button>
  <div class="bc-desktop-gas-cards--legend">
    <span class="bc-desktop-gas-cards--legend-item"><span class="bc-desktop-gas-cards--swatch bc-desktop-gas-cards--swatch-start"></span>{t('desktopDetail.legendStart')}</span>
    <span class="bc-desktop-gas-cards--legend-item"><span class="bc-desktop-gas-cards--swatch bc-desktop-gas-cards--swatch-end"></span>{t('desktopDetail.legendEnd')}</span>
  </div>
</div>

<style>
  @layer od.components {
    .bc-desktop-gas-cards {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 12px;
    }

    .bc-desktop-gas-cards--card,
    .bc-desktop-gas-cards--add {
      box-sizing: border-box;
      width: 148px;
      padding: 12px 8px 10px;
      border-radius: 14px;
      border: 2px solid transparent;
      background: none;
      font: inherit;
      color: var(--bc-text);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      cursor: pointer;
    }

    .bc-desktop-gas-cards--card:hover {
      background: color-mix(in srgb, var(--bc-text) 4%, transparent);
    }

    /* Neutral background and a dark 2 dp outline, never blue. */
    .bc-desktop-gas-cards--card.bc-desktop-gas-cards--selected {
      border-color: var(--bc-gas-card-selected-outline);
      background: var(--bc-gas-card-selected);
    }

    .bc-desktop-gas-cards--gas {
      margin-top: 4px;
      font-size: 16px;
      font-weight: 600;
    }

    .bc-desktop-gas-cards--line {
      font-size: 13px;
      color: var(--bc-text-2);
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .bc-desktop-gas-cards--add {
      justify-content: center;
      gap: 8px;
      border: 2px dashed var(--bc-gas-card-add-outline);
      color: var(--bc-text-2);
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 4%, transparent);
      }
    }

    .bc-desktop-gas-cards--add-title {
      font-size: 14px;
      font-weight: 500;
      text-align: center;
    }

    .bc-desktop-gas-cards--add-sub {
      font-size: 12px;
      text-align: center;
    }

    .bc-desktop-gas-cards--legend {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
      margin-inline-start: 8px;
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-desktop-gas-cards--legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bc-desktop-gas-cards--swatch {
      width: 14px;
      height: 14px;
      border-radius: 4px;
    }

    .bc-desktop-gas-cards--swatch-start {
      background: var(--bc-cylinder-breathed);
      border: 1px solid var(--bc-cylinder-water-top);
    }

    .bc-desktop-gas-cards--swatch-end {
      background: linear-gradient(180deg, var(--bc-cylinder-water-top), var(--bc-cylinder-water-bottom));
    }
  }
</style>
