<script>
  // @ts-check
  // The Benthic+ screens of the release edition (task 2026-11-17-265; mock-ups docs/mockups-release/
  // android-odplus-connexion, -offre, -pret and -abonne): « Se connecter ou créer un compte », the offer, « Votre carnet
  // est prêt » and « Bienvenue dans Benthic+ ! ». There is no free account: an account exists only for a diver who
  // subscribed. Each provider button and the purchase call one function of lib/benthic-plus-billing.js: Apple works on
  // iPhone and iPad; Google and the purchase need native parts that are not wired yet and answer « unavailable ».
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import FirstLaunchRays from './FirstLaunchRays.svelte';
  import BrandLockup from './BrandLockup.svelte';
  import { BAND_PROFILE as BAND_CURVE } from '../lib/band-profile.js';
  import BenthicPlusReadyLogo from './BenthicPlusReadyLogo.svelte';
  import googleLogo from '../assets/brands/google-g.svg?raw';
  import appleLogoBlack from '../assets/brands/apple-logo-black.svg';
  import appleLogoWhite from '../assets/brands/apple-logo-white.svg';
  import BenthicPlusReadyBubbles from './BenthicPlusReadyBubbles.svelte';
  import { readyMotion, claimReady } from '../lib/ready-motion.svelte.js';
  import { flow, go, goBack, goDownload, goOffer } from '../lib/first-launch.svelte.js';
  import { offerShowsSignIn } from '../lib/first-launch-steps.js';
  import { devAccounts } from '../lib/dev-switch.js';
  import { ACTIVATED, BENEFITS, afterSignIn, includedGroups, providerOrder, summaryRows } from '../lib/benthic-plus.js';
  import { purchaseSubscription, restorePurchases, signInWithApple, signInWithGoogle } from '../lib/benthic-plus-billing.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { browseReadOnly, desktopPurchaseUrl } from '../lib/desktop-access.svelte.js';
  import { BenthicCore } from 'benthic-core';
  import { createServerApi } from '../lib/server-api.js';
  import { serverTransport } from '../lib/server-transport.js';
  import { serverUrl } from '../lib/server-url.js';
  import { currentDevice } from '../lib/device-session.js';
  import { deviceKind, deviceKey } from '../lib/first-launch-phone.js';
  import { desktopApp, ios, layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';
  import { accountFlow, askForAccess, openRecoveryKeyEntry, openStartOver } from '../lib/account-sync-flows.svelte.js';
  import { seenParts } from '../lib/account-sync-screens.js';

  /**
   * `onwithout`: « Continuer sans compte » and « Continuer sans abonnement » (back to the first step, nothing created).
   * `onopen`: « Ouvrir mon carnet ».
   * @type {{ step: 'benthicPlusConnect'|'benthicPlusOffer'|'benthicPlusAll'|'benthicPlusReady'|'benthicPlusWelcome'|'benthicPlusPair', onwithout: () => void, onopen: () => void }}
   */
  let { step, onwithout, onopen } = $props();

  // The pairing step ends when the key arrives (the approval, the recovery key) or when the diver starts over without the encrypted data.
  $effect(() => {
    if (step === 'benthicPlusPair' && accountFlow.unlocked) go('ready');
  });

  /** The section band's faint dive profile (the same path as SectionBand). */
  const BAND_PROFILE = BAND_CURVE;

  /** The offer header's still bubbles: [cx, cy, r] on the mock-up's 390 × 300 drawing. */
  const OFFER_BUBBLES = [[40, 210, 5], [78, 250, 3], [330, 190, 6], [352, 236, 3.5], [300, 120, 4], [64, 140, 3], [250, 260, 2.5], [120, 300, 4], [346, 300, 3]];

  // « Votre carnet est prêt » plays its sequence once (task 2026-11-18-270): decided when the step appears, kept while it shows.
  const motion = readyMotion;
  let motionStep = '';
  $effect.pre(() => {
    if (step === 'benthicPlusReady' && motionStep !== 'benthicPlusReady') claimReady();
    motionStep = step;
  });

  /** On a tablet and the desktop, the blue panel carries the ready header; only a phone draws it here. */
  const panelless = $derived(layout.phone && !desktopApp);
  /** A tablet (task 2026-11-23-335): the ready step follows its mock-up, the desktop and the phone keep theirs. */
  const tablet = $derived(!layout.phone && !desktopApp);
  const kind = $derived(deviceKind({ phone: layout.phone, ios, desktop: desktopApp }));

  let continuing = $state(false);
  async function continueWelcome() {
    if (continuing) return;
    continuing = true;
    try {
      // Development only: the account that just « bought » keeps its session on the device, then its logbook is looked for.
      if (devAccounts) {
        const dev = await import('../lib/dev-accounts.js');
        if (dev.hasPending()) {
          flow.plus.email = await dev.savePending();
          goDownload();
          return;
        }
      }
      go('next');
    } catch (e) {
      console.error('Keeping the simulated account on this device', e);
      showSnackbar(t('benthicPlus.purchaseUnavailable'));
    } finally {
      continuing = false;
    }
  }

  /** @param {'google'|'apple'} provider */
  async function provider(provider) {
    // Development only: the simulated sign-in (lib/dev-accounts.js) replaces the « not available » answer.
    if (devAccounts && provider === 'google') {
      devError = '';
      devOpen = true;
      return;
    }
    if (signingIn) return;
    signingIn = true;
    const name = provider === 'google' ? 'Google' : 'Apple';
    try {
      const answer = await (provider === 'google' ? signInWithGoogle() : signInWithApple(ios ? (o) => BenthicCore.appleSignIn(o) : undefined));
      if (answer.status === 'unavailable') showSnackbar(t('benthicPlus.providerUnavailable', { provider: name }));
      else if (answer.status === 'failed') showSnackbar(t('benthicPlus.providerFailed', { provider: name }));
      if (answer.status !== 'signedIn' || provider !== 'apple') return;
      const session = await createServerApi({ baseUrl: serverUrl(), transport: serverTransport }).signInApple({
        idToken: answer.idToken, nonce: answer.nonce ?? '', authorizationCode: answer.authorizationCode, name: answer.name, device: await currentDevice(),
      });
      flow.plus.email = session.user.email;
      // As the e-mail sign-in: an account without a subscription goes to the offer, and nothing of it is kept on this device.
      if (afterSignIn(session.user, desktopApp) === 'offer') {
        goOffer();
        return;
      }
      await BenthicCore.serverSessionSave({
        email: session.user.email,
        sessionToken: session.sessionToken,
        repositoryUrl: session.repository.url,
        branch: session.repository.branch || 'main',
        gitUsername: session.git.username,
        gitToken: session.git.token,
      });
      goDownload();
    } catch (e) {
      console.error('Apple sign-in on the server', e);
      showSnackbar(t('benthicPlus.providerFailed', { provider: name }));
    } finally {
      signingIn = false;
    }
  }
  let signingIn = false;

  // Development only: the sheet of the simulated Google sign-in, and what it does with the answer.
  let devOpen = $state(false);
  let devBusy = $state(false);
  let devError = $state('');

  /** @param {{ email: string, name: string }} answer */
  async function devSignedIn({ email, name }) {
    if (!devAccounts || devBusy) return;
    devBusy = true;
    devError = '';
    try {
      const dev = await import('../lib/dev-accounts.js');
      const session = await dev.createDevApi().signIn(email, name);
      devOpen = false;
      if (afterSignIn(session.user, desktopApp) === 'offer') {
        dev.rememberPending(session);
        flow.plus.email = session.user.email;
        goOffer();
      } else {
        dev.rememberPending(null);
        flow.plus.email = session.user.email;
        await dev.saveSession(session);
        goDownload();
      }
    } catch (e) {
      if (devAccounts) devError = (await import('../lib/dev-errors.js')).devErrorText(e, /^fr/i.test(navigator.language) ? 'fr' : 'en').text;
    } finally {
      devBusy = false;
    }
  }

  /** « S’abonner ». */
  async function subscribe() {
    if (devAccounts) {
      // Development only: the simulated purchase of the account signed in with the simulated Google.
      const dev = await import('../lib/dev-accounts.js');
      if (dev.hasPending()) {
        try {
          await dev.subscribePending();
          go('welcome');
        } catch (e) {
          console.error('Simulated purchase', e);
          showSnackbar(t('benthicPlus.purchaseUnavailable'));
        }
        return;
      }
    }
    const answer = await purchaseSubscription();
    if (answer.status === 'unavailable') showSnackbar(t('benthicPlus.purchaseUnavailable'));
    else if (answer.status === 'purchased') go('welcome');
  }

  /** « Restaurer les achats »: inert until StoreKit is wired (lib/benthic-plus-billing.js). */
  async function restore() {
    const answer = await restorePurchases();
    if (answer.status === 'unavailable') showSnackbar(t('benthicPlus.purchaseUnavailable'));
    else if (answer.status === 'purchased') go('welcome');
  }

  // Development builds only: the purchase is inert, so « Bienvenue dans Benthic+ » is reached from the console with
  // `__benthicPlus.purchased()`. The branch is dropped from a production build (`import.meta.env.DEV` is a constant).
  onMount(() => {
    if (!import.meta.env?.DEV || step !== 'benthicPlusOffer') return;
    /** @type {any} */ (window).__benthicPlus = { purchased: () => go('welcome') };
    return () => delete (/** @type {any} */ (window).__benthicPlus);
  });
</script>

{#snippet hero(/** @type {'offer'|'ready'|'welcome'} */ which)}
  <header class="bc-plus-hero bc-plus-hero--{which}">
    <div class="bc-plus-hero--rays"><FirstLaunchRays /></div>
    {#if which === 'ready' && motion.bubbles}<BenthicPlusReadyBubbles still={motion.still} />{/if}
    {#if which === 'offer'}
      <!-- The offer's own bubbles: still, at the places of the mock-up (task 2026-11-19-304). -->
      <svg class="bc-plus-hero--bubbles" viewBox="0 0 390 300" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        {#each OFFER_BUBBLES as [cx, cy, r]}<circle {cx} {cy} {r} />{/each}
      </svg>
    {/if}
    <!-- Every Benthic+ header: the band of the dive profile above the bottom wave, as on « Se connecter ». -->
    <svg class="bc-plus-hero--profile" width="300" height="34" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
      <path d="{BAND_PROFILE} V140 H0 Z" class="bc-plus-hero--profile-area" />
      <path d={BAND_PROFILE} class="bc-plus-hero--profile-line" vector-effect="non-scaling-stroke" />
    </svg>
    <svg class="bc-plus-hero--wave" width="300" height="18" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M0 11 Q37.5 2 75 11 T150 11 T225 11 T300 11 V18 H0 Z" /></svg>
    <div class="bc-plus-hero--brand"><BrandLockup size={which === 'offer' ? 'compact' : 'step'} /></div>
    {#if which === 'offer'}
      <div class="bc-plus-hero--text">
        <BenthicPlusChip label={t('benthicPlus.offer.pill')} large />
        <h2 class="bc-plus-hero--title">{t('benthicPlus.offer.title')}</h2>
        <p class="bc-plus-hero--lead">{t('benthicPlus.offer.lead')}</p>
      </div>
    {:else}
      <div class="bc-plus-hero--centre">
        {#if which === 'ready'}
          <BenthicPlusReadyLogo play={motion.play} />
        {:else}
          <span class="bc-plus-hero--check bc-plus-hero--check-big"><Icon name="check" size={44} weight={2.6} /></span>
        {/if}
        <BenthicPlusChip />
        <h2 class="bc-plus-hero--title">{t(which === 'ready' ? 'benthicPlus.ready.title' : 'benthicPlus.welcome.title')}</h2>
        <p class="bc-plus-hero--lead">{which === 'ready' ? t(deviceKey('benthicPlus.ready.lead', kind)) : t('benthicPlus.welcome.lead')}</p>
      </div>
    {/if}
  </header>
{/snippet}

{#snippet priceBlock()}
  <!-- Plain centred text, not a card (task 2026-11-19-295): the grey label is not tappable. -->
  <div class="bc-plus--price">
    <span class="bc-plus--price-label">{t('benthicPlus.offer.priceLabel')}</span>
    <span class="bc-plus--price-amount">{t('benthicPlus.offer.price')} <span class="bc-plus--price-per">{t('benthicPlus.offer.per')}</span></span>
    <span class="bc-plus--price-detail">{t('benthicPlus.offer.priceDetail')}</span>
    <span class="bc-plus--price-cancel"><Icon name="check" size={20} weight={2.4} />{t('benthicPlus.offer.cancelAnytime')}</span>
  </div>
{/snippet}

{#if devAccounts && devOpen}
  {#await import('./DevGoogleSheet.svelte') then sheet}
    {@const DevGoogleSheet = sheet.default}
    <DevGoogleSheet busy={devBusy} error={devError} onsubmit={devSignedIn} oncancel={() => (devOpen = false)} />
  {/await}
{/if}

{#if step === 'benthicPlusConnect'}
  {#if flow.desktopAccess}
    <!-- The desktop app without the right to it (task 2026-11-27-414; bureau-acces-connexion-requise.dc.html). -->
    <h2 class="bc-plus--title bc-plus--title-access">{t('desktopAccess.required.title')}</h2>
    <p class="bc-plus--lead bc-plus--lead-access">{t('desktopAccess.required.lead')}</p>
  {:else}
    <h2 class="bc-plus--title">{t('benthicPlus.connect.title')}</h2>
    <p class="bc-plus--lead">{t('benthicPlus.connect.lead')}</p>
  {/if}
  <div class="bc-plus--buttons" class:bc-plus--buttons-access={flow.desktopAccess}>
    <!-- The official logos and rules of each provider (assets/brands/README.md): the logos are never altered. -->
    <!-- « Continuer avec Apple » first on iOS (task 2026-11-19-289, ios-odplus-connexion.dc.html). -->
    {#each providerOrder(ios) as which (which)}
      {#if which === 'google'}
        <button type="button" class="bc-plus--provider bc-plus--provider-google" onclick={() => provider('google')}>
          <span class="bc-plus--google-logo" aria-hidden="true">{@html googleLogo}</span>{t('benthicPlus.connect.google')}
        </button>
      {:else if which === 'apple'}
        <button type="button" class="bc-plus--provider bc-plus--provider-apple" onclick={() => provider('apple')}>
          <img class="bc-plus--apple-logo bc-plus--apple-logo-light" src={appleLogoBlack} alt="" aria-hidden="true" /><img class="bc-plus--apple-logo bc-plus--apple-logo-dark" src={appleLogoWhite} alt="" aria-hidden="true" />{t('benthicPlus.connect.apple')}
        </button>
      {:else}
        <button type="button" class="bc-plus--provider bc-plus--provider-main" onclick={() => go('email')}>
          <Icon name="mail" size={22} />{t('benthicPlus.connect.email')}
        </button>
      {/if}
    {/each}
  </div>
  {#if flow.desktopAccess}
    <p class="bc-plus--note">
      {t('desktopAccess.required.noAccount')} <a class="bc-plus--buy" href={desktopPurchaseUrl} target="_blank" rel="noopener noreferrer">{t('desktopAccess.required.buy')}</a> {t('desktopAccess.required.noAccountAfter')}
    </p>
    <button type="button" class="bc-plus--text bc-plus--text-link" onclick={browseReadOnly}>{t('desktopAccess.required.readOnly')}</button>
  {:else}
    <p class="bc-plus--note">{t('benthicPlus.connect.note')}</p>
    <button type="button" class="bc-plus--text bc-plus--text-link" onclick={onwithout}>{t('benthicPlus.connect.without')}</button>
  {/if}
{:else if step === 'benthicPlusOffer'}
  <div class="bc-plus--screen bc-plus--screen-offer" class:bc-plus--screen-ios={ios}>
    <!-- A tablet's blue panel (pages/WelcomeStartRelease.svelte) carries the chip, the title and the lead: the hero is the phone's. -->
    {#if layout.phone || desktopApp}{@render hero('offer')}{/if}
    <div class="bc-plus--cards">
      {#each BENEFITS as b (b.key)}
        <div class="bc-plus--card bc-plus--card-{b.tone}">
          <span class="bc-plus--card-icon"><Icon name={b.icon} size={24} weight={1.9} /></span>
          <span class="bc-plus--card-copy">
            <span class="bc-plus--card-title">{t(`benthicPlus.offer.${b.key}`)}</span>
            <span class="bc-plus--card-text">{t(`benthicPlus.offer.${b.key}Text`)}</span>
          </span>
        </div>
      {/each}
    </div>
    <div class="bc-plus--card bc-plus--card-maintenance bc-plus--card-wide">
      <span class="bc-plus--card-icon"><Icon name="wrench" size={24} weight={1.9} /></span>
      <span class="bc-plus--card-body">
        <span class="bc-plus--card-title">{t('benthicPlus.offer.maintenance')}</span>
        <span class="bc-plus--card-text">{t('benthicPlus.offer.maintenanceText')}</span>
      </span>
    </div>
    <!-- « Voir tout ce qui est inclus » (task 2026-11-19-295): opens the list of everything the subscription includes. -->
    <button type="button" class="bc-plus--see-all" onclick={() => go('all')}>{t('benthicPlus.offer.seeAll')}<Icon name="chevron" size={22} weight={2.2} /></button>
    {@render priceBlock()}
    <button type="button" class="bc-plus--primary" onclick={subscribe}>{t('benthicPlus.offer.subscribe')}</button>
    {#if ios}
      <!-- App Store requirements (task 289): restoring purchases, and the terms of the automatic renewal. -->
      <button type="button" class="bc-plus--text bc-plus--text-centre" onclick={restore}>{t('benthicPlus.offer.restore')}</button>
      <p class="bc-plus--terms">{t('benthicPlus.offer.terms', { price: t('benthicPlus.offer.price') })}</p>
    {/if}
    <button type="button" class="bc-plus--text bc-plus--text-centre" onclick={onwithout}>{t('benthicPlus.offer.without')}</button>
    <p class="bc-plus--no-account">{t('benthicPlus.offer.noAccount')}</p>
    {#if offerShowsSignIn(flow.stack)}
      <!-- « Déjà abonné ? Se connecter » (task 2026-11-18-281): hidden right after a sign-in, where the diver is already in.
           On a tablet it sits at the top right, on the row of « Retour » (task 2026-11-19-295). -->
      <p class="bc-plus--already" class:bc-plus--already-top={!layout.phone && !desktopApp}>{t('benthicPlus.offer.already')} <button type="button" class="bc-plus--link" onclick={() => go('signIn')}>{t('benthicPlus.offer.signIn')}</button></p>
    {/if}
  </div>
{:else if step === 'benthicPlusAll'}
  <!-- « Tout ce qui est inclus » (task 2026-11-19-295; mock-ups android-odplus-complet, ios-odplus-complet and
       android-tablette-odplus-complet-paysage): the rows of each group, then the price footer that stays at the bottom. -->
  <div class="bc-plus-all" class:bc-plus-all--ios={kind === 'iphone'}>
    <div class="bc-plus-all--bar">
      <button type="button" class="bc-plus-all--back" aria-label={t('welcomeSteps.back')} onclick={goBack}>
        {#if kind === 'iphone'}
          <span class="bc-plus-all--back-chevron"><Icon name="chevron" size={22} weight={2.4} /></span>{t('benthicPlus.chip')}
        {:else}
          <Icon name="arrowBack" size={24} weight={2} />
        {/if}
      </button>
      {#if kind !== 'iphone'}<h1 class="bc-plus-all--title">{t('benthicPlus.all.title')}</h1>{/if}
    </div>
    {#if kind === 'iphone'}<h1 class="bc-plus-all--title bc-plus-all--title-large">{t('benthicPlus.all.title')}</h1>{/if}
    <div class="bc-plus-all--body">
      <BenthicPlusChip onSheet />
      <p class="bc-plus-all--subtitle">{t('benthicPlus.all.subtitle')}</p>
      {#each includedGroups() as group (group.key)}
        <h2 class="bc-plus-all--group">{t(`benthicPlus.all.${group.key}`)}</h2>
        <ul class="bc-plus-all--rows">
          {#each group.rows as row (row.key)}
            <li class="bc-plus-all--row">
              <span class="bc-plus-all--tile bc-plus-all--tile-{row.tone}"><Icon name={row.icon} size={22} weight={2} /></span>
              <span class="bc-plus-all--texts">
                <span class="bc-plus-all--row-title">{t(`benthicPlus.all.${row.key}`)}</span>
                <span class="bc-plus-all--row-text">{t(row.key === 'sync' ? deviceKey('benthicPlus.all.syncText', kind) : `benthicPlus.all.${row.key}Text`)}</span>
              </span>
            </li>
          {/each}
        </ul>
      {/each}
    </div>
    <div class="bc-plus-all--footer">
      {@render priceBlock()}
      <button type="button" class="bc-plus--primary" onclick={subscribe}>{t('benthicPlus.offer.subscribe')}</button>
      <button type="button" class="bc-plus-all--without" onclick={onwithout}>{t('benthicPlus.offer.without')}</button>
    </div>
  </div>
{:else if step === 'benthicPlusReady'}
  <div class="bc-plus--screen" class:bc-plus--screen-ready={tablet}>
    {#if panelless}{@render hero('ready')}{/if}
    {#if tablet}<h2 class="bc-plus--ready-heading">{t('benthicPlus.ready.heading')}</h2>{/if}
    {#if summaryRows(flow.plus.counts).length}
    <dl class="bc-plus--summary">
      {#each summaryRows(flow.plus.counts) as row (row.key)}
        <div class="bc-plus--summary-row">
          <dt>{t(`benthicPlus.ready.${row.key}`)}</dt>
          <dd>{row.key === 'gear' ? t('benthicPlus.ready.articles', { n: row.n }) : row.n}</dd>
        </div>
      {/each}
    </dl>
    {/if}
    <p class="bc-plus--account"><Icon name="check" size={16} weight={2.4} />{t('benthicPlus.ready.account', { email: flow.plus.email })}</p>
    <button type="button" class="bc-plus--primary" onclick={onopen}>{t('benthicPlus.ready.open')}</button>
  </div>
{:else if step === 'benthicPlusPair'}
  <!-- Phone, at sign-in on a device without the data key (task 2026-11-23-348, 349 and 350): the request is sent from here. -->
  <div class="bc-plus--screen bc-plus-pair">
    <h2 class="bc-plus-pair--title">{t('accountSync.pairStep.title')}</h2>
    <p class="bc-plus-pair--reason">{t('accountSync.pairStep.reason')}</p>
    <h3 class="bc-plus-pair--label">{t('accountSync.devices.title')}</h3>
    {#if accountFlow.devices.length}
      <ul class="bc-plus-pair--devices">
        {#each accountFlow.devices as device (device.id)}
          {@const seen = seenParts(device.lastSeenAt)}
          <li class="bc-plus-pair--device">
            <Icon name="device" size={22} />
            <span class="bc-plus-pair--device-name">{device.name}</span>
            <span class="bc-plus-pair--device-seen">{t(`accountSync.devices.${seen.key}`, { n: seen.n })}</span>
          </li>
        {/each}
      </ul>
      <p class="bc-plus-pair--line">{t('accountSync.devices.line')}</p>
    {:else}
      <p class="bc-plus-pair--line">{t('accountSync.devices.none')}</p>
    {/if}
    <div class="bc-plus--buttons">
      <button type="button" class="bc-plus--primary" data-action="ask" onclick={() => void askForAccess()}>{t('accountSync.pairStep.ask')}</button>
      <button type="button" class="bc-plus-pair--outlined" data-action="recovery-key" onclick={openRecoveryKeyEntry}>{t('accountSync.unlock.recoveryKey')}</button>
      <button type="button" class="bc-plus--text bc-plus--text-centre" data-action="later" onclick={() => go('ready')}>{t('accountSync.pairStep.later')}</button>
    </div>
    <p class="bc-plus--note">{t('accountSync.pairStep.note')}</p>
    <button type="button" class="bc-plus--text bc-plus--text-centre" data-action="lost" onclick={openStartOver}>{t('accountSync.unlock.lost')}</button>
  </div>
{:else if step === 'benthicPlusWelcome'}
  <div class="bc-plus--screen">
    {@render hero('welcome')}
    <h3 class="bc-plus--label">{t('benthicPlus.welcome.activated')}</h3>
    <ul class="bc-plus--activated">
      {#each ACTIVATED as key, i (key)}
        <li class="bc-plus--activated-row bc-plus--card-{['blue', 'green', 'amber'][i]}">
          <span class="bc-plus--activated-icon"><Icon name={['sync', 'cloudDownload', 'briefcase'][i]} size={22} weight={1.9} /></span>
          <span class="bc-plus--activated-text">{t(`benthicPlus.welcome.${key}`)}</span>
          <Icon name="check" size={20} weight={2.4} />
        </li>
      {/each}
    </ul>
    <p class="bc-plus--account bc-plus--account-plain">{t('benthicPlus.welcome.account', { email: flow.plus.email })}</p>
    <button type="button" class="bc-plus--primary" disabled={continuing} onclick={continueWelcome}>{t('benthicPlus.welcome.next')}</button>
  </div>
{/if}

<style>
  @layer bc.components {
    .bc-plus--title {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .bc-plus--lead {
      margin: 0 0 20px;
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text-2);
    }

    .bc-plus--buttons {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .bc-plus--provider {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      height: 56px;
      padding: 0 20px;
      border: 1px solid var(--bc-release-field-border);
      border-radius: 28px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 2px;
      }
    }

    .bc-plus--provider-main {
      border: none;
      background: var(--bc-release-row-main);
      color: var(--bc-release-on-panel);

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-row-main-hover);
        }
      }
    }

    /* Google: white (light) or #131314 (dark) with a thin stroke. The supplied "G" is a 24 x 24 picture with a 1 px margin,
       shown at 22 x 22: the letter itself is about 20 px, the size the guidelines fix (custom button). */
    /* The desktop sign-in screen draws the e-mail choice outlined like the two others (bureau-acces-connexion-requise.dc.html). */
    .bc-plus--buttons-access .bc-plus--provider-main {
      border: 1px solid var(--bc-brand-google-border);
      background: var(--bc-brand-google-bg);
      color: var(--bc-brand-google-ink);
    }

    .bc-plus--provider-google {
      gap: 10px;
      padding: 0 16px 0 12px;
      border-color: var(--bc-brand-google-border);
      background: var(--bc-brand-google-bg);
      color: var(--bc-brand-google-ink);

      @media (hover: hover) {
        &:hover {
          background: var(--bc-brand-google-bg);
          filter: brightness(0.96);
        }
      }
    }

    .bc-plus--google-logo {
      flex: none;
      display: flex;
      width: 22px;
      height: 22px;

      :global(svg) {
        width: 22px;
        height: 22px;
      }
    }

    /* Apple: a white or black button, the logo 22 px high (width follows), the title in the logo's colour
       (Sign in with Apple guidelines, custom button). */
    .bc-plus--provider-apple {
      gap: 12px;
      padding: 0 20px;
      border-color: var(--bc-brand-apple-border);
      background: var(--bc-brand-apple-bg);
      color: var(--bc-brand-apple-ink);

      @media (hover: hover) {
        &:hover {
          background: var(--bc-brand-apple-bg);
          filter: brightness(0.96);
        }
      }
    }

    .bc-plus--apple-logo {
      flex: none;
      height: 22px;
      width: auto;
    }

    .bc-plus--apple-logo-dark {
      display: none;
    }

    :global(html.dark) {
      .bc-plus--apple-logo-light {
        display: none;
      }

      .bc-plus--apple-logo-dark {
        display: block;
      }
    }

    .bc-plus--note {
      margin: 18px 0 6px;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }

    .bc-plus--text {
      align-self: flex-start;
      height: 48px;
      margin-left: -12px;
      padding: 0 12px;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
      }
    }

    /* « Continuer sans compte » on the connection screen: centred, in the main blue (android-odplus-connexion). */
    .bc-plus--text-link {
      align-self: center;
      margin-left: 0;
      margin-top: 8px;
      color: var(--bc-release-link);
    }

    /* Tablet and desktop (task 2026-11-18-281): the three buttons and their note are 440 px wide, and « Continuer sans compte » is centred across that width. */
    @media (min-width: 768px) {
      .bc-plus--buttons,
      .bc-plus--note {
        width: 100%;
        max-width: 440px;
      }

      .bc-plus--text-link {
        align-self: flex-start;
        width: 100%;
        max-width: 440px;
        margin-left: 0;
        padding: 0 16px;
        box-sizing: border-box;
        text-align: center;
      }
    }

    /* « Jumeler cet appareil » at sign-in (phone): the reason, the paired devices, the buttons. */
    .bc-plus-pair--title {
      margin: 0 0 8px;
      font-size: 24px;
      line-height: 32px;
      font-weight: 500;
    }

    .bc-plus-pair--reason,
    .bc-plus-pair--line {
      margin: 0 0 16px;
      font-size: 15px;
      line-height: 21px;
      color: var(--bc-text-2);
    }

    .bc-plus-pair--label {
      margin: 8px 0;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
    }

    .bc-plus-pair--devices {
      list-style: none;
      margin: 0 0 8px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-plus-pair--device {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 8px 16px;
      border-radius: 16px;
      background: var(--bc-surface);
    }

    .bc-plus-pair--device-name {
      flex: 1;
      min-width: 0;
      font-size: 16px;
      font-weight: 500;
    }

    .bc-plus-pair--device-seen {
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-plus-pair--outlined {
      height: 56px;
      border: 1.5px solid var(--bc-release-row-main);
      border-radius: 28px;
      background: transparent;
      color: var(--bc-release-row-main);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;
    }

    .bc-plus--text-centre {
      align-self: center;
      margin-left: 0;
      margin-top: 0;
      height: 48px;
      color: var(--bc-text-2);
    }

    .bc-plus--primary {
      height: 56px;
      border: none;
      border-radius: 28px;
      background: var(--bc-release-row-main);
      box-shadow: 0 2px 6px var(--bc-release-row-main-shadow);
      color: var(--bc-release-on-panel);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-row-main-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        outline-offset: 2px;
      }
      &:disabled {
        opacity: 0.6;
      }
    }

    .bc-plus--no-account {
      margin: 0;
      text-align: center;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    /* « Déjà abonné ? Se connecter »: grey text, the link underlined in the main blue (task 2026-11-18-281). */
    .bc-plus--already {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      column-gap: 4px;
      min-height: 48px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* A tablet: « Déjà abonné ? Se connecter » sits at the top right, on the row of « Retour » (task 2026-11-19-295). */
    .bc-plus--already-top {
      position: absolute;
      top: -52px;
      right: 0;
      min-height: 40px;
    }

    .bc-plus--link {
      width: auto;
      min-height: 48px;
      padding: 0 4px;
      border: none;
      background: none;
      color: var(--bc-release-link);
      font: inherit;
      font-weight: 500;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
        border-radius: 8px;
      }
    }

    /* The three screens with the blue hero. On a phone they use the whole width, the first launch's own band is hidden. */
    .bc-plus--screen {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 520px;

      /* A tablet: the help link is pinned over the column's foot; the last line scrolls clear of it. */
      @media (min-width: 768px) {
        padding-bottom: 64px;
      }
    }

    .bc-plus-hero {
      position: relative;
      overflow: hidden;
      border-radius: 28px;
      padding: 28px 24px 32px;
      background: var(--bc-plus-hero);
      color: var(--bc-release-on-panel);
    }

    .bc-plus-hero--rays {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .bc-plus-hero--brand {
      position: relative;
      display: none;
    }

    .bc-plus-hero--bubbles {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 300px;
      pointer-events: none;

      circle {
        fill: none;
        stroke: var(--bc-plus-bubble);
        stroke-width: 1.2;
      }
    }

    .bc-plus-hero--profile,
    .bc-plus-hero--wave {
      display: none;
      position: absolute;
      left: 0;
      width: 100%;
      pointer-events: none;
    }

    .bc-plus-hero--profile {
      bottom: 2px;
      height: 34px;
    }

    .bc-plus-hero--profile-area {
      fill: var(--bc-band-profile-area);
    }

    .bc-plus-hero--profile-line {
      fill: none;
      stroke: var(--bc-band-profile-line);
      stroke-width: 1.5;
      stroke-linejoin: round;
    }

    .bc-plus-hero--wave {
      bottom: -1px;
      height: 18px;

      path {
        fill: var(--bc-background);
      }
    }

    .bc-plus-hero--text,
    .bc-plus-hero--centre {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-plus-hero--text {
      align-items: flex-start;
    }

    .bc-plus-hero--centre {
      align-items: center;
      text-align: center;
    }

    .bc-plus-hero--check {
      width: 72px;
      height: 72px;
      border-radius: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-release-on-panel);
      color: var(--bc-release-row-main);
    }

    .bc-plus-hero--check-big {
      width: 84px;
      height: 84px;
      border-radius: 42px;
      box-shadow: 0 0 0 12px rgb(255 255 255 / 0.14);
      margin: 6px 0 8px;
    }

    .bc-plus-hero--title {
      margin: 0;
      font-size: 28px;
      line-height: 34px;
      font-weight: 500;
      letter-spacing: -0.2px;
    }

    .bc-plus-hero--lead {
      margin: 0;
      font-size: 16px;
      line-height: 22px;
      color: var(--bc-release-on-panel-soft);
    }

    .bc-plus--cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .bc-plus--card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      border-radius: 20px;
      color: var(--bc-text);
    }

    .bc-plus--card-blue {
      background: var(--bc-plus-blue);
      --bc-plus-tone: var(--bc-plus-blue-icon);
    }

    .bc-plus--card-green {
      background: var(--bc-plus-green);
      --bc-plus-tone: var(--bc-plus-green-icon);
    }

    .bc-plus--card-amber {
      background: var(--bc-plus-amber);
      --bc-plus-tone: var(--bc-plus-amber-icon);
    }

    .bc-plus--card-violet {
      background: var(--bc-plus-violet);
      --bc-plus-tone: var(--bc-plus-violet-icon);
    }

    .bc-plus--card-maintenance {
      background: var(--bc-maintenance);
      --bc-plus-tone: var(--bc-maintenance-icon);
    }

    /* Full width under the four tiles: the icon beside the two lines. */
    .bc-plus--card-wide {
      flex-direction: row;
      align-items: center;
      gap: 16px;
      padding: 16px;

      .bc-plus--card-icon {
        flex: none;
      }
    }

    .bc-plus--card-body {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bc-plus--card-icon {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-surface);
      color: var(--bc-plus-tone);
    }

    /* The title and the line of a small card: on a phone they are two rows of the card's column (8 dp apart); on a tablet the
       icon sits to their left to save height. */
    .bc-plus--card-copy {
      display: contents;
    }

    .bc-plus--activated-icon {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-surface);
      color: var(--bc-plus-tone);
    }

    .bc-plus--card-title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-plus--card-text {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    @media (min-width: 768px) {
      .bc-plus--cards .bc-plus--card {
        flex-direction: row;
        align-items: flex-start;
        gap: 12px;
      }

      .bc-plus--card-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
    }

    .bc-plus--terms {
      margin: 4px 0 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
      text-align: center;
    }

    /* The price: plain centred text, not a card (task 2026-11-19-295): the grey label is not tappable. */
    .bc-plus--price {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 8px 0 12px;
      text-align: center;
      color: var(--bc-text);
    }

    .bc-plus--price-label {
      margin-bottom: 4px;
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-plus--price-amount {
      font-size: 32px;
      line-height: 40px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .bc-plus--price-per {
      margin-left: 2px;
      font-size: 20px;
      line-height: 28px;
      font-weight: 500;
      color: var(--bc-text-2);
    }

    .bc-plus--price-detail {
      margin-top: 4px;
      font-size: 17px;
      line-height: 24px;
      color: var(--bc-text-2);
    }

    .bc-plus--price-cancel {
      margin-top: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-release-ok);
    }

    /* « Voir tout ce qui est inclus ›»: a text link, 48 dp high. */
    .bc-plus--see-all {
      align-self: center;
      width: auto;
      height: 48px;
      padding: 0 16px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--bc-release-link);
      font: inherit;
      font-size: 17px;
      line-height: 24px;
      font-weight: 600;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
      }
    }

    .bc-plus--summary {
      margin: 0 auto;
      width: 280px;
      max-width: 100%;
      padding: 4px 16px;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 24px;
      background: var(--bc-surface);
    }

    .bc-plus--summary-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      font-size: 16px;
      line-height: 22px;

      &:not(:last-child) {
        border-bottom: 1px solid var(--bc-release-divider);
      }

      dt {
        margin: 0;
        color: var(--bc-text-2);
      }

      dd {
        margin: 0;
        font-weight: 600;
      }
    }

    .bc-plus--account {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 0;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);

      :global(svg) {
        color: var(--bc-release-ok);
      }
    }

    /* « Votre carnet est prêt » on a tablet (task 2026-11-23-335; mock-up android-tablette-odplus-pret-paysage): a heading, the
       figures in a card across the column, the account line at the left, the button 48 dp high at the end. */
    .bc-plus--screen-ready {
      gap: 0;
      max-width: none;

      & .bc-plus--ready-heading {
        margin: 0 0 16px;
        font-size: 28px;
        line-height: 36px;
        font-weight: 500;
      }

      & .bc-plus--summary {
        width: auto;
        margin: 0;
        padding: 4px 20px;
        border-radius: 20px;
      }

      & .bc-plus--summary-row {
        box-sizing: border-box;
        height: 52px;
        align-items: center;
        padding: 0;

        & dd {
          font-size: 17px;
        }
      }

      & .bc-plus--account {
        justify-content: flex-start;
        margin: 14px 0 24px;
      }

      & .bc-plus--primary {
        align-self: flex-end;
        width: auto;
        height: 48px;
        padding: 0 28px;
        border-radius: 24px;
        font-size: 15px;
      }
    }

    .bc-plus--label {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--bc-text-2);
    }

    .bc-plus--activated {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .bc-plus--activated-row {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 64px;
      padding: 10px 16px;
      border-radius: 20px;
      color: var(--bc-text);

      :global(svg:last-child) {
        color: var(--bc-plus-tone);
      }
    }

    .bc-plus--activated-text {
      flex: 1;
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .bc-plus--screen-offer {
      gap: 8px;
    }

    /* « Tout ce qui est inclus » (task 2026-11-19-295). */
    .bc-plus-all {
      display: flex;
      flex-direction: column;
      max-width: 640px;
      min-height: 100%;
    }

    .bc-plus-all--bar {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 56px;
      margin-left: -12px;
    }

    .bc-plus-all--back {
      width: auto;
      min-width: 48px;
      height: 48px;
      padding: 0 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
      }
    }

    /* The iPhone's navigation bar: « ‹ Benthic+ » in the link colour, the large title under it. */
    .bc-plus-all--ios .bc-plus-all--back {
      padding: 0 8px 0 0;
      gap: 0;
      font-size: 17px;
      color: var(--bc-release-link);
    }

    .bc-plus-all--back-chevron {
      display: flex;
      transform: rotate(180deg);
    }

    .bc-plus-all--title {
      margin: 0;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
      color: var(--bc-text);
    }

    .bc-plus-all--title-large {
      margin: 0 0 8px;
      font-size: 34px;
      line-height: 41px;
      font-weight: 700;
    }

    .bc-plus-all--body {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding-bottom: 0;
    }

    .bc-plus-all--subtitle {
      margin: 8px 4px 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);
    }

    .bc-plus-all--group {
      margin: 20px 4px 8px;
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-plus-all--rows {
      align-self: stretch;
      margin: 0;
      padding: 0;
      list-style: none;
      overflow: hidden;
      border-radius: 20px;
      background: var(--bc-surface);
    }

    .bc-plus-all--row {
      position: relative;
      min-height: 72px;
      padding: 12px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 16px;
      color: var(--bc-text);

      & + & {
        &::before {
          content: '';
          position: absolute;
          top: 0;
          left: 72px;
          right: 0;
          height: 1px;
          background: var(--bc-release-divider);
        }
      }
    }

    .bc-plus-all--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-plus-all--tile-blue {
      background: var(--bc-plus-blue);
      color: var(--bc-plus-blue-icon);
    }

    .bc-plus-all--tile-green {
      background: var(--bc-plus-green);
      color: var(--bc-plus-green-icon);
    }

    .bc-plus-all--tile-amber {
      background: var(--bc-plus-amber);
      color: var(--bc-plus-amber-icon);
    }

    .bc-plus-all--tile-violet {
      background: var(--bc-plus-violet);
      color: var(--bc-plus-violet-icon);
    }

    .bc-plus-all--tile-red {
      background: var(--bc-maintenance);
      color: var(--bc-maintenance-icon);
    }

    .bc-plus-all--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .bc-plus-all--row-title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-plus-all--row-text {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* « Continuer sans abonnement »: a centred text button under « S'abonner », 14 sp semibold, 40 dp high. */
    .bc-plus-all--without {
      align-self: center;
      height: 40px;
      margin-top: 4px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--bc-release-link);
      font: inherit;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: var(--bc-release-hover);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--bc-release-row-main);
      }
    }

    /* The price footer follows the last group, 16 dp below it, and stays at the bottom while the list scrolls. */
    .bc-plus-all--footer {
      position: sticky;
      bottom: 0;
      margin-top: 16px;
      padding: 16px 16px 24px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: var(--bc-background);
      border-top: 1px solid var(--bc-release-divider);

      .bc-plus--price {
        margin: 0 0 24px;
      }

      /* A tablet: the footer is horizontal, the price on the left and the button on the right. */
      @media (min-width: 768px) {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 16px;
        padding: 16px 0 24px;

        .bc-plus--price {
          margin: 0;
        }

        .bc-plus--price-amount {
          white-space: nowrap;
        }

        .bc-plus--primary {
          flex: none;
          width: 160px;
        }

        /* Under the price and the button, on a line of its own. */
        .bc-plus-all--without {
          grid-column: 1 / -1;
          justify-self: center;
          margin-top: -8px;
        }
      }
    }

    /* Phone: the hero is edge to edge from the top of the page (the first launch's band is hidden for these steps). */
    @media (max-width: 767.98px) {
      .bc-plus--title {
        font-size: 24px;
        line-height: 30px;
      }

      .bc-plus--screen {
        max-width: none;
        gap: 12px;
      }

      .bc-plus-hero {
        margin: -16px -16px 4px;
        border-radius: 0 0 40px 40px;
        padding: 40px 20px 36px;
      }

      .bc-plus-hero--brand {
        display: block;
        margin-bottom: 24px;
      }

      /* The Benthic+ headers: the section band's dive profile above a wave in the page colour, as on the other setup screens. */
      .bc-plus-hero--offer,
      .bc-plus-hero--welcome,
      .bc-plus-hero--ready {
        border-radius: 0;
        padding-bottom: 52px;
        margin-bottom: 0;
      }

      /* The offer's header: 264 dp high (292 on an iPhone), 24 dp between the lead and the wave's top (task 2026-11-19-295). */
      .bc-plus-hero--offer {
        box-sizing: border-box;
        min-height: 264px;
        padding: 36px 16px 40px;

        .bc-plus-hero--brand {
          margin-bottom: 20px;
        }

        .bc-plus-hero--lead {
          line-height: 24px;
          color: rgb(255 255 255 / 0.88);
        }

        .bc-plus-hero--title {
          font-size: 24px;
          line-height: 32px;
        }

        .bc-plus-hero--text {
          gap: 0;

          .bc-plus-hero--title {
            margin: 12px 0 8px;
          }
        }
      }

      .bc-plus--screen-ios .bc-plus-hero--offer {
        min-height: 292px;
      }

      .bc-plus-all--footer {
        margin-left: -16px;
        margin-right: -16px;
        margin-bottom: -16px;
        padding-bottom: max(24px, var(--f7-safe-area-bottom, 0px));
      }

      .bc-plus-hero--profile {
        display: block;
      }

      .bc-plus-hero--wave {
        display: block;
      }

      .bc-plus--provider,
      .bc-plus--primary {
        width: 100%;
      }
    }
  }
</style>
