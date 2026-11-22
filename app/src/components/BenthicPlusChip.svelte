<script>
  // @ts-check
  // The « Benthic+ » chip (task 2026-11-17-265; mock-ups docs/mockups-release/android-odplus-*.dc.html and
  // android-serveur-telechargement.dc.html): a small frosted pill with the Benthic+ mark, shown on the blue band
  // above the title of the screens that belong to the subscription. `onLight` is the same chip on a light page.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ onLight?: boolean, onSheet?: boolean, label?: string, large?: boolean }} */
  let { onLight = false, onSheet = false, label = '', large = false } = $props();
</script>

<span class="bc-plus-chip" class:bc-plus-chip--on-light={onLight} class:bc-plus-chip--on-sheet={onSheet} class:bc-plus-chip--large={large}>
  <Icon name="plusMark" size={large ? 14 : 12} weight={2.2} />{label || t('benthicPlus.chip')}
</span>

<style>
  @layer od.components {
    .bc-plus-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding: 0 10px 0 8px;
      border-radius: 12px;
      background: var(--bc-plus-chip);
      color: var(--bc-release-on-panel);
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      white-space: nowrap;
    }

    /* The offer's header (task 2026-11-19-295): 28 dp high, 14/20, 8 dp between the mark and the text. */
    .bc-plus-chip--large {
      gap: 8px;
      height: 28px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 20px;
    }

    /* The account sheet and « Gérer le compte »: the pale blue chip of their mock-ups (task 2026-11-18-281). */
    .bc-plus-chip--on-sheet {
      background: var(--bc-account-chip);
      color: var(--bc-account-chip-ink);
    }

    .bc-plus-chip--on-light {
      background: var(--bc-release-note);
      color: var(--bc-release-chip-text);
    }
  }
</style>
