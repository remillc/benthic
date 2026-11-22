<script>
  // @ts-check
  // The logo and the name on the blue first-launch band (tasks 2026-11-19-317 and 318; docs/system-design.md,
  // « Wordmark font » and « Lockup proportions »): « Benthic » in Outfit 700, white, and « DIVE LOG » under it in
  // Source Sans 3 600, caps, wide letter-spacing, #D6EAFF. The logo is vertically centred on the two lines.
  // size: `large` (tablet and desktop), `phone` (first launch on a phone), `compact` (the Benthic+ offer and
  // sign-in header), `step` (the following steps: the name alone). The sizes are custom properties, so that a
  // screen can change them with a media query. Read by a screen reader as one label, « Benthic Dive Log ».
  import { t } from '../lib/i18n.js';

  /** @type {{ size?: 'large'|'phone'|'compact'|'step', ring?: boolean }} */
  let { size = 'large', ring = false } = $props();
  const subline = $derived(size !== 'step');
</script>

<div class="bc-brand-lockup bc-brand-lockup--{size}" role="img" aria-label={subline ? t('welcomeSteps.brandLabel') : t('welcomeSteps.appName')}>
  <span class="bc-brand-lockup--logo" class:bc-brand-lockup--ring={ring}><img src="logo-light.svg" alt="" /></span>
  <span class="bc-brand-lockup--text" aria-hidden="true">
    <span class="bc-brand-lockup--name">Benthic</span>
    {#if subline}<span class="bc-brand-lockup--subline">{t('welcomeSteps.brandSubline')}</span>{/if}
  </span>
</div>

<style>
  @layer bc.components {
    .bc-brand-lockup {
      --bc-lockup-logo: 84px;
      --bc-lockup-gap: 20px;
      --bc-lockup-name: 52px;
      --bc-lockup-name-line: 54px;
      --bc-lockup-name-spacing: 0.3px;
      --bc-lockup-sub: 15px;
      --bc-lockup-sub-line: 18px;
      --bc-lockup-sub-spacing: 4px;
      --bc-lockup-sub-gap: 4px;
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--bc-lockup-gap);
    }

    .bc-brand-lockup--phone {
      --bc-lockup-logo: 52px;
      --bc-lockup-gap: 10px;
      --bc-lockup-name: 30px;
      --bc-lockup-name-line: 32px;
      --bc-lockup-name-spacing: 0.2px;
      --bc-lockup-sub: 11px;
      --bc-lockup-sub-line: 14px;
      --bc-lockup-sub-spacing: 3px;
      --bc-lockup-sub-gap: 2px;
    }

    .bc-brand-lockup--compact {
      --bc-lockup-logo: 48px;
      --bc-lockup-gap: 8px;
      --bc-lockup-name: 26px;
      --bc-lockup-name-line: 28px;
      --bc-lockup-name-spacing: 0.2px;
      --bc-lockup-sub: 10px;
      --bc-lockup-sub-line: 13px;
      --bc-lockup-sub-spacing: 2.6px;
      --bc-lockup-sub-gap: 2px;
    }

    .bc-brand-lockup--step {
      --bc-lockup-logo: 32px;
      --bc-lockup-gap: 10px;
      --bc-lockup-name: 22px;
      --bc-lockup-name-line: 26px;
      --bc-lockup-name-spacing: 0.2px;
    }

    /* The logo on the blue band (task 2026-11-17-263): no drop shadow; its disc has a thin light ring, 1 dp, white at
       30 %. The disc is 60/66 of the image, so the ring sits 4.5 % inside its edges. */
    .bc-brand-lockup--logo {
      position: relative;
      flex: none;
      display: block;
      width: var(--bc-lockup-logo);
      height: var(--bc-lockup-logo);

      img {
        display: block;
        width: 100%;
        height: 100%;
      }
    }

    .bc-brand-lockup--ring::after {
      content: '';
      position: absolute;
      inset: 4.545%;
      box-sizing: border-box;
      border: 1px solid var(--bc-release-logo-ring);
      border-radius: 50%;
      pointer-events: none;
    }

    .bc-brand-lockup--text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .bc-brand-lockup--name {
      font-family: Outfit, 'Source Sans 3', system-ui, sans-serif;
      font-size: var(--bc-lockup-name);
      line-height: calc(var(--bc-lockup-name-line) / var(--bc-lockup-name));
      font-weight: 700;
      letter-spacing: var(--bc-lockup-name-spacing);
      white-space: nowrap;
    }

    .bc-brand-lockup--subline {
      margin-top: var(--bc-lockup-sub-gap);
      font-size: var(--bc-lockup-sub);
      line-height: calc(var(--bc-lockup-sub-line) / var(--bc-lockup-sub));
      font-weight: 600;
      letter-spacing: var(--bc-lockup-sub-spacing);
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--bc-release-brand-subline);
    }
  }
</style>
