<script>
  // @ts-check
  // The « OpenDives+ » chip (task 2026-11-17-265; mock-ups docs/mockups-release/android-odplus-*.dc.html and
  // android-serveur-telechargement.dc.html): a small frosted pill with the OpenDives+ mark, shown on the blue band
  // above the title of the screens that belong to the subscription. `onLight` is the same chip on a light page.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ onLight?: boolean, onSheet?: boolean }} */
  let { onLight = false, onSheet = false } = $props();
</script>

<span class="od-plus-chip" class:od-plus-chip--on-light={onLight} class:od-plus-chip--on-sheet={onSheet}>
  <Icon name="plusMark" size={12} weight={2.2} />{t('odplus.chip')}
</span>

<style>
  @layer od.components {
    .od-plus-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding: 0 10px 0 8px;
      border-radius: 12px;
      background: var(--od-plus-chip);
      color: var(--od-release-on-panel);
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      white-space: nowrap;
    }

    /* The account sheet and « Gérer le compte »: the pale blue chip of their mock-ups (task 2026-11-18-281). */
    .od-plus-chip--on-sheet {
      background: var(--od-account-chip);
      color: var(--od-account-chip-ink);
    }

    .od-plus-chip--on-light {
      background: var(--od-release-note);
      color: var(--od-release-chip-text);
    }
  }
</style>
