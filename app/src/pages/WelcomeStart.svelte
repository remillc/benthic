<script>
  // @ts-check
  // First launch (spec, section 4, "First launch, redesigned"; Android:
  // docs/mockups/android-accueil-c.dc.html, iPhone: ios-accueil.dc.html): three
  // ways to start, each with its consequence. Android: the logo, a large title,
  // a dive profile, then three pill buttons of decreasing weight at the bottom: filled,
  // outlined, tonal (task 2026-11-14-123), and under a thin divider the git link.
  // iOS: an inset grouped list with chevrons.
  import { Page, theme } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import WelcomeHelpLink from '../components/WelcomeHelpLink.svelte';
  import DecorativeProfile from '../components/DecorativeProfile.svelte';
  import { startWithoutAccount } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';
  import { layout } from '../lib/layout.svelte.js';
  import { decorativeProfilePath } from '../lib/smooth-path.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  const WIDTH = 390;
  const HEIGHT = 220;
  // Illustration: the dive of the mock-ups as a smooth curve through every point (task 2026-11-15-214).
  const line = decorativeProfilePath(WIDTH, 40, 160);
  // The water column lies between the surface and the profile line.
  const area = `${line} L${WIDTH} 0 L0 0 Z`;

  /** @param {MouseEvent} e @param {string} url */
  function go(e, url) {
    e.preventDefault();
    f7router.navigate(url);
  }

  function withoutAccount(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    startWithoutAccount();
  }
</script>

<Page class="od-welcome-start">
  {#if !theme.ios}
    <div class="od-welcome-start--page">
      <div class="od-welcome-start--head">
      <div class="od-welcome-start--brand" role="img" aria-label={t('welcome.brandAlpha')}>
        <img class="od-welcome-start--logo od-welcome-start--light" src="logo-light.svg" alt="" width="40" height="40" />
        <img class="od-welcome-start--logo od-welcome-start--dark" src="logo-dark.svg" alt="" width="40" height="40" />
        <!-- The alpha (tasks 2026-11-16-225 and 229): a decorative badge 8 dp after the name, on its line; the row's name says it once. -->
        <span class="od-welcome-start--name" aria-hidden="true">OpenDives<span class="od-welcome-start--alpha">{t('welcome.alpha')}</span></span>
      </div>
      <h1 class="od-welcome-start--headline">{t('welcome.headline')}</h1>
      </div>
      <DecorativeProfile class="od-welcome-start--wide-profile" />
      <div class="od-welcome-start--space"></div>
      <div class="od-welcome-start--actions">
      <nav class="od-welcome-start--buttons" aria-label={t('welcome.choicesLabel')}>
        <div class="od-welcome-start--option">
          <a href="/welcome/sign-in" class="od-welcome-start--pill od-welcome-start--pill-filled" onclick={(e) => go(e, '/welcome/sign-in')}>{t('welcome.existingShort')}</a>
          <p class="od-welcome-start--note">{t('welcome.existingNote')}</p>
        </div>
        <div class="od-welcome-start--option">
          <a href="/welcome/create" class="od-welcome-start--pill od-welcome-start--pill-outlined" onclick={(e) => go(e, '/welcome/create')}>{t('welcome.createShort')}</a>
          <p class="od-welcome-start--note">{t('welcome.createNote')}</p>
        </div>
        <div class="od-welcome-start--option">
          <a href="#no-account" class="od-welcome-start--pill od-welcome-start--pill-tonal external" onclick={withoutAccount}>{t('welcome.noAccount')}</a>
          <p class="od-welcome-start--note">{t(layout.phone ? 'welcome.noAccountNotePhone' : 'welcome.noAccountNoteTablet')}</p>
        </div>
      </nav>
      <div class="od-welcome-start--divider" role="presentation"></div>
      <a href="/welcome/git" class="od-welcome-start--git-link" onclick={(e) => go(e, '/welcome/git')}>{t('welcome.ownGit')}</a>
      </div>
    </div>
    <WelcomeHelpLink />
  {:else}
  <svg class="od-welcome-start--profile" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="od-welcome-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="od-welcome-start--water-top"></stop>
        <stop offset="1" class="od-welcome-start--water-bottom"></stop>
      </linearGradient>
    </defs>
    <rect class="od-welcome-start--ground" x="0" y="0" width={WIDTH} height={HEIGHT}></rect>
    <path class="od-welcome-start--water" d={area}></path>
    <path class="od-welcome-start--trace" d={line}></path>
  </svg>

  <div class="od-welcome-start--heading">
    <h1 aria-label={t('welcome.brandAlpha')}><span aria-hidden="true">{t('welcome.title')}</span><span class="od-welcome-start--alpha" aria-hidden="true">{t('welcome.alpha')}</span></h1>
    <p>{t('welcome.headline')}</p>
  </div>

  <nav class="od-welcome-start--choices" aria-label={t('welcome.choicesLabel')}>
    <a href="/welcome/sign-in" class="od-welcome-start--choice od-welcome-start--filled" onclick={(e) => go(e, '/welcome/sign-in')}>
      <span class="od-welcome-start--text">
        <span class="od-welcome-start--label">{t('welcome.existingShort')}</span>
        <span class="od-welcome-start--consequence">{t('welcome.existingNote')}</span>
      </span>
      <span class="od-welcome-start--chevron"><Icon name="expand" size={16} /></span>
    </a>
    <a href="/welcome/create" class="od-welcome-start--choice" onclick={(e) => go(e, '/welcome/create')}>
      <span class="od-welcome-start--text">
        <span class="od-welcome-start--label">{t('welcome.createShort')}</span>
        <span class="od-welcome-start--consequence">{t('welcome.createNote')}</span>
      </span>
      <span class="od-welcome-start--chevron"><Icon name="expand" size={16} /></span>
    </a>
    <a href="#no-account" class="od-welcome-start--choice external" onclick={withoutAccount}>
      <span class="od-welcome-start--text">
        <span class="od-welcome-start--label">{t('welcome.noAccount')}</span>
        <span class="od-welcome-start--consequence">{t(layout.phone ? 'welcome.noAccountNotePhone' : 'welcome.noAccountNoteTablet')}</span>
      </span>
      <span class="od-welcome-start--chevron"><Icon name="expand" size={16} /></span>
    </a>
  </nav>

  <a href="/welcome/git" class="od-welcome-start--own-git" onclick={(e) => go(e, '/welcome/git')}>
    <Icon name="git" size={20} />
    <span>{t('welcome.ownGit')}</span>
  </a>
  <WelcomeHelpLink />
  {/if}
</Page>

<style>
  @layer od.components {
    :global(.od-welcome-start) {
      --od-welcome-ground: var(--od-surface-2);

      :global(.ios) & {
        --f7-page-bg-color: var(--od-surface);
        --od-welcome-ground: var(--od-background);
      }

      :global(.page-content) {
        padding-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      }
    }

    /* Android (android-accueil-c.dc.html): the page fills the screen, the choices at the bottom. */
    .od-welcome-start--page {
      box-sizing: border-box;
      min-height: calc(100% - var(--f7-safe-area-bottom) - 24px);
      padding-top: calc(var(--f7-safe-area-top) + 24px);
      display: flex;
      flex-direction: column;
    }

    /* The wrappers only matter on tablets. */
    .od-welcome-start--head,
    .od-welcome-start--actions {
      display: contents;
    }

    .od-welcome-start--brand {
      margin: 0 24px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 20px;
      line-height: 28px;
      font-weight: 500;
      letter-spacing: 0.2px;
    }

    .od-welcome-start--logo {
      display: block;
    }

    /* « Alpha » after the name (tasks 2026-11-16-225 and 229): capitals, 14 sp, bold, a full pill 8 dp after the name. */
    .od-welcome-start--name {
      white-space: nowrap;
    }

    .od-welcome-start--alpha {
      display: inline-block;
      margin-left: 8px;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--od-alpha-badge);
      color: var(--od-on-alpha-badge);
      font-size: 14px;
      line-height: 18px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      white-space: nowrap;
      vertical-align: middle;
    }

    .od-welcome-start--dark,
    :global(html.dark) .od-welcome-start--light {
      display: none;
    }

    :global(html.dark) .od-welcome-start--dark {
      display: block;
    }

    .od-welcome-start--headline {
      margin: 72px 24px 0;
      font-size: 40px;
      line-height: 48px;
      font-weight: 400;
      letter-spacing: -0.5px;
      white-space: pre-line;
    }

    :global(.od-welcome-start--wide-profile) {
      height: 190px;
      margin-top: 28px;
    }

    .od-welcome-start--space {
      flex: 1;
      min-height: 24px;
    }

    .od-welcome-start--buttons {
      box-sizing: border-box;
      width: 100%;
      max-width: 560px;
      margin: 0 auto;
      padding: 0 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .od-welcome-start--option {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .od-welcome-start--pill {
      box-sizing: border-box;
      height: 56px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 500;
      letter-spacing: 0.1px;
      text-decoration: none;
      color: var(--od-text);
    }

    .od-welcome-start--pill-filled {
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
    }

    .od-welcome-start--pill-outlined {
      border: var(--od-outline-width) solid var(--od-chip-outline);
    }

    .od-welcome-start--pill-tonal {
      background: var(--od-idle-container);
    }

    /* Between the three choices and the git link: 260 dp on phones, 200 dp on tablets. */
    .od-welcome-start--divider {
      flex: none;
      width: 260px;
      max-width: calc(100% - 48px);
      height: 1px;
      margin: 0 auto 4px;
      background: var(--od-surface-container-highest);

      @media (min-width: 768px) {
        width: 200px;
      }
    }

    .od-welcome-start--note {
      margin: 0 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      text-align: center;
    }

    .od-welcome-start--git-link {
      margin: 0 auto;
      min-height: 48px;
      display: flex;
      align-items: center;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
      text-decoration: underline;
    }

    /* A low phone window: every choice stays in view (to-do #31). */
    @media (max-width: 767.98px) and (max-height: 820px) {
      .od-welcome-start--headline {
        margin-top: 16px;
      }

      :global(.od-welcome-start--wide-profile) {
        height: 56px;
        margin-top: 12px;
      }

      .od-welcome-start--buttons {
        gap: 8px;
      }
    }

    /* Tablet (width from 768 px; mock-ups android-tablette-premier-lancement-*.dc.html): no scrolling. */
    @media (min-width: 768px) {
      .od-welcome-start--page {
        height: calc(100% - var(--f7-safe-area-bottom) - 24px);
        min-height: 0;
      }

      .od-welcome-start--head {
        display: block;
      }

      .od-welcome-start--brand,
      .od-welcome-start--headline {
        margin-left: 0;
        margin-right: 0;
      }

      /* A larger brand row (task 2026-11-15-210): logo 96 dp, « OpenDives » 48 sp; the rest does not move. */
      .od-welcome-start--brand {
        gap: 20px;
        font-size: 48px;
        line-height: 56px;
        letter-spacing: -0.5px;
      }

      .od-welcome-start--logo {
        width: 96px;
        height: 96px;
      }

      .od-welcome-start--actions {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        width: 440px;
        justify-content: center;
      }

      .od-welcome-start--buttons {
        max-width: none;
        padding: 0 0 12px;
      }

      .od-welcome-start--space {
        display: none;
      }

      /* Landscape: heading and profile on the left, choices on the right. */
      @media (orientation: landscape) {
        .od-welcome-start--page {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 440px;
          grid-template-rows: auto minmax(0, 1fr);
          column-gap: 56px;
          padding-right: 56px;
        }

        .od-welcome-start--head {
          grid-column: 1;
          grid-row: 1;
          margin: 34px 0 0 56px;
        }

        .od-welcome-start--page :global(.od-welcome-start--wide-profile) {
          grid-column: 1;
          grid-row: 2;
          align-self: end;
          /* Off the screen edges (task 2026-11-15-211): the heading's 56 dp inset on the left, the column gap
             before the choices, 56 dp above the bottom edge. */
          box-sizing: border-box;
          width: calc(100% - 56px);
          height: min(230px, calc(100% - 56px));
          margin: 0 0 56px 56px;
        }

        .od-welcome-start--actions {
          grid-column: 2;
          grid-row: 1 / span 2;
          align-self: center;
        }
      }

      /* Portrait: a centred heading, the profile across the width, the choices centred in what is left. */
      @media (orientation: portrait) {
        .od-welcome-start--head {
          box-sizing: border-box;
          width: 100%;
          max-width: 520px;
          margin: 48px auto 0;
        }

        .od-welcome-start--headline {
          margin-top: 48px;
        }

        .od-welcome-start--page :global(.od-welcome-start--wide-profile) {
          flex: none;
          /* The heading column's width, centred: its left edge lines up with the logo (task 2026-11-15-211). */
          width: 100%;
          max-width: 520px;
          height: 260px;
          margin: 32px auto 0;
        }

        .od-welcome-start--actions {
          flex: 1;
          min-height: 0;
          align-self: center;
          max-width: 100%;
        }
      }
    }

    .od-welcome-start--profile {
      display: block;
      width: 100%;
      height: calc(var(--f7-safe-area-top) + 196px);

      /* A low window (tablet in landscape): every choice stays in view. */
      @media (max-height: 820px) {
        height: calc(var(--f7-safe-area-top) + 96px);
      }
    }

    .od-welcome-start--ground {
      fill: var(--od-welcome-ground);
    }

    .od-welcome-start--water-top {
      stop-color: var(--od-water-top);
    }

    .od-welcome-start--water-bottom {
      stop-color: var(--od-water-bottom);
    }

    .od-welcome-start--water {
      fill: url(#od-welcome-water);
    }

    .od-welcome-start--trace {
      fill: none;
      stroke: var(--od-trace);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }

    .od-welcome-start--heading {
      padding: 20px 24px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;

      h1 {
        margin: 0;
        font-size: 32px;
        line-height: 40px;
        font-weight: 400;
      }

      p {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        letter-spacing: 0.5px;
        color: var(--od-text-2);
      }

      :global(.ios) & {
        padding-top: 24px;

        h1 {
          font-size: 34px;
          line-height: 41px;
          font-weight: 700;
        }

        p {
          font-size: 17px;
          letter-spacing: 0;
        }
      }
    }

    /* Android: three cards, the first filled, the others outlined. */
    .od-welcome-start--choices {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .od-welcome-start--choice {
      padding: 16px;
      border-radius: 12px;
      border: 1px solid var(--od-separator);
      color: var(--od-text);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 12px;

      &.od-welcome-start--filled {
        border-color: transparent;
        background: var(--od-surface-2);

        .od-welcome-start--consequence {
          color: var(--od-text);
        }
      }
    }

    .od-welcome-start--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .od-welcome-start--label {
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
      letter-spacing: 0.15px;
    }

    .od-welcome-start--consequence {
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--od-text-2);
    }

    .od-welcome-start--chevron {
      display: none;
    }

    /* Under the three cards: a text link with the git icon. */
    .od-welcome-start--own-git {
      margin: 8px 16px 0;
      min-height: 48px;
      padding: 0 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      color: var(--od-text);
      text-decoration: none;

      :global(.ios) & {
        font-size: 17px;
        font-weight: 400;
      }
    }

    /* iOS: an inset grouped list, a chevron on each row. */
    :global(.ios) .od-welcome-start--choices {
      margin-top: 20px;
      gap: 0;
      border-radius: 12px;
      overflow: hidden;
      background: var(--od-background);

      .od-welcome-start--choice {
        padding: 12px 16px;
        border: none;
        border-radius: 0;
        background: none;

        & + .od-welcome-start--choice {
          box-shadow: inset 0 0.5px 0 var(--od-separator);
        }
      }

      .od-welcome-start--text {
        gap: 3px;
      }

      .od-welcome-start--label {
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0;
      }

      .od-welcome-start--consequence {
        font-size: 13px;
        line-height: 18px;
        letter-spacing: 0;
        color: var(--od-text-2);
      }

      .od-welcome-start--chevron {
        display: flex;
        flex: none;
        color: var(--od-text-2);
        /* "expand" points down: a quarter turn makes the iOS chevron. */
        transform: rotate(-90deg);
      }
    }
  }
</style>
