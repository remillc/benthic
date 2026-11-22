<script>
  // @ts-check
  // Editorial layout of the account flow (docs/system-design.md, section 8,
  // "Editorial pages"; docs/mockups/compte-*-android.dc.html,
  // git-config-*-android.dc.html, android-tablette-compte-*.dc.html,
  // android-tablette-depot-git-*.dc.html).
  // Android: a bar with ✕ (or ←) only; an eyebrow naming the flow and the
  // step, a large title ending with a full stop, the introduction; the
  // content in a white card; the decorative profile; the main action as a
  // full-width pill, a text button beside it for a secondary action. Phone:
  // the profile and the actions at the bottom of the screen. Tablet: the
  // actions end the card, the profile lies at the bottom of the area behind
  // the content; in landscape the heading is on the left and the card in a
  // column on the right, in portrait both in one centred column.
  // iPhone (compte-*-ios.dc.html, ios-compte-import.dc.html): the same
  // layout with iOS conventions: "Annuler" or "‹ Retour" in a transparent bar
  // without a title, the eyebrow, the title and the introduction, the
  // content in inset grouped sections (drawn by each page), the profile, then
  // the main action as a capsule, a secondary one plain under it or grey
  // beside it.
  // While a request runs (busy), the button is disabled with a spinner and its
  // busy label, and on Android a linear progress indicator runs under the bar.
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import LoadingIndicator from './LoadingIndicator.svelte';
  import LinearWavyProgress from './LinearWavyProgress.svelte';
  import DecorativeProfile from './DecorativeProfile.svelte';
  import WelcomeHelpLink from './WelcomeHelpLink.svelte';
  import FirstLaunchBand from './FirstLaunchBand.svelte';
  import FirstLaunchPanel from './FirstLaunchPanel.svelte';
  import { layout, desktopApp } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   title: string,
   *   step?: string,
   *   heading: string,
   *   intro: string,
   *   action?: string,
   *   busyLabel?: string,
   *   busy?: boolean,
   *   actionDisabled?: boolean,
   *   onaction?: () => void,
   *   secondary?: { label: string, onclick: () => void, disabled?: boolean },
   *   secondaryEnd?: boolean,
   *   previous?: boolean,
   *   closable?: boolean,
   *   back?: boolean,
   *   helpLink?: boolean,
   *   firstLaunch?: boolean,
   *   noRetour?: boolean,
   *   onback?: () => void,
   *   children: import('svelte').Snippet,
   *   class?: string,
   * }}
   * title: the flow, shown in the eyebrow with the step. No
   * action: no main button. secondaryEnd: the text button sits after the
   * main button (iOS: under it). firstLaunch: on an Android phone, the layout of the alpha first launch (tasks
   * 2026-11-16-233 and 236): the blue band, « Retour », the title and the fields on the page, full-width buttons;
   * noRetour: without the « Retour » link (the download). onback: « Retour » is a button that calls it instead of
   * leaving the page (task 2026-11-16-257: the git help replaces the form in the same column). closable false: no close button (an import
   * that runs). back: ← (iOS: "‹ Retour") instead of ✕ (iOS: "Annuler").
   * previous: the text button is "Précédent" (iOS: a grey capsule beside the
   * main one). helpLink: « Une question ? À propos et contact » under the content (first launch).
   */
  let {
    title,
    step = '',
    heading,
    intro,
    action = '',
    busyLabel = '',
    busy = false,
    actionDisabled = false,
    onaction = () => {},
    secondary,
    secondaryEnd = false,
    previous = false,
    closable = true,
    back = false,
    helpLink = false,
    firstLaunch = false,
    noRetour = false,
    onback,
    children,
    class: extraClass = '',
  } = $props();

  const ios = f7.theme === 'ios';

  /** "Nouveau compte · étape 2 sur 2": the flow, then the step. */
  const eyebrow = $derived(step ? `${title} · ${step.charAt(0).toLocaleLowerCase()}${step.slice(1)}` : title);
  /** The title ends with a full stop, unless it is a question. */
  const shownHeading = $derived(/[.?!…]$/.test(heading) ? heading : `${heading}.`);
  /** Tablet (Android): the actions are the last element of the card. */
  /** A phone layout; never the desktop app's, which is at least 768 dp wide and takes the tablet's screens (task 2026-11-16-242). */
  const phone = $derived(layout.phone && !desktopApp);
  const actionsInCard = $derived(!ios && !phone);
  /** The alpha first launch on an Android phone (task 2026-11-16-233). */
  const band = $derived(firstLaunch && !ios && phone);
  /** The alpha first launch on an Android tablet (task 2026-11-16-239): the blue panel of task 237, still, and the step beside it. */
  const panel = $derived(firstLaunch && !ios && !phone);
  /** Both give the step the compact layout: « Retour », title, content on the page, no card. */
  const compact = $derived(band || panel);

  /** The step's column on a tablet: it scrolls, and starts at the top again when the heading changes. @type {HTMLFormElement|undefined} */
  let panelBody = $state();
  $effect(() => {
    heading;
    if (panelBody) panelBody.scrollTop = 0;
  });
</script>

{#snippet actions()}
  <div class="bc-editorial-page--actions" class:bc-editorial-page--end={secondaryEnd} class:bc-editorial-page--previous={previous}>
    {#if secondary}
      <button
        type="button"
        class="bc-text-button bc-editorial-page--secondary"
        disabled={secondary.disabled ?? busy}
        onclick={secondary.onclick}>{secondary.label}</button
      >
    {/if}
    {#if action}
      <button type="submit" class="bc-editorial-page--filled" disabled={actionDisabled || busy} aria-busy={busy}>
        {#if busy}{#if ios}<span class="bc-editorial-page--spinner" aria-hidden="true"></span>{:else}<LoadingIndicator size={18} label="" />{/if}{busyLabel || action}{:else}{action}{/if}
      </button>
    {/if}
  </div>
{/snippet}

<Page class="bc-editorial-page {extraClass} {compact ? 'bc-editorial-page--first-launch' : ''} {panel ? 'bc-editorial-page--panelled bc-first-panelled' : ''}">
  {#if band}
    <FirstLaunchBand />
  {:else if panel}
    <FirstLaunchPanel still />
  {:else}
  <Navbar class="bc-editorial-page--bar">
    {#snippet left()}
      {#if !closable}
        <span></span>
      {:else if ios && back}
        <Link back>
          <i class="icon icon-back"></i>
          <span>{t('accountStep.back')}</span>
        </Link>
      {:else if ios}
        <Link back>{t('accountStep.cancel')}</Link>
      {:else}
        <Link back iconOnly>
          <Icon name={back ? 'arrowBack' : 'close'} />
          <span class="bc-sr-only">{back ? t('accountStep.back') : t('accountStep.close')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>
  {/if}

  {#if busy && !ios}
    <div class="bc-editorial-page--linear" class:bc-editorial-page--linear-band={band} class:bc-editorial-page--linear-panel={panel}><LinearWavyProgress indeterminate label={busyLabel || action} /></div>
  {/if}

  <form
    class="bc-editorial-page--body"
    class:bc-editorial-page--band-body={band}
    class:bc-editorial-page--panel-body={panel}
    bind:this={panelBody}
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      if (!actionDisabled && !busy) onaction();
    }}
  >
    {#if compact}
      <!-- Alpha first launch on a phone (task 2026-11-16-233; on a tablet, task 2026-11-16-239, beside the panel): « Retour », the title, the content on the page, full-width buttons. -->
      {#if !noRetour && onback}
        <button type="button" class="bc-editorial-page--retour" onclick={onback}>
          <Icon name="arrowBack" size={20} weight={2} />
          <span>{t('accountStep.back')}</span>
        </button>
      {:else if !noRetour}
        <Link back class="bc-editorial-page--retour">
          <Icon name="arrowBack" size={20} weight={2} />
          <span>{t('accountStep.back')}</span>
        </Link>
      {/if}
      <div class="bc-editorial-page--heading">
        {#if step}<p class="bc-editorial-page--eyebrow">{eyebrow}</p>{/if}
        <h1 class="bc-editorial-page--title">{heading}</h1>
        {#if intro}<p class="bc-editorial-page--intro">{intro}</p>{/if}
      </div>
      <div class="bc-editorial-page--card">{@render children()}</div>
      {#if action || secondary}{@render actions()}{/if}
      {#if panel}
        <!-- The About link ends the column: at its foot when the step is short, after the content when it scrolls (task 2026-11-16-257). -->
        <div class="bc-editorial-page--spacer"></div>
        {#if helpLink}<WelcomeHelpLink inColumn />{/if}
      {/if}
    {:else}
    <div class="bc-editorial-page--heading">
      <p class="bc-editorial-page--eyebrow">{eyebrow}</p>
      <h1 class="bc-editorial-page--title">{shownHeading}</h1>
      <p class="bc-editorial-page--intro">{intro}</p>
    </div>

    <div class="bc-editorial-page--card">
      {@render children()}
      {#if actionsInCard && (action || secondary)}{@render actions()}{/if}
    </div>

    <DecorativeProfile class="bc-editorial-page--profile" />

    {#if !actionsInCard && (action || secondary)}{@render actions()}{/if}
    {/if}
  </form>
  {#if helpLink && !panel}<WelcomeHelpLink />{/if}
</Page>

<style>
  /* Framework7 variables, outside the layers so that they win over Framework7's own. */
  :global(.bc-editorial-page) {
    --f7-page-bg-color: var(--bc-background);
  }

  /* The bar carries only ✕ or ← (iOS: "Annuler" or "‹ Retour"), on the page's own background. */
  :global(.bc-editorial-page--bar) {
    --f7-navbar-bg-color: transparent;
  }

  /* Tablet: ✕ lines up with the heading (its 48 dp target 12 dp before it). */
  @media (min-width: 768px) {
    :global(.md .bc-editorial-page--bar) {
      --f7-navbar-inner-padding-left: max(0px, calc((100% - 520px) / 2 - 12px));
    }
  }

  @media (min-width: 768px) and (orientation: landscape) {
    :global(.md .bc-editorial-page--bar) {
      --f7-navbar-inner-padding-left: 36px;
    }
  }

  @layer bc.components {
    /* No close button (an import that runs): no empty bar button either. */
    :global(.bc-editorial-page--bar .left:not(:has(a))) {
      display: none;
    }

    :global(.bc-editorial-page--bar .navbar-bg) {
      background: transparent;
    }

    :global(.bc-editorial-page--bar .navbar-bg::after) {
      display: none;
    }

    .bc-editorial-page--body {
      box-sizing: border-box;
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* 16 dp at the top: the 10 dp band of the busy indicator stays clear of the overline. */
    .bc-editorial-page--heading {
      padding: 16px 24px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;

      p {
        margin: 0;
        color: var(--bc-text-2);
      }
    }

    .bc-editorial-page--eyebrow {
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
    }

    .bc-editorial-page--title {
      margin: 0;
      font-size: 34px;
      line-height: 40px;
      font-weight: 400;
      letter-spacing: -0.4px;
    }

    .bc-editorial-page--intro {
      font-size: 16px;
      line-height: 24px;
    }

    /* The content in one white card. */
    .bc-editorial-page--card {
      --bc-field-margin: 0;
      margin: 24px 16px 0;
      padding: 20px 16px;
      border-radius: 28px;
      background: var(--bc-surface);

      /* Android: the first field starts at the top of the card. */
      :global(.md) & > :global(:first-child),
      :global(.md) & > :global(:first-child > .bc-text-field--field:first-child),
      :global(.md) & > :global(:first-child > .bc-select-field--field:first-child) {
        margin-top: 0;
      }
    }

    /* Phone: the profile and the actions at the bottom of the screen. */
    :global(.bc-editorial-page--profile) {
      flex: none;
      height: 130px;
      margin-top: auto;
      padding-top: 24px;
      box-sizing: content-box;
    }

    .bc-editorial-page--actions {
      padding: 16px 24px calc(var(--f7-safe-area-bottom) + 28px);
      display: flex;
      align-items: center;
      gap: 8px;

      &.bc-editorial-page--end {
        justify-content: flex-end;
      }
    }

    .bc-editorial-page--filled {
      flex: 1;
      min-width: 0;
      height: 56px;
      padding: 0 24px;
      border: none;
      border-radius: 28px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 16px;
      font-weight: 500;
      letter-spacing: 0.1px;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;

      /* MD3 disabled: on-surface at 12 % behind, 38 % (here 60 % with the spinner) in front. */
      &:disabled {
        background: color-mix(in srgb, var(--bc-text) 12%, transparent);
        color: color-mix(in srgb, var(--bc-text) 60%, transparent);

        /* Busy (« Connexion… ») is not disabled: its label in --bc-text-2, 6.4:1 (task 2026-11-14-153). */
        &[aria-busy='true'] {
          color: var(--bc-text-2);
        }
        cursor: default;
      }
    }

    .bc-editorial-page--secondary {
      flex: none;
    }

    /* MD3 Expressive wavy linear progress indicator, indeterminate, under the top bar, 16 dp
       from each side (compte-connexion-encours-android.dc.html, task 2026-11-14-130). */
    .bc-editorial-page--linear {
      position: absolute;
      z-index: 600;
      left: 16px;
      right: 16px;
      top: calc(var(--f7-safe-area-top) + var(--f7-navbar-height));
      height: 10px;
    }

    .bc-editorial-page--spinner {
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      box-sizing: border-box;
      animation: bc-spin 0.9s linear infinite;
    }

    @keyframes bc-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /*
     * Tablet (Android): the profile lies at the bottom of the area, behind the
     * content; the actions end the card. Portrait: one centred column of
     * 520 dp, the card under the heading.
     */
    @media (min-width: 768px) {
      :global(.md) .bc-editorial-page--body {
        position: relative;
        padding-bottom: 48px;
      }

      :global(.md .bc-editorial-page--profile) {
        position: absolute;
        z-index: 0;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 0;
      }

      :global(.md) .bc-editorial-page--heading,
      :global(.md) .bc-editorial-page--card {
        position: relative;
        z-index: 1;
        box-sizing: border-box;
        width: 100%;
        max-width: 520px;
        margin-left: auto;
        margin-right: auto;
      }

      :global(.md) .bc-editorial-page--heading {
        padding: 24px 0 0;
      }

      :global(.md) .bc-editorial-page--title {
        font-size: 40px;
        line-height: 48px;
        letter-spacing: -0.5px;
      }

      :global(.md) .bc-editorial-page--card {
        padding: 28px 24px 24px;
      }

      :global(.md) .bc-editorial-page--actions {
        margin-top: 24px;
        padding: 0;
      }
    }

    /* Landscape: the heading on the left, the card in a 480 dp column on the right, centred vertically. */
    @media (min-width: 768px) and (orientation: landscape) {
      :global(.md) .bc-editorial-page--body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 480px;
        grid-template-rows: auto 1fr;
        column-gap: 48px;
        padding: 0 48px 48px;
      }

      :global(.md) .bc-editorial-page--heading {
        grid-column: 1;
        grid-row: 1;
        max-width: 560px;
        margin: 0;
      }

      :global(.md) .bc-editorial-page--card {
        grid-column: 2;
        grid-row: 1 / span 2;
        align-self: center;
        max-width: none;
        margin: 0;
      }
    }

    /*
     * Alpha first launch on an Android phone (tasks 2026-11-16-233 and 236;
     * docs/mockups/android-premier-lancement-*.dc.html): under the 140 dp blue band, « Retour », the title,
     * the content on the page (no card), the buttons across the width.
     */
    /* The page is a column: band, content, then the About link at the bottom of the screen. */
    :global(.bc-editorial-page--first-launch .page-content) {
      display: flex;
      flex-direction: column;
    }

    .bc-editorial-page--band-body,
    .bc-editorial-page--panel-body {
      padding: 16px 16px 0;
      min-height: 0;
      flex: 1 0 auto;

      .bc-editorial-page--heading {
        padding: 0;
        gap: 0;
      }

      .bc-editorial-page--eyebrow {
        margin-bottom: 4px;
        font-size: 13px;
        line-height: 18px;
        font-weight: 600;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: var(--bc-code-active);
      }

      .bc-editorial-page--title {
        margin-bottom: 6px;
        /* 28 sp in the mock-ups, drawn at 24 sp on a 390 dp screen: two lines of title must fit. */
        font-size: 24px;
        line-height: 30px;
        font-weight: 500;
        letter-spacing: -0.2px;
      }

      .bc-editorial-page--intro {
        margin-bottom: 20px;
        font-size: 15px;
        line-height: 21px;
      }

      .bc-editorial-page--card {
        --bc-field-margin: 0;
        margin: 0;
        padding: 0;
        border-radius: 0;
        background: none;
      }

      .bc-editorial-page--actions {
        padding: 22px 0 0;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;

        .bc-editorial-page--secondary {
          margin: 0;
          flex: none;
          height: 48px;
          padding: 0 22px;
          border: var(--bc-outline-width) solid var(--bc-chip-outline);
          border-radius: 24px;
          justify-content: center;
          font-size: 15px;
          font-weight: 500;
          color: var(--bc-text);
        }

        .bc-editorial-page--filled {
          flex: none;
          height: 48px;
          border-radius: 24px;
          font-size: 15px;
        }
      }
    }

    /*
     * Alpha first launch on an Android tablet (task 2026-11-16-239; docs/mockups/
     * android-tablette-premier-lancement-alpha-*.dc.html): the blue panel of task 237 (still) and the step in a
     * 452 dp column beside it (landscape) or under it (portrait), vertically centred, the buttons on the right.
     */
    :global(.bc-editorial-page--panelled .page-content) {
      display: flex;
      flex-direction: row;
      padding: 0;
      overflow: hidden;

      @media (orientation: portrait) {
        flex-direction: column;
      }
    }

    :global(.md) .bc-editorial-page--panel-body {
      /* Against the tablet rules above (a grid of heading and card): a plain centred column. */
      display: flex;
      flex-direction: column;
      grid-template-columns: none;
      grid-template-rows: none;
      column-gap: 0;
      position: static;
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      min-height: 0;
      padding: 24px 64px 28px;
      /* Centred while it fits; it scrolls (the panel stays) when it is taller (the git help). */
      overflow-y: auto;

      &::before,
      .bc-editorial-page--spacer {
        content: '';
        flex: 1 1 0;
      }

      /* A narrow window (the desktop's smallest): the column keeps a usable width. */
      @media (max-width: 900px) and (orientation: landscape) {
        padding-left: 32px;
        padding-right: 32px;
      }

      .bc-editorial-page--heading,
      .bc-editorial-page--card {
        grid-column: auto;
        grid-row: auto;
        width: auto;
        max-width: none;
        margin-left: 0;
        margin-right: 0;
        align-self: stretch;
      }

      @media (orientation: portrait) {
        padding: 0 120px 64px;
      }

      .bc-editorial-page--title {
        margin-bottom: 8px;
        font-size: 28px;
        line-height: 36px;
        letter-spacing: -0.2px;
      }

      .bc-editorial-page--intro {
        margin-bottom: 24px;
        font-size: 16px;
        line-height: 22px;
      }

      .bc-editorial-page--actions {
        padding: 24px 0 0;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;

        .bc-editorial-page--secondary,
        .bc-editorial-page--filled {
          flex: none;
          width: auto;
          height: 48px;
          padding: 0 28px;
          font-size: 15px;
        }
      }
    }

    /* The desktop app (task 2026-11-16-242): the step is always beside the panel (48.6 % of the window, 700 dp at
       most), its column keeps its room in a narrow window. */
    :global(html.bc-desktop-app .bc-editorial-page--panelled .page-content) {
      flex-direction: row;
    }
    :global(html.bc-desktop-app.md) .bc-editorial-page--panel-body {
      padding: 24px clamp(24px, 4.4vw, 64px) 56px;
      overflow-y: auto;
      justify-content: safe center;

      /* A low window: the help link at the bottom keeps its own room, and a long step scrolls. */
      @media (max-height: 700px) {
        padding-top: 16px;
        padding-bottom: 80px;
      }

      /* A short window (fluid layout, docs/system-design.md, section 7): the step's own spacing gives way so that it
         fits without a scrollbar. */
      @media (max-height: 640px) {
        padding-top: 8px;

        .bc-editorial-page--retour {
          min-height: 36px;
        }

        .bc-editorial-page--eyebrow {
          margin-bottom: 2px;
        }

        .bc-editorial-page--title {
          margin-bottom: 4px;
          font-size: 24px;
          line-height: 30px;
        }

        .bc-editorial-page--intro {
          margin-bottom: 12px;
          font-size: 15px;
          line-height: 20px;
        }

        .bc-editorial-page--actions {
          padding-top: 12px;
        }
      }
    }
    :global(html.bc-desktop-app) .bc-editorial-page--linear.bc-editorial-page--linear-panel {
      left: calc(min(700px, 48.6%) + clamp(24px, 4.4vw, 64px));
      right: clamp(24px, 4.4vw, 64px);
      top: 24px;
    }

    /* The busy indicator runs at the top of the step's column. */
    .bc-editorial-page--linear.bc-editorial-page--linear-panel {
      left: calc(min(700px, 55%) + 64px);
      right: 64px;
      top: 24px;

      @media (orientation: portrait) {
        left: 120px;
        right: 120px;
        top: 540px;
      }
    }

    /* The « Retour » link: 20 dp chevron and 15 sp text, a 48 dp tall target, 8 dp out to the left. */
    :global(.bc-editorial-page--retour) {
      border: none;
      background: none;
      font-family: inherit;
      align-self: flex-start;
      box-sizing: border-box;
      min-height: 48px;
      margin: 0 0 0 -8px;
      padding: 0 12px 0 4px;
      border-radius: 24px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 15px;
      line-height: 20px;
      font-weight: 500;
      color: var(--bc-text);
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: color-mix(in srgb, var(--bc-text) 8%, transparent);
        }
      }
    }

    /* The busy indicator runs under the band. */
    .bc-editorial-page--linear.bc-editorial-page--linear-band {
      top: calc(max(var(--f7-safe-area-top), 24px) + 140px);
    }

    /* iPhone: the same layout with iOS sizes (compte-*-ios.dc.html). */
    :global(.ios) .bc-editorial-page--heading {
      padding: 4px 24px 0;
      gap: 10px;
    }

    :global(.ios) .bc-editorial-page--eyebrow {
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
    }

    :global(.ios) .bc-editorial-page--title {
      font-size: 34px;
      line-height: 41px;
      font-weight: 400;
      letter-spacing: 0.4px;
    }

    :global(.ios) .bc-editorial-page--intro {
      font-size: 17px;
      line-height: 24px;
    }

    /* The pages draw their own inset grouped sections. */
    :global(.ios) .bc-editorial-page--card {
      --bc-field-margin: 16px;
      margin: 4px 0 0;
      padding: 0;
      border-radius: 0;
      background: none;
    }

    :global(.ios) .bc-editorial-page--actions {
      padding: 16px 24px calc(var(--f7-safe-area-bottom) + 24px);
      flex-direction: column;
      align-items: stretch;
      gap: 12px;

      .bc-editorial-page--secondary {
        margin: 0;
        min-height: 44px;
        justify-content: center;
        font-size: 17px;
      }

      /* The main button first, the plain text button under it. */
      &.bc-editorial-page--end .bc-editorial-page--secondary {
        order: 1;
      }

      /* "Précédent", a grey capsule beside the main one. */
      &.bc-editorial-page--previous {
        flex-direction: row;

        .bc-editorial-page--secondary {
          width: 128px;
          height: 56px;
          border-radius: 28px;
          background: var(--bc-tint);
          color: var(--bc-on-tint);
          font-weight: 600;
        }

        .bc-editorial-page--filled {
          flex: 1;
          width: auto;
        }
      }
    }

    :global(.ios) .bc-editorial-page--filled {
      flex: none;
      width: 100%;
      height: 56px;
      border-radius: 28px;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: 0;
      gap: 10px;

      &:disabled {
        background: var(--bc-primary-action);
        color: var(--bc-on-primary-action);
        opacity: 0.5;
      }
    }

    :global(.ios) .bc-editorial-page--spinner {
      width: 18px;
      height: 18px;
    }
  }
</style>
