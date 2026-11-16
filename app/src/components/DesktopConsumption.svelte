<script>
  // @ts-check
  // The « Consommation » card of the desktop detail's Gaz tab (task 2026-11-16-262; mock-up
  // bureau-carnet-onglet-gaz): the SAC, the litres breathed, the pressure used by the selected cylinder,
  // and a bar from 0 to its start pressure with the used part in the water gradient and the reserve mark.
  // The figures come from lib/desktop-detail.js consumption(); a figure not known is not shown.
  import { t } from '../lib/i18n.js';

  /** @type {{ data: ReturnType<typeof import('../lib/desktop-detail.js').consumption> }} */
  let { data } = $props();
</script>

{#if data.any}
  <section class="od-desktop-consumption" aria-label={t('desktopDetail.consumption')}>
    <h3 class="od-desktop-consumption--title">{t('desktopDetail.consumption')}</h3>
    <div class="od-desktop-consumption--figures">
      {#if data.sac}<div class="od-desktop-consumption--figure"><span class="od-desktop-consumption--value od-value">{data.sac}</span><span class="od-desktop-consumption--caption">{t('desktopDetail.sacSurface')}</span></div>{/if}
      {#if data.breathed}<div class="od-desktop-consumption--figure"><span class="od-desktop-consumption--value od-value">{data.breathed}</span><span class="od-desktop-consumption--caption">{t('desktopDetail.breathed')}</span></div>{/if}
      {#if data.used}<div class="od-desktop-consumption--figure"><span class="od-desktop-consumption--value od-value">{data.used}</span><span class="od-desktop-consumption--caption">{t('desktopDetail.usedOf', { start: data.usedOf })}</span></div>{/if}
    </div>
    {#if data.barKnown}
      <div class="od-desktop-consumption--bar-wrap">
        <div class="od-desktop-consumption--bar" role="img" aria-label={t('desktopDetail.barLabel', { end: data.endText, start: data.startText })}>
          <div class="od-desktop-consumption--track"><div class="od-desktop-consumption--used" style:left="{data.usedFrom * 100}%"></div></div>
          {#if data.reserveAt !== null}<div class="od-desktop-consumption--reserve" style:left="{data.reserveAt * 100}%"></div>{/if}
        </div>
        <div class="od-desktop-consumption--scale od-value">
          <span>{t('desktopDetail.barZero')}</span>
          {#if data.reserveAt !== null}<span class="od-desktop-consumption--reserve-text">{t('desktopDetail.reserve', { value: data.reserveText })}</span>{/if}
          <span>{t('desktopDetail.atExit', { value: data.endText })}</span>
          <span>{data.startText}</span>
        </div>
      </div>
      {#if data.reserveAt !== null}
        <p class="od-desktop-consumption--margin">{t(data.marginMbar >= 0 ? 'desktopDetail.marginAbove' : 'desktopDetail.marginBelow', { value: data.margin })}</p>
      {/if}
    {/if}
  </section>
{/if}

<style>
  @layer od.components {
    .od-desktop-consumption {
      margin-top: 12px;
      padding: 16px;
      border-radius: 16px;
      background: var(--od-surface);
      border: 1px solid var(--od-surface-container-highest);
    }

    .od-desktop-consumption--title {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 600;
    }

    .od-desktop-consumption--figures {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 36px;
    }

    .od-desktop-consumption--figure {
      display: flex;
      flex-direction: column;
    }

    .od-desktop-consumption--value {
      font-size: 26px;
      line-height: 32px;
      font-weight: 500;
    }

    .od-desktop-consumption--caption {
      font-size: 13px;
      color: var(--od-text-2);
    }

    .od-desktop-consumption--bar-wrap {
      margin-top: 10px;
    }

    .od-desktop-consumption--bar {
      position: relative;
      height: 14px;
      border-radius: 7px;
    }

    /* The track clips the used part to the rounded bar; the reserve mark may stick out of it. */
    .od-desktop-consumption--track {
      position: absolute;
      inset: 0;
      border-radius: 7px;
      background: var(--od-gas-track);
      overflow: hidden;
    }

    .od-desktop-consumption--used {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      background: linear-gradient(90deg, var(--od-cylinder-water-top), var(--od-cylinder-water-bottom));
    }

    .od-desktop-consumption--reserve {
      position: absolute;
      top: -2px;
      bottom: -2px;
      width: 2px;
      background: var(--od-gas-reserve);
    }

    .od-desktop-consumption--scale {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0 12px;
      margin-top: 4px;
      font-size: 12px;
      color: var(--od-text-2);
    }

    .od-desktop-consumption--reserve-text {
      color: var(--od-gas-reserve);
    }

    .od-desktop-consumption--margin {
      margin: 10px 0 0;
      font-size: 13px;
      color: var(--od-text-2);
    }
  }
</style>
