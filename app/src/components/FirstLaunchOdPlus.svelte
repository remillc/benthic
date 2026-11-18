<script>
  // @ts-check
  // The OpenDives+ screens of the release edition (task 2026-11-17-265; mock-ups docs/mockups-release/
  // android-odplus-connexion, -offre, -pret and -abonne): « Se connecter ou créer un compte », the offer, « Votre carnet
  // est prêt » and « Bienvenue dans OpenDives+ ! ». There is no free account: an account exists only for a diver who
  // subscribed. The sign-in with Google or Apple and the purchase need native parts that are not wired yet: their
  // buttons call the one function each of lib/odplus-billing.js, which answers « unavailable » for now.
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import OdPlusChip from './OdPlusChip.svelte';
  import OdPlusReadyLogo from './OdPlusReadyLogo.svelte';
  import OdPlusReadyBubbles from './OdPlusReadyBubbles.svelte';
  import { claimReadyMotion } from '../lib/ready-animation.js';
  import { flow, go } from '../lib/first-launch.svelte.js';
  import { ACTIVATED, BENEFITS, summaryRows } from '../lib/odplus.js';
  import { purchaseSubscription, signInWithApple, signInWithGoogle } from '../lib/odplus-billing.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { services } from '../lib/profile.svelte.js';
  import { deviceKind, deviceKey } from '../lib/first-launch-phone.js';
  import { desktopApp, ios, layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * `onwithout`: « Continuer sans compte » and « Continuer sans abonnement » (back to the first step, nothing created).
   * `onopen`: « Ouvrir mon carnet ».
   * @type {{ step: 'odplusConnect'|'odplusOffer'|'odplusReady'|'odplusWelcome'|'odplusHealth', onwithout: () => void, onopen: () => void }}
   */
  let { step, onwithout, onopen } = $props();

  /** The section band's faint dive profile (the same path as SectionBand). */
  const BAND_PROFILE = 'M0 30 L20 38 L45 70 L70 92 L95 96 L120 88 L140 94 L165 80 L185 62 L210 58 L235 50 L255 46 L275 40 L300 36';

  // « Votre carnet est prêt » plays its sequence once (task 2026-11-18-270): decided when the step appears, kept while it shows.
  /** @type {{ play: boolean, bubbles: boolean, still: boolean }} */
  let motion = $state({ play: false, bubbles: false, still: false });
  let motionStep = '';
  $effect.pre(() => {
    if (step === 'odplusReady' && motionStep !== 'odplusReady') motion = claimReadyMotion();
    motionStep = step;
  });

  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));

  // « Vos données de santé » (task 2026-11-18-271): the optional consent, off until the diver turns it on. « Continuer »
  // works in both states; the choice is kept on the device and sent to the account when it can be.
  let keepHealth = $state(false);
  let continuing = $state(false);
  async function continueHealth() {
    if (continuing) return;
    continuing = true;
    try {
      if (keepHealth) await services().consent.give();
    } catch (e) {
      console.error('Keeping the health-data consent', e);
    }
    continuing = false;
    go('next');
  }

  /** @param {'google'|'apple'} provider */
  async function provider(provider) {
    const answer = await (provider === 'google' ? signInWithGoogle() : signInWithApple());
    if (answer.status === 'unavailable') showSnackbar(t('odplus.providerUnavailable', { provider: provider === 'google' ? 'Google' : 'Apple' }));
    // To wire: a signed-in answer goes to the server's sign-in call, then to the download or the offer.
  }

  /** « S’abonner ». */
  async function subscribe() {
    const answer = await purchaseSubscription();
    if (answer.status === 'unavailable') showSnackbar(t('odplus.purchaseUnavailable'));
    else if (answer.status === 'purchased') go('welcome');
  }

  // Development builds only: the purchase is inert, so « Bienvenue dans OpenDives+ » is reached from the console with
  // `__odplus.purchased()`. The branch is dropped from a production build (`import.meta.env.DEV` is a constant).
  onMount(() => {
    if (!import.meta.env?.DEV || step !== 'odplusOffer') return;
    /** @type {any} */ (window).__odplus = { purchased: () => go('welcome') };
    return () => delete (/** @type {any} */ (window).__odplus);
  });
</script>

{#snippet hero(/** @type {'offer'|'ready'|'welcome'|'health'} */ which)}
  <header class="od-plus-hero od-plus-hero--{which}">
    <div class="od-plus-hero--bands" aria-hidden="true"></div>
    {#if which === 'ready' && motion.bubbles}<OdPlusReadyBubbles still={motion.still} />{/if}
    <!-- Every OpenDives+ header: the band of the dive profile above the bottom wave, as on « Se connecter ». -->
    <svg class="od-plus-hero--profile" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
      <path d="{BAND_PROFILE} V140 H0 Z" class="od-plus-hero--profile-area" />
      <path d={BAND_PROFILE} class="od-plus-hero--profile-line" vector-effect="non-scaling-stroke" />
    </svg>
    <svg class="od-plus-hero--wave" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
    <div class="od-plus-hero--brand">
      <img src="logo-light.svg" alt="" width="32" height="32" />
      <span>{t('welcomeSteps.appName')}</span>
    </div>
    {#if which === 'offer'}
      <div class="od-plus-hero--text">
        <OdPlusChip />
        <h2 class="od-plus-hero--title">{t('odplus.offer.title')}</h2>
        <p class="od-plus-hero--lead">{t('odplus.offer.lead')}</p>
      </div>
    {:else}
      <div class="od-plus-hero--centre">
        {#if which === 'ready'}
          <OdPlusReadyLogo play={motion.play} />
        {:else if which === 'health'}
          <span class="od-plus-hero--check"><Icon name="lock" size={36} weight={2} /></span>
        {:else}
          <span class="od-plus-hero--check od-plus-hero--check-big"><Icon name="check" size={44} weight={2.6} /></span>
        {/if}
        <OdPlusChip />
        <h2 class="od-plus-hero--title">{t(which === 'ready' ? 'odplus.ready.title' : which === 'health' ? 'odplus.health.title' : 'odplus.welcome.title')}</h2>
        <p class="od-plus-hero--lead">{which === 'ready' ? t(deviceKey('odplus.ready.lead', kind)) : which === 'health' ? t('odplus.health.lead') : t('odplus.welcome.lead')}</p>
      </div>
    {/if}
  </header>
{/snippet}

{#if step === 'odplusConnect'}
  <h2 class="od-plus--title">{t('odplus.connect.title')}</h2>
  <p class="od-plus--lead">{t('odplus.connect.lead')}</p>
  <div class="od-plus--buttons">
    <button type="button" class="od-plus--provider" onclick={() => provider('google')}>
      <span class="od-plus--disc" aria-hidden="true">G</span>{t('odplus.connect.google')}
    </button>
    <button type="button" class="od-plus--provider" onclick={() => provider('apple')}>
      <span class="od-plus--disc" aria-hidden="true">A</span>{t('odplus.connect.apple')}
    </button>
    <button type="button" class="od-plus--provider od-plus--provider-main" onclick={() => go('email')}>
      <Icon name="mail" size={22} />{t('odplus.connect.email')}
    </button>
  </div>
  <p class="od-plus--note">{t('odplus.connect.note')}</p>
  <button type="button" class="od-plus--text" onclick={onwithout}>{t('odplus.connect.without')}</button>
{:else if step === 'odplusOffer'}
  <div class="od-plus--screen">
    {@render hero('offer')}
    <div class="od-plus--cards">
      {#each BENEFITS as b (b.key)}
        <div class="od-plus--card od-plus--card-{b.tone}">
          <span class="od-plus--card-icon"><Icon name={b.icon} size={24} weight={1.9} /></span>
          <span class="od-plus--card-title">{t(`odplus.offer.${b.key}`)}</span>
          <span class="od-plus--card-text">{t(`odplus.offer.${b.key}Text`)}</span>
        </div>
      {/each}
    </div>
    <div class="od-plus--card od-plus--card-maintenance od-plus--card-wide">
      <span class="od-plus--card-icon"><Icon name="bell" size={24} weight={1.9} /></span>
      <span class="od-plus--card-body">
        <span class="od-plus--card-title">{t('odplus.offer.maintenance')}</span>
        <span class="od-plus--card-text">{t('odplus.offer.maintenanceText')}</span>
      </span>
    </div>
    <div class="od-plus--price">
      <span class="od-plus--price-amount">{t('odplus.offer.price')} <span class="od-plus--price-per">{t('odplus.offer.per')}</span></span>
      <span class="od-plus--price-detail">{t('odplus.offer.priceDetail')}</span>
    </div>
    <button type="button" class="od-plus--primary" onclick={subscribe}>{t('odplus.offer.subscribe')}</button>
    <button type="button" class="od-plus--text od-plus--text-centre" onclick={onwithout}>{t('odplus.offer.without')}</button>
    <p class="od-plus--no-account">{t('odplus.offer.noAccount')}</p>
  </div>
{:else if step === 'odplusReady'}
  <div class="od-plus--screen">
    {@render hero('ready')}
    <dl class="od-plus--summary">
      {#each summaryRows(flow.plus.counts) as row (row.key)}
        <div class="od-plus--summary-row">
          <dt>{t(`odplus.ready.${row.key}`)}</dt>
          <dd>{row.key === 'gear' ? t('odplus.ready.articles', { n: row.n }) : row.n}</dd>
        </div>
      {/each}
    </dl>
    <p class="od-plus--account"><Icon name="check" size={16} weight={2.4} />{t('odplus.ready.account', { email: flow.plus.email })}</p>
    <button type="button" class="od-plus--primary" onclick={onopen}>{t('odplus.ready.open')}</button>
  </div>
{:else if step === 'odplusWelcome'}
  <div class="od-plus--screen">
    {@render hero('welcome')}
    <h3 class="od-plus--label">{t('odplus.welcome.activated')}</h3>
    <ul class="od-plus--activated">
      {#each ACTIVATED as key, i (key)}
        <li class="od-plus--activated-row od-plus--card-{['blue', 'green', 'amber'][i]}">
          <span class="od-plus--activated-icon"><Icon name={['sync', 'cloudDownload', 'briefcase'][i]} size={22} weight={1.9} /></span>
          <span class="od-plus--activated-text">{t(`odplus.welcome.${key}`)}</span>
          <Icon name="check" size={20} weight={2.4} />
        </li>
      {/each}
    </ul>
    <p class="od-plus--account od-plus--account-plain">{t('odplus.welcome.account', { email: flow.plus.email })}</p>
    <button type="button" class="od-plus--primary" onclick={() => go('next')}>{t('odplus.welcome.next')}</button>
  </div>
{:else if step === 'odplusHealth'}
  <div class="od-plus--screen">
    {@render hero('health')}
    <div class="od-plus--health">
      <label class="od-plus--health-row">
        <span class="od-plus--health-texts">
          <span class="od-plus--health-label">{t('odplus.health.switch')}</span>
          <span class="od-plus--health-help">{t('odplus.health.switchHelp')}</span>
        </span>
        <span class="toggle"><input type="checkbox" role="switch" bind:checked={keepHealth} /><span class="toggle-icon"></span></span>
      </label>
      <p class="od-plus--health-note">{t('odplus.health.note')}</p>
    </div>
    <p class="od-plus--lock"><Icon name="lock" size={18} /><span>{t('odplus.health.lock')}</span></p>
    <button type="button" class="od-plus--primary" disabled={continuing} onclick={continueHealth}>{t('odplus.health.continue')}</button>
  </div>
{/if}

<style>
  @layer od.components {
    .od-plus--title {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .od-plus--lead {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--od-text-2);
    }

    .od-plus--buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .od-plus--provider {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      height: 56px;
      padding: 0 20px;
      border: 1px solid var(--od-release-field-border);
      border-radius: 28px;
      background: var(--od-surface);
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

    .od-plus--provider-main {
      border: none;
      background: var(--od-release-row-main);
      color: var(--od-release-on-panel);

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-row-main-hover);
        }
      }
    }

    /* The mark of Google and Apple, a plain letter disc as in the mock-up; replaced by each provider's official button when they are wired. */
    .od-plus--disc {
      width: 28px;
      height: 28px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
      font-size: 15px;
      font-weight: 700;
    }

    .od-plus--note {
      margin: 18px 0 6px;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-plus--text {
      align-self: flex-start;
      height: 48px;
      margin-left: -12px;
      padding: 0 12px;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
      }
    }

    .od-plus--text-centre {
      align-self: center;
      margin-left: 0;
      margin-top: 4px;
      height: 40px;
      color: var(--od-text-2);
    }

    .od-plus--primary {
      height: 56px;
      border: none;
      border-radius: 28px;
      background: var(--od-release-row-main);
      box-shadow: 0 2px 6px var(--od-release-row-main-shadow);
      color: var(--od-release-on-panel);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--od-release-row-main-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

    .od-plus--health {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 20px;
      border-radius: 20px;
      background: var(--od-surface);
    }

    .od-plus--health-row {
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
    }

    .od-plus--health-texts {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-plus--health-label {
      font-size: 17px;
      line-height: 22px;
      font-weight: 600;
    }

    .od-plus--health-help,
    .od-plus--health-note,
    .od-plus--lock {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-plus--health-note {
      margin: 0;
    }

    .od-plus--lock {
      margin: 0;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }

    .od-plus--primary:disabled {
      opacity: 0.6;
    }

    .od-plus--no-account {
      margin: 0;
      text-align: center;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    /* The three screens with the blue hero. On a phone they use the whole width, the first launch's own band is hidden. */
    .od-plus--screen {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 520px;
    }

    .od-plus-hero {
      position: relative;
      overflow: hidden;
      border-radius: 28px;
      padding: 28px 24px 32px;
      background: var(--od-plus-hero);
      color: var(--od-release-on-panel);
    }

    .od-plus-hero--bands {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(105deg, rgb(255 255 255 / 0.035) 0 60px, rgb(255 255 255 / 0) 60px 150px);
      mask-image: linear-gradient(180deg, #000 0%, transparent 60%);
    }

    .od-plus-hero--brand {
      position: relative;
      display: none;
      align-items: center;
      gap: 10px;
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }

    .od-plus-hero--profile,
    .od-plus-hero--wave {
      display: none;
      position: absolute;
      left: 0;
      width: 100%;
      pointer-events: none;
    }

    .od-plus-hero--profile {
      bottom: 2px;
      height: 34px;
    }

    .od-plus-hero--profile-area {
      fill: var(--od-band-profile-area);
    }

    .od-plus-hero--profile-line {
      fill: none;
      stroke: var(--od-band-profile-line);
      stroke-width: 1.5;
      stroke-linejoin: round;
    }

    .od-plus-hero--wave {
      bottom: -1px;
      height: 18px;

      path {
        fill: var(--od-background);
      }
    }

    .od-plus-hero--text,
    .od-plus-hero--centre {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-plus-hero--text {
      align-items: flex-start;
    }

    .od-plus-hero--centre {
      align-items: center;
      text-align: center;
    }

    .od-plus-hero--check {
      width: 72px;
      height: 72px;
      border-radius: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-on-panel);
      color: var(--od-release-row-main);
    }

    .od-plus-hero--check-big {
      width: 84px;
      height: 84px;
      border-radius: 42px;
      box-shadow: 0 0 0 12px rgb(255 255 255 / 0.14);
      margin: 6px 0 8px;
    }

    .od-plus-hero--title {
      margin: 0;
      font-size: 28px;
      line-height: 34px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .od-plus-hero--lead {
      margin: 0;
      font-size: 16px;
      line-height: 22px;
      color: var(--od-release-on-panel-soft);
    }

    .od-plus--cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .od-plus--card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 14px 16px;
      border-radius: 20px;
      color: var(--od-text);
    }

    .od-plus--card-blue {
      background: var(--od-plus-blue);
      --od-plus-tone: var(--od-plus-blue-icon);
    }

    .od-plus--card-green {
      background: var(--od-plus-green);
      --od-plus-tone: var(--od-plus-green-icon);
    }

    .od-plus--card-amber {
      background: var(--od-plus-amber);
      --od-plus-tone: var(--od-plus-amber-icon);
    }

    .od-plus--card-violet {
      background: var(--od-plus-violet);
      --od-plus-tone: var(--od-plus-violet-icon);
    }

    .od-plus--card-maintenance {
      background: var(--od-maintenance);
      --od-plus-tone: var(--od-maintenance-icon);
    }

    /* Full width under the four tiles: the icon beside the two lines. */
    .od-plus--card-wide {
      flex-direction: row;
      align-items: center;
      gap: 14px;
      padding: 14px;

      .od-plus--card-icon {
        flex: none;
      }
    }

    .od-plus--card-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .od-plus--card-icon,
    .od-plus--activated-icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-surface);
      color: var(--od-plus-tone);
    }

    .od-plus--card-title {
      font-size: 16px;
      line-height: 20px;
      font-weight: 600;
    }

    .od-plus--card-text {
      font-size: 13px;
      line-height: 17px;
      color: var(--od-text-2);
    }

    .od-plus--price {
      display: flex;
      flex-direction: column;
      padding: 16px 20px;
      border-radius: 20px;
      background: var(--od-plus-price);
      color: var(--od-release-on-panel);
    }

    .od-plus--price-amount {
      font-size: 24px;
      line-height: 30px;
      font-weight: 600;
    }

    .od-plus--price-per {
      font-size: 15px;
      font-weight: 500;
      color: var(--od-plus-on-price-soft);
    }

    .od-plus--price-detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-plus-on-price-soft);
    }

    .od-plus--summary {
      margin: 0 auto;
      width: 280px;
      max-width: 100%;
      padding: 4px 16px;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 24px;
      background: var(--od-surface);
    }

    .od-plus--summary-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      font-size: 16px;
      line-height: 22px;

      &:not(:last-child) {
        border-bottom: 1px solid var(--od-release-divider);
      }

      dt {
        margin: 0;
        color: var(--od-text-2);
      }

      dd {
        margin: 0;
        font-weight: 600;
      }
    }

    .od-plus--account {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);

      :global(svg) {
        color: var(--od-release-ok);
      }
    }

    .od-plus--label {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--od-text-2);
    }

    .od-plus--activated {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .od-plus--activated-row {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 64px;
      padding: 10px 16px;
      border-radius: 20px;
      color: var(--od-text);

      :global(svg:last-child) {
        color: var(--od-plus-tone);
      }
    }

    .od-plus--activated-text {
      flex: 1;
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    /* Phone: the hero is edge to edge from the top of the page (the first launch's band is hidden for these steps). */
    @media (max-width: 767.98px) {
      .od-plus--title {
        font-size: 24px;
        line-height: 30px;
      }

      .od-plus--screen {
        max-width: none;
        gap: 12px;
      }

      .od-plus-hero {
        margin: -16px -16px 4px;
        border-radius: 0 0 40px 40px;
        padding: 40px 20px 36px;
      }

      .od-plus-hero--brand {
        display: flex;
        margin-bottom: 24px;
      }

      /* The OpenDives+ headers: the section band's dive profile above a wave in the page colour, as on the other setup screens. */
      .od-plus-hero--offer,
      .od-plus-hero--welcome,
      .od-plus-hero--health,
      .od-plus-hero--ready {
        border-radius: 0;
        padding-bottom: 52px;
        margin-bottom: 0;
      }

      .od-plus-hero--profile {
        display: block;
      }

      .od-plus-hero--wave {
        display: block;
      }

      .od-plus--provider,
      .od-plus--primary {
        width: 100%;
      }
    }
  }
</style>
