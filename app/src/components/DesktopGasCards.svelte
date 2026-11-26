<script>
  // @ts-check
  // The tiles of the desktop detail's Gaz tab (tasks 2026-11-16-262 and 2026-11-24-382; mock-ups
  // bureau-carnet-onglet-gaz and its CCR and pSCR variants, android-tablette-detail-onglet-gaz-*): one tile per cylinder
  // with the drawn cylinder, the gas, the type and the pressures; in a rebreather dive one wide tile (CCR, about 308 px)
  // or one 148 px tile (pSCR) holds the unit and its cylinders, with « Diluant » right-aligned so that it ends at the
  // diluent cylinder and « Oxygène » left-aligned so that it starts at the oxygen cylinder; bailouts are ordinary tiles.
  // The selected one has a neutral background and a dark 2 dp outline (not blue); then a dashed « Ajouter une bouteille »
  // tile and the legend. The colours are the drawing's own tokens (--bc-cylinder-*) and the card tokens of theme.css
  // (--bc-gas-card-*).
  import CylinderDrawing from './CylinderDrawing.svelte';
  import RebreatherDrawing from './RebreatherDrawing.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * `tiles` come from gasTiles (lib/desktop-detail.js); `selected` is the key of the chosen tile.
   * @type {{
   *   tiles: ReturnType<typeof import('../lib/desktop-detail.js').gasTiles>,
   *   selected: string,
   *   onselect: (key: string) => void,
   *   onadd: () => void,
   *   editable?: boolean,
   *   onedit?: (key: string) => void,
   * }}
   * editable (an Android phone, task 2026-11-26-401): every cylinder tile gets a chevron and a touch opens its edit dialog (onedit).
   */
  let { tiles, selected, onselect, onadd, editable = false, onedit = () => {} } = $props();

  const marks = $derived({ diluent: t('detail.rebreatherMarks.diluent'), oxygen: t('detail.rebreatherMarks.oxygen'), bailout: t('detail.rebreatherMarks.bailout') });
  /** The drawing's fill of a card. @param {{ ratio: number, startRatio: number|null, hatched: boolean }|undefined} card */
  const fill = (card) => (card ? { ratio: card.ratio, startRatio: card.startRatio, hatched: card.hatched } : null);
</script>

<div class="bc-desktop-gas-cards" role="group" aria-label={t('desktopDetail.gasCards')}>
  {#each tiles as tile (tile.key)}
    <button
      type="button"
      class="bc-desktop-gas-cards--card"
      class:bc-desktop-gas-cards--selected={tile.key === selected}
      class:bc-desktop-gas-cards--wide={tile.kind === 'ccr'}
      class:bc-desktop-gas-cards--editable={editable}
      data-tile={tile.key}
      aria-pressed={tile.key === selected}
      aria-label={tile.label}
      onclick={() => {
        onselect(tile.key);
        if (editable) onedit(tile.key);
      }}
    >
      {#if editable}<span class="bc-desktop-gas-cards--chevron" aria-hidden="true"><Icon name="chevron" size={24} /></span>{/if}
      {#if tile.kind === 'cylinder' && tile.card}
        <CylinderDrawing ratio={tile.card.ratio} startRatio={tile.card.startRatio} hatched={tile.card.hatched} width={64} />
        <span class="bc-desktop-gas-cards--gas">{tile.title}</span>
        {#each tile.lines as line, i (i)}<span class="bc-desktop-gas-cards--line" class:bc-value={i === tile.lines.length - 1 && tile.lines.length > 1}>{line}</span>{/each}
      {:else if tile.kind === 'ccr'}
        {@const dil = tile.parts.find((p) => p.role === 'diluent')}
        {@const oxy = tile.parts.find((p) => p.role === 'oxygen')}
        <RebreatherDrawing compact diluent={fill(dil?.card)} oxygen={fill(oxy?.card)} {marks} />
        <!-- Diluant ends at the diluent cylinder, Oxygène starts at the oxygen cylinder (the cylinders are 108 and 96 px from the text box's right and left edges). -->
        <span class="bc-desktop-gas-cards--unit-text">
          {#if dil}
            <span class="bc-desktop-gas-cards--part bc-desktop-gas-cards--part-dil">
              <span class="bc-desktop-gas-cards--gas">{dil.title}</span>
              {#each dil.lines as line, i (i)}<span class="bc-desktop-gas-cards--line" class:bc-value={i > 0}>{line}</span>{/each}
            </span>
          {/if}
          {#if oxy}
            <span class="bc-desktop-gas-cards--part bc-desktop-gas-cards--part-oxy">
              <span class="bc-desktop-gas-cards--gas">{oxy.title}</span>
              {#each oxy.lines as line, i (i)}<span class="bc-desktop-gas-cards--line" class:bc-value={i > 0}>{line}</span>{/each}
            </span>
          {/if}
        </span>
      {:else if tile.kind === 'pscr'}
        {@const mix = tile.parts[0]}
        <RebreatherDrawing compact variant="pscr" diluent={fill(mix?.card)} {marks} />
        {#if mix}
          <span class="bc-desktop-gas-cards--centred">
            <span class="bc-desktop-gas-cards--gas">{mix.title}</span>
            {#each mix.lines as line, i (i)}<span class="bc-desktop-gas-cards--line" class:bc-value={i > 0}>{line}</span>{/each}
          </span>
        {/if}
      {/if}
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
  @layer bc.components {
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

    /* The chevron of an editable tile: 24 dp, 8 dp from the right edge, centred on the tile (task 2026-11-26-401). */
    .bc-desktop-gas-cards--editable {
      position: relative;
    }

    .bc-desktop-gas-cards--chevron {
      position: absolute;
      top: 50%;
      inset-inline-end: 8px;
      transform: translateY(-50%);
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-desktop-gas-cards--card:hover {
      background: color-mix(in srgb, var(--bc-text) 4%, transparent);
    }

    /* Neutral background and a dark 2 dp outline, never blue. */
    .bc-desktop-gas-cards--card.bc-desktop-gas-cards--selected {
      border-color: var(--bc-gas-card-selected-outline);
      background: var(--bc-gas-card-selected);
    }

    /* The rebreather tile (CCR): 308 px, the 170 px drawing and its two text blocks. */
    .bc-desktop-gas-cards--wide {
      width: 308px;
      gap: 6px;
    }

    .bc-desktop-gas-cards--unit-text {
      position: relative;
      width: 170px;
      height: 58px;
    }

    .bc-desktop-gas-cards--part {
      position: absolute;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      white-space: nowrap;
    }

    .bc-desktop-gas-cards--part-dil {
      right: 108px;
      align-items: flex-end;
    }

    .bc-desktop-gas-cards--part-oxy {
      left: 96px;
      align-items: flex-start;
    }

    .bc-desktop-gas-cards--part .bc-desktop-gas-cards--gas {
      margin-top: 0;
    }

    .bc-desktop-gas-cards--centred {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .bc-desktop-gas-cards--centred .bc-desktop-gas-cards--gas {
      margin-top: 0;
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
