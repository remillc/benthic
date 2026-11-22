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
  <section class="bc-desktop-consumption" aria-label={t('desktopDetail.consumption')}>
    <h3 class="bc-desktop-consumption--title">{t('desktopDetail.consumption')}</h3>
    <div class="bc-desktop-consumption--figures">
      {#if data.sac}<div class="bc-desktop-consumption--figure"><span class="bc-desktop-consumption--value bc-value">{data.sac}</span><span class="bc-desktop-consumption--caption">{t('desktopDetail.sacSurface')}</span></div>{/if}
      {#if data.breathed}<div class="bc-desktop-consumption--figure"><span class="bc-desktop-consumption--value bc-value">{data.breathed}</span><span class="bc-desktop-consumption--caption">{t('desktopDetail.breathed')}</span></div>{/if}
      {#if data.used}<div class="bc-desktop-consumption--figure"><span class="bc-desktop-consumption--value bc-value">{data.used}</span><span class="bc-desktop-consumption--caption">{t('desktopDetail.usedOf', { start: data.usedOf })}</span></div>{/if}
    </div>
    {#if data.barKnown}
      <div class="bc-desktop-consumption--bar-wrap">
        <div class="bc-desktop-consumption--bar" role="img" aria-label={t('desktopDetail.barLabel', { end: data.endText, start: data.startText })}>
          <div class="bc-desktop-consumption--track"><div class="bc-desktop-consumption--used" style:left="{data.usedFrom * 100}%"></div></div>
          {#if data.reserveAt !== null}<div class="bc-desktop-consumption--reserve" style:left="{data.reserveAt * 100}%"></div>{/if}
        </div>
        <div class="bc-desktop-consumption--scale bc-value">
          <span>{t('desktopDetail.barZero')}</span>
          {#if data.reserveAt !== null}<span class="bc-desktop-consumption--reserve-text">{t('desktopDetail.reserve', { value: data.reserveText })}</span>{/if}
          <span>{t('desktopDetail.atExit', { value: data.endText })}</span>
          <span>{data.startText}</span>
        </div>
      </div>
      {#if data.reserveAt !== null}
        <p class="bc-desktop-consumption--margin">{t(data.marginMbar >= 0 ? 'desktopDetail.marginAbove' : 'desktopDetail.marginBelow', { value: data.margin })}</p>
      {/if}
    {/if}
  </section>
{/if}

<style>
  @layer bc.components {
    .bc-desktop-consumption {
      margin-top: 12px;
      padding: 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      border: 1px solid var(--bc-surface-container-highest);
    }

    .bc-desktop-consumption--title {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 600;
    }

    .bc-desktop-consumption--figures {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 36px;
    }

    .bc-desktop-consumption--figure {
      display: flex;
      flex-direction: column;
    }

    .bc-desktop-consumption--value {
      font-size: 26px;
      line-height: 32px;
      font-weight: 500;
    }

    .bc-desktop-consumption--caption {
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-desktop-consumption--bar-wrap {
      margin-top: 10px;
    }

    .bc-desktop-consumption--bar {
      position: relative;
      height: 14px;
      border-radius: 7px;
    }

    /* The track clips the used part to the rounded bar; the reserve mark may stick out of it. */
    .bc-desktop-consumption--track {
      position: absolute;
      inset: 0;
      border-radius: 7px;
      background: var(--bc-gas-track);
      overflow: hidden;
    }

    .bc-desktop-consumption--used {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      background: linear-gradient(90deg, var(--bc-cylinder-water-top), var(--bc-cylinder-water-bottom));
    }

    .bc-desktop-consumption--reserve {
      position: absolute;
      top: -2px;
      bottom: -2px;
      width: 2px;
      background: var(--bc-gas-reserve);
    }

    .bc-desktop-consumption--scale {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0 12px;
      margin-top: 4px;
      font-size: 12px;
      color: var(--bc-text-2);
    }

    .bc-desktop-consumption--reserve-text {
      color: var(--bc-gas-reserve);
    }

    .bc-desktop-consumption--margin {
      margin: 10px 0 0;
      font-size: 13px;
      color: var(--bc-text-2);
    }
  }
</style>
