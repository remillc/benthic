<script>
  // @ts-check
  // The « OpenDives+ » chip of the release edition (task 2026-11-17-263; mock-ups docs/mockups-release/
  // android-premier-lancement-production.dc.html): a 24 dp pill, a white veil on the blue of the main choice, a
  // small four-point star and the name. The name is a brand: it is not translated. Colours are tokens
  // (--od-release-plus-chip, --od-release-on-panel).
  import { t } from '../lib/i18n.js';
</script>

<span class="od-plus-chip">
  <svg class="od-plus-chip--mark" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z" /></svg>
  {t('welcomeSteps.plusName')}
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
      background: var(--od-release-plus-chip);
      color: var(--od-release-on-panel);
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .od-plus-chip--mark {
      flex: none;
      fill: currentColor;
    }
  }
</style>
