<script>
  // @ts-check
  // First launch (spec, section 4, "First launch, redesigned"; Android:
  // docs/mockups/android-accueil-c.dc.html, iPhone: ios-accueil.dc.html): three
  // ways to start, each with its consequence. Android: the logo, a large title,
  // a dive profile, then three pill buttons of decreasing weight at the bottom: filled,
  // outlined, tonal (task 2026-11-14-123), and under a thin divider the git link.
  // iOS: an inset grouped list with chevrons.
  import { onMount } from 'svelte';
  import { Page, theme, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import WelcomeHelpLink from '../components/WelcomeHelpLink.svelte';
  import DesktopLanguageMenu from '../components/DesktopLanguageMenu.svelte';
  import FirstLaunchBand from '../components/FirstLaunchBand.svelte';
  import FirstLaunchPanel from '../components/FirstLaunchPanel.svelte';
  import { logbook, startWithoutAccount, importFile } from '../lib/logbook.svelte.js';
  import { offerUndo } from '../lib/undo.js';
  import { importErrorKey } from '../lib/deep-link.js';
  import { droppedFiles, startWithDrop } from '../lib/desktop-first-launch.js';
  import { deviceSuffix } from '../lib/first-launch.js';
  import { t } from '../lib/i18n.js';
  import { layout, desktopApp, deviceKind } from '../lib/layout.svelte.js';
  import { decorativeProfilePath } from '../lib/smooth-path.js';

  // The tablet's panel plays its profile animation each time the screen is shown (task 2026-11-16-237).
  let playKey = $state(0);
  /** The phone's blue band: never in the desktop app, whose window can be a few pixels under 768 dp (task 2026-11-16-242). */
  const band = $derived(layout.phone && !desktopApp);
  const panel = $derived(!theme.ios && !band);
  /** This screen is the one on show (a step above it hides it), for the desktop's drop. */
  let shown = $state(false);
  /** A file is being dragged over the window (desktop). */
  let dragging = $state(false);

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

  // Desktop (task 2026-11-16-242): a file dropped on the window starts the logbook of this computer and imports it.
  onMount(() => {
    if (!desktopApp) return;
    /** @param {DragEvent} e */
    const over = (e) => {
      if (!(shown && logbook.welcome && e.dataTransfer?.types?.includes('Files'))) return;
      e.preventDefault();
      dragging = true;
    };
    const leave = (/** @type {DragEvent} */ e) => {
      if (!e.relatedTarget) dragging = false;
    };
    /** @param {DragEvent} e */
    const drop = async (e) => {
      if (!shown || !logbook.welcome) return;
      dragging = false;
      const files = droppedFiles(e.dataTransfer);
      if (!files.length) return;
      // The logbook's own drop (pages/DesktopLogbook.svelte) must not take it as well.
      e.preventDefault();
      e.stopImmediatePropagation();
      const result = await startWithDrop(files, { start: startWithoutAccount, importFile });
      if (result.error && !result.added) {
        f7.dialog.create({ title: t('logbook.importTitle'), text: t(importErrorKey(result.error)), buttons: [{ text: t('dialog.ok') }] }).open();
      } else {
        offerUndo(t('logbook.imported', { n: result.added }));
      }
    };
    window.addEventListener('dragover', over, true);
    window.addEventListener('dragleave', leave, true);
    window.addEventListener('drop', drop, true);
    return () => {
      window.removeEventListener('dragover', over, true);
      window.removeEventListener('dragleave', leave, true);
      window.removeEventListener('drop', drop, true);
    };
  });

  function withoutAccount(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    // Android phone (task 2026-11-16-233): a screen says where the logbook stays before it is created.
    if (!theme.ios) f7router.navigate('/welcome/local');
    else startWithoutAccount();
  }
</script>

<Page
  class="bc-welcome-start{panel ? ' bc-first-panelled' : ''}{!theme.ios && band ? ' bc-welcome-start--phone' : ''}"
  onPageBeforeIn={() => {
    playKey++;
    shown = true;
  }}
  onPageBeforeOut={() => (shown = false)}
>
  {#if !theme.ios}
    <div class="bc-welcome-start--page" class:bc-welcome-start--with-band={band} class:bc-welcome-start--with-panel={panel}>
      {#if band}
        <!-- Android phone (tasks 2026-11-16-233 to 236): the blue band replaces the brand row, the headline and the profile. -->
        <FirstLaunchBand variant="welcome" />
      {:else}
        <!-- Android tablet (task 2026-11-16-237): a blue panel with the profile animation, the choices beside it or below. -->
        <FirstLaunchPanel {playKey} />
      {/if}
      <div class="bc-welcome-start--space"></div>
      <div class="bc-welcome-start--actions">
      {#if panel}<h2 class="bc-welcome-start--start">{t('firstLaunch.tabletStart')}</h2>{/if}
      <nav class="bc-welcome-start--buttons" aria-label={t('welcome.choicesLabel')}>
        <div class="bc-welcome-start--option">
          <a href="/welcome/sign-in" class="bc-welcome-start--pill bc-welcome-start--pill-filled" onclick={(e) => go(e, '/welcome/sign-in')}>{t('welcome.existingShort')}</a>
          <p class="bc-welcome-start--note">{t('welcome.existingNote')}</p>
        </div>
        <div class="bc-welcome-start--option">
          <a href="/welcome/create" class="bc-welcome-start--pill bc-welcome-start--pill-outlined" onclick={(e) => go(e, '/welcome/create')}>{t('welcome.createShort')}</a>
          <p class="bc-welcome-start--note">{t('welcome.createNote')}</p>
        </div>
        <div class="bc-welcome-start--option">
          <a href="#no-account" class="bc-welcome-start--pill bc-welcome-start--pill-tonal external" onclick={withoutAccount}>{t('welcome.noAccount')}</a>
          <p class="bc-welcome-start--note">{t(`welcome.noAccountNote${deviceSuffix(deviceKind())}`)}</p>
        </div>
      </nav>
      <div class="bc-welcome-start--divider" role="presentation"></div>
      <a href="/welcome/git" class="bc-welcome-start--git-link" onclick={(e) => go(e, '/welcome/git')}>{t('welcome.ownGit')}</a>
      {#if desktopApp}
        <p class="bc-welcome-start--drop" class:bc-welcome-start--dragging={dragging}>{dragging ? t('desktopLogbooks.start.dropHere') : t('desktopLogbooks.start.drop')}</p>
      {/if}
      </div>
      <!-- Phone (android-accueil-c.dc.html): 12 dp under the git link, 20 dp above the bottom edge. Tablet: pinned 28 dp from the edge. -->
      {#if desktopApp}
        <!-- Desktop (task 2026-11-16-246): the help link, a divider and the language menu on one centred line. -->
        <div class="bc-welcome-start--footer"><WelcomeHelpLink inline /><DesktopLanguageMenu /></div>
      {:else}
        <WelcomeHelpLink />
      {/if}
    </div>
  {:else}
  <svg class="bc-welcome-start--profile" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="od-welcome-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="bc-welcome-start--water-top"></stop>
        <stop offset="1" class="bc-welcome-start--water-bottom"></stop>
      </linearGradient>
    </defs>
    <rect class="bc-welcome-start--ground" x="0" y="0" width={WIDTH} height={HEIGHT}></rect>
    <path class="bc-welcome-start--water" d={area}></path>
    <path class="bc-welcome-start--trace" d={line}></path>
  </svg>

  <div class="bc-welcome-start--heading">
    <h1 aria-label={t('welcome.brandAlpha')}><span aria-hidden="true">{t('welcome.title')}</span><span class="bc-welcome-start--alpha" aria-hidden="true">{t('welcome.alpha')}</span></h1>
    <p>{t('welcome.headline')}</p>
  </div>

  <nav class="bc-welcome-start--choices" aria-label={t('welcome.choicesLabel')}>
    <a href="/welcome/sign-in" class="bc-welcome-start--choice bc-welcome-start--filled" onclick={(e) => go(e, '/welcome/sign-in')}>
      <span class="bc-welcome-start--text">
        <span class="bc-welcome-start--label">{t('welcome.existingShort')}</span>
        <span class="bc-welcome-start--consequence">{t('welcome.existingNote')}</span>
      </span>
      <span class="bc-welcome-start--chevron"><Icon name="expand" size={16} /></span>
    </a>
    <a href="/welcome/create" class="bc-welcome-start--choice" onclick={(e) => go(e, '/welcome/create')}>
      <span class="bc-welcome-start--text">
        <span class="bc-welcome-start--label">{t('welcome.createShort')}</span>
        <span class="bc-welcome-start--consequence">{t('welcome.createNote')}</span>
      </span>
      <span class="bc-welcome-start--chevron"><Icon name="expand" size={16} /></span>
    </a>
    <a href="#no-account" class="bc-welcome-start--choice external" onclick={withoutAccount}>
      <span class="bc-welcome-start--text">
        <span class="bc-welcome-start--label">{t('welcome.noAccount')}</span>
        <span class="bc-welcome-start--consequence">{t(`welcome.noAccountNote${deviceSuffix(deviceKind())}`)}</span>
      </span>
      <span class="bc-welcome-start--chevron"><Icon name="expand" size={16} /></span>
    </a>
  </nav>

  <a href="/welcome/git" class="bc-welcome-start--own-git" onclick={(e) => go(e, '/welcome/git')}>
    <Icon name="git" size={20} />
    <span>{t('welcome.ownGit')}</span>
  </a>
  <WelcomeHelpLink />
  {/if}
</Page>

<style>
  @layer od.components {
    :global(.bc-welcome-start) {
      --bc-welcome-ground: var(--bc-surface-2);

      :global(.ios) & {
        --f7-page-bg-color: var(--bc-surface);
        --bc-welcome-ground: var(--bc-background);
      }

      :global(.page-content) {
        padding-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      }
    }

    /* Android (android-accueil-c.dc.html): the page fills the screen, the choices at the bottom. */
    .bc-welcome-start--page {
      box-sizing: border-box;
      min-height: calc(100% - var(--f7-safe-area-bottom) - 24px);
      padding-top: calc(var(--f7-safe-area-top) + 24px);
      display: flex;
      flex-direction: column;

      /* Phone: the band starts at the top edge, under the status bar. */
      &.bc-welcome-start--with-band {
        padding-top: 0;
      }
    }

    /* Android phone: the help link ends the page, 20 dp above the bottom edge (set by the link), so the page takes
       the whole height and the content has no bottom padding of its own. */
    :global(.bc-welcome-start--phone) {
      --bc-help-link-bottom: 20px;

      :global(.page-content) {
        padding-bottom: 0;
      }

      .bc-welcome-start--page {
        min-height: 100%;
      }
    }

    /* The wrapper only matters on tablets. */
    .bc-welcome-start--actions {
      display: contents;
    }

    /* The desktop app: the help link and the language menu share one line, 24 dp from the bottom, centred under the
       choices (the same centre as the help link alone had). */
    :global(html.bc-desktop-app) .bc-welcome-start--footer {
      position: absolute;
      left: var(--bc-help-link-left, 50%);
      bottom: 24px;
      z-index: 2;
      transform: translateX(-50%);
      width: max-content;
      /* Never wider than the choices' column (the window minus the blue panel): in a narrow window the link and the
         language menu stack. */
      max-width: calc(100% - min(700px, 48.6%) - 8px);
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 0 8px;

      /* A narrow window: the link and the menu keep one line. */
      @media (max-width: 900px) {
        gap: 0 2px;

        :global(.bc-welcome-help-link),
        :global(.bc-desktop-language) {
          padding-inline: 8px;
        }
      }

      /* A low window: a step may scroll under the line, which then keeps its own ground. */
      @media (max-height: 700px) {
        background: var(--bc-background);
      }
    }

    /* « Alpha » after the name (tasks 2026-11-16-225 and 229): capitals, 14 sp, bold, a full pill 8 dp after the name. */
    .bc-welcome-start--alpha {
      display: inline-block;
      margin-left: 8px;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--bc-alpha-badge);
      color: var(--bc-on-alpha-badge);
      font-size: 14px;
      line-height: 18px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      white-space: nowrap;
      vertical-align: middle;
    }

    .bc-welcome-start--space {
      flex: 1;
      min-height: 24px;
    }

    .bc-welcome-start--buttons {
      box-sizing: border-box;
      width: 100%;
      max-width: 560px;
      margin: 0 auto;
      padding: 0 24px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .bc-welcome-start--option {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .bc-welcome-start--pill {
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
      color: var(--bc-text);
    }

    .bc-welcome-start--pill-filled {
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
    }

    .bc-welcome-start--pill-outlined {
      border: var(--bc-outline-width) solid var(--bc-chip-outline);
    }

    .bc-welcome-start--pill-tonal {
      background: var(--bc-idle-container);
    }

    /* Between the three choices and the git link: 260 dp on phones, 200 dp on tablets. */
    .bc-welcome-start--divider {
      flex: none;
      width: 260px;
      max-width: calc(100% - 48px);
      height: 1px;
      margin: 0 auto 4px;
      background: var(--bc-surface-container-highest);

      @media (min-width: 768px) {
        width: 200px;
      }
    }

    .bc-welcome-start--note {
      margin: 0 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
      text-align: center;
    }

    .bc-welcome-start--git-link {
      margin: 0 auto;
      min-height: 48px;
      display: flex;
      align-items: center;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
      text-decoration: underline;
    }

    /* Phone: the link is 18 dp of text with 6 dp of touch padding, 12 dp (6 + 6) above the help link. */
    :global(.bc-welcome-start--phone) .bc-welcome-start--git-link {
      min-height: 0;
      padding: 6px 12px;
      margin-bottom: 6px;
    }

    /* A low phone window: every choice stays in view (to-do #31). */
    @media (max-width: 767.98px) and (max-height: 820px) {
      .bc-welcome-start--buttons {
        gap: 8px;
      }
    }

    /* Tablet (width from 768 px; task 2026-11-16-237, mock-ups android-tablette-premier-lancement-*.dc.html):
       the blue panel (components/FirstLaunchPanel.svelte) and the choices, no scrolling. The panel reaches
       the screen edges: the page's bottom padding is taken back. */
    .bc-welcome-start--with-panel {
      --bc-first-panel-bottom: calc(var(--f7-safe-area-bottom) + 24px);
      height: calc(100% + var(--bc-first-panel-bottom));
      min-height: 0;
      padding-top: 0;
      margin-bottom: calc(-1 * var(--bc-first-panel-bottom));
      flex-direction: row;

      @media (orientation: portrait) {
        flex-direction: column;
      }

      .bc-welcome-start--space {
        display: none;
      }

      .bc-welcome-start--actions {
        box-sizing: border-box;
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 24px 64px 56px;
      }

      @media (orientation: portrait) {
        .bc-welcome-start--actions {
          padding: 0 120px 64px;
        }
      }

      .bc-welcome-start--start {
        margin: 0 0 20px;
        font-size: 28px;
        line-height: 36px;
        font-weight: 500;
        letter-spacing: -0.2px;
      }

      .bc-welcome-start--buttons {
        max-width: none;
        padding: 0;
      }

      .bc-welcome-start--divider {
        width: auto;
        max-width: none;
        margin: 20px 48px 16px;
      }

      .bc-welcome-start--git-link {
        cursor: pointer;

        @media (hover: hover) {
          &:hover {
            color: var(--bc-text);
          }
        }
      }

      .bc-welcome-start--pill {
        cursor: pointer;
      }

      /* « Vous pouvez aussi déposer un fichier carnet sur cette fenêtre. » (desktop). */
      .bc-welcome-start--drop {
        margin: 12px 0 0;
        font-size: 14px;
        line-height: 20px;
        color: var(--bc-text-2);

        &.bc-welcome-start--dragging {
          color: var(--bc-action);
          font-weight: 600;
        }
      }
    }

    /* The desktop app (task 2026-11-16-242): always the panel on the left and the choices beside it, in a window of
       any shape; the column keeps its room in a narrow window. */
    :global(html.bc-desktop-app) .bc-welcome-start--with-panel {
      flex-direction: row;

      .bc-welcome-start--actions {
        padding: 24px clamp(24px, 4.4vw, 64px) 56px;
      }
    }

    .bc-welcome-start--profile {
      display: block;
      width: 100%;
      height: calc(var(--f7-safe-area-top) + 196px);

      /* A low window (tablet in landscape): every choice stays in view. */
      @media (max-height: 820px) {
        height: calc(var(--f7-safe-area-top) + 96px);
      }
    }

    .bc-welcome-start--ground {
      fill: var(--bc-welcome-ground);
    }

    .bc-welcome-start--water-top {
      stop-color: var(--bc-water-top);
    }

    .bc-welcome-start--water-bottom {
      stop-color: var(--bc-water-bottom);
    }

    .bc-welcome-start--water {
      fill: url(#od-welcome-water);
    }

    .bc-welcome-start--trace {
      fill: none;
      stroke: var(--bc-trace);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }

    .bc-welcome-start--heading {
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
        color: var(--bc-text-2);
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
    .bc-welcome-start--choices {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-welcome-start--choice {
      padding: 16px;
      border-radius: 12px;
      border: 1px solid var(--bc-separator);
      color: var(--bc-text);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 12px;

      &.bc-welcome-start--filled {
        border-color: transparent;
        background: var(--bc-surface-2);

        .bc-welcome-start--consequence {
          color: var(--bc-text);
        }
      }
    }

    .bc-welcome-start--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bc-welcome-start--label {
      font-size: 16px;
      line-height: 24px;
      font-weight: 500;
      letter-spacing: 0.15px;
    }

    .bc-welcome-start--consequence {
      font-size: 14px;
      line-height: 20px;
      letter-spacing: 0.25px;
      color: var(--bc-text-2);
    }

    .bc-welcome-start--chevron {
      display: none;
    }

    /* Under the three cards: a text link with the git icon. */
    .bc-welcome-start--own-git {
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
      color: var(--bc-text);
      text-decoration: none;

      :global(.ios) & {
        font-size: 17px;
        font-weight: 400;
      }
    }

    /* iOS: an inset grouped list, a chevron on each row. */
    :global(.ios) .bc-welcome-start--choices {
      margin-top: 20px;
      gap: 0;
      border-radius: 12px;
      overflow: hidden;
      background: var(--bc-background);

      .bc-welcome-start--choice {
        padding: 12px 16px;
        border: none;
        border-radius: 0;
        background: none;

        & + .bc-welcome-start--choice {
          box-shadow: inset 0 0.5px 0 var(--bc-separator);
        }
      }

      .bc-welcome-start--text {
        gap: 3px;
      }

      .bc-welcome-start--label {
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0;
      }

      .bc-welcome-start--consequence {
        font-size: 13px;
        line-height: 18px;
        letter-spacing: 0;
        color: var(--bc-text-2);
      }

      .bc-welcome-start--chevron {
        display: flex;
        flex: none;
        color: var(--bc-text-2);
        /* "expand" points down: a quarter turn makes the iOS chevron. */
        transform: rotate(-90deg);
      }
    }
  }
</style>
