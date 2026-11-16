<script>
  // @ts-check
  // The cylinder cards of the desktop detail's Gaz tab (task 2026-11-16-262; mock-ups
  // bureau-carnet-onglet-gaz and android-edition-bouteille): one card per cylinder with the drawn
  // cylinder, the gas, the type and the pressures; the selected one has a neutral background and a dark
  // 2 dp outline (not blue); then a dashed « Ajouter une bouteille » card and the legend. The colours are
  // the drawing's own tokens (--od-cylinder-*) and the card tokens of theme.css (--od-gas-card-*).
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

<div class="od-desktop-gas-cards" role="group" aria-label={t('desktopDetail.gasCards')}>
  {#each cards as card (card.index)}
    <button type="button" class="od-desktop-gas-cards--card" class:od-desktop-gas-cards--selected={card.index === selected} aria-pressed={card.index === selected} aria-label={card.label} onclick={() => onselect(card.index)}>
      <CylinderDrawing ratio={card.ratio} startRatio={card.startRatio} hatched={card.hatched} width={64} />
      <span class="od-desktop-gas-cards--gas">{card.gas}</span>
      {#if card.type}<span class="od-desktop-gas-cards--line">{card.type}</span>{/if}
      {#if card.range}<span class="od-desktop-gas-cards--line od-value">{card.range}</span>{/if}
    </button>
  {/each}
  <button type="button" class="od-desktop-gas-cards--add" onclick={onadd}>
    <Icon name="plus" size={24} />
    <span class="od-desktop-gas-cards--add-title">{t('desktopDetail.addCylinder')}</span>
    <span class="od-desktop-gas-cards--add-sub">{t('desktopDetail.addCylinderUses')}</span>
  </button>
  <div class="od-desktop-gas-cards--legend">
    <span class="od-desktop-gas-cards--legend-item"><span class="od-desktop-gas-cards--swatch od-desktop-gas-cards--swatch-start"></span>{t('desktopDetail.legendStart')}</span>
    <span class="od-desktop-gas-cards--legend-item"><span class="od-desktop-gas-cards--swatch od-desktop-gas-cards--swatch-end"></span>{t('desktopDetail.legendEnd')}</span>
  </div>
</div>

<style>
  @layer od.components {
    .od-desktop-gas-cards {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 12px;
    }

    .od-desktop-gas-cards--card,
    .od-desktop-gas-cards--add {
      box-sizing: border-box;
      width: 148px;
      padding: 12px 8px 10px;
      border-radius: 14px;
      border: 2px solid transparent;
      background: none;
      font: inherit;
      color: var(--od-text);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      cursor: pointer;
    }

    .od-desktop-gas-cards--card:hover {
      background: color-mix(in srgb, var(--od-text) 4%, transparent);
    }

    /* Neutral background and a dark 2 dp outline, never blue. */
    .od-desktop-gas-cards--card.od-desktop-gas-cards--selected {
      border-color: var(--od-gas-card-selected-outline);
      background: var(--od-gas-card-selected);
    }

    .od-desktop-gas-cards--gas {
      margin-top: 4px;
      font-size: 16px;
      font-weight: 600;
    }

    .od-desktop-gas-cards--line {
      font-size: 13px;
      color: var(--od-text-2);
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    .od-desktop-gas-cards--add {
      justify-content: center;
      gap: 8px;
      border: 2px dashed var(--od-gas-card-add-outline);
      color: var(--od-text-2);
    }

    .od-desktop-gas-cards--add:hover {
      background: color-mix(in srgb, var(--od-text) 4%, transparent);
    }

    .od-desktop-gas-cards--add-title {
      font-size: 14px;
      font-weight: 500;
      text-align: center;
    }

    .od-desktop-gas-cards--add-sub {
      font-size: 12px;
      text-align: center;
    }

    .od-desktop-gas-cards--legend {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
      margin-inline-start: 8px;
      font-size: 13px;
      color: var(--od-text-2);
    }

    .od-desktop-gas-cards--legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .od-desktop-gas-cards--swatch {
      width: 14px;
      height: 14px;
      border-radius: 4px;
    }

    .od-desktop-gas-cards--swatch-start {
      background: var(--od-cylinder-breathed);
      border: 1px solid var(--od-cylinder-water-top);
    }

    .od-desktop-gas-cards--swatch-end {
      background: linear-gradient(180deg, var(--od-cylinder-water-top), var(--od-cylinder-water-bottom));
    }
  }
</style>
