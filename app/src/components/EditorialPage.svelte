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
  import { layout } from '../lib/layout.svelte.js';
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
   *   children: import('svelte').Snippet,
   *   class?: string,
   * }}
   * title: the flow, shown in the eyebrow with the step. No
   * action: no main button. secondaryEnd: the text button sits after the
   * main button (iOS: under it). firstLaunch: on an Android phone, the layout of the alpha first launch (tasks
   * 2026-11-16-233 and 236): the blue band, « Retour », the title and the fields on the page, full-width buttons;
   * noRetour: without the « Retour » link (the download). closable false: no close button (an import
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
    children,
    class: extraClass = '',
  } = $props();

  const ios = f7.theme === 'ios';

  /** "Nouveau compte · étape 2 sur 2": the flow, then the step. */
  const eyebrow = $derived(step ? `${title} · ${step.charAt(0).toLocaleLowerCase()}${step.slice(1)}` : title);
  /** The title ends with a full stop, unless it is a question. */
  const shownHeading = $derived(/[.?!…]$/.test(heading) ? heading : `${heading}.`);
  /** Tablet (Android): the actions are the last element of the card. */
  const actionsInCard = $derived(!ios && !layout.phone);
  /** The alpha first launch on an Android phone (task 2026-11-16-233). */
  const band = $derived(firstLaunch && !ios && layout.phone);
</script>

{#snippet actions()}
  <div class="od-editorial-page--actions" class:od-editorial-page--end={secondaryEnd} class:od-editorial-page--previous={previous}>
    {#if secondary}
      <button
        type="button"
        class="od-text-button od-editorial-page--secondary"
        disabled={secondary.disabled ?? busy}
        onclick={secondary.onclick}>{secondary.label}</button
      >
    {/if}
    {#if action}
      <button type="submit" class="od-editorial-page--filled" disabled={actionDisabled || busy} aria-busy={busy}>
        {#if busy}{#if ios}<span class="od-editorial-page--spinner" aria-hidden="true"></span>{:else}<LoadingIndicator size={18} label="" />{/if}{busyLabel || action}{:else}{action}{/if}
      </button>
    {/if}
  </div>
{/snippet}

<Page class="od-editorial-page {extraClass} {band ? 'od-editorial-page--first-launch' : ''}">
  {#if band}
    <FirstLaunchBand />
  {:else}
  <Navbar class="od-editorial-page--bar">
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
          <span class="od-sr-only">{back ? t('accountStep.back') : t('accountStep.close')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>
  {/if}

  {#if busy && !ios}
    <div class="od-editorial-page--linear" class:od-editorial-page--linear-band={band}><LinearWavyProgress indeterminate label={busyLabel || action} /></div>
  {/if}

  <form
    class="od-editorial-page--body"
    class:od-editorial-page--band-body={band}
    novalidate
    onsubmit={(e) => {
      e.preventDefault();
      if (!actionDisabled && !busy) onaction();
    }}
  >
    {#if band}
      <!-- Alpha first launch on a phone (task 2026-11-16-233): « Retour », the title, the content on the page, full-width buttons. -->
      {#if !noRetour}
        <Link back class="od-editorial-page--retour">
          <Icon name="arrowBack" size={20} weight={2} />
          <span>{t('accountStep.back')}</span>
        </Link>
      {/if}
      <div class="od-editorial-page--heading">
        {#if step}<p class="od-editorial-page--eyebrow">{eyebrow}</p>{/if}
        <h1 class="od-editorial-page--title">{heading}</h1>
        {#if intro}<p class="od-editorial-page--intro">{intro}</p>{/if}
      </div>
      <div class="od-editorial-page--card">{@render children()}</div>
      {#if action || secondary}{@render actions()}{/if}
    {:else}
    <div class="od-editorial-page--heading">
      <p class="od-editorial-page--eyebrow">{eyebrow}</p>
      <h1 class="od-editorial-page--title">{shownHeading}</h1>
      <p class="od-editorial-page--intro">{intro}</p>
    </div>

    <div class="od-editorial-page--card">
      {@render children()}
      {#if actionsInCard && (action || secondary)}{@render actions()}{/if}
    </div>

    <DecorativeProfile class="od-editorial-page--profile" />

    {#if !actionsInCard && (action || secondary)}{@render actions()}{/if}
    {/if}
  </form>
  {#if helpLink}<WelcomeHelpLink />{/if}
</Page>

<style>
  /* Framework7 variables, outside the layers so that they win over Framework7's own. */
  :global(.od-editorial-page) {
    --f7-page-bg-color: var(--od-background);
  }

  /* The bar carries only ✕ or ← (iOS: "Annuler" or "‹ Retour"), on the page's own background. */
  :global(.od-editorial-page--bar) {
    --f7-navbar-bg-color: transparent;
  }

  /* Tablet: ✕ lines up with the heading (its 48 dp target 12 dp before it). */
  @media (min-width: 768px) {
    :global(.md .od-editorial-page--bar) {
      --f7-navbar-inner-padding-left: max(0px, calc((100% - 520px) / 2 - 12px));
    }
  }

  @media (min-width: 768px) and (orientation: landscape) {
    :global(.md .od-editorial-page--bar) {
      --f7-navbar-inner-padding-left: 36px;
    }
  }

  @layer od.components {
    /* No close button (an import that runs): no empty bar button either. */
    :global(.od-editorial-page--bar .left:not(:has(a))) {
      display: none;
    }

    :global(.od-editorial-page--bar .navbar-bg) {
      background: transparent;
    }

    :global(.od-editorial-page--bar .navbar-bg::after) {
      display: none;
    }

    .od-editorial-page--body {
      box-sizing: border-box;
      min-height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* 16 dp at the top: the 10 dp band of the busy indicator stays clear of the overline. */
    .od-editorial-page--heading {
      padding: 16px 24px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;

      p {
        margin: 0;
        color: var(--od-text-2);
      }
    }

    .od-editorial-page--eyebrow {
      font-size: 14px;
      line-height: 20px;
      font-weight: 500;
    }

    .od-editorial-page--title {
      margin: 0;
      font-size: 34px;
      line-height: 40px;
      font-weight: 400;
      letter-spacing: -0.4px;
    }

    .od-editorial-page--intro {
      font-size: 16px;
      line-height: 24px;
    }

    /* The content in one white card. */
    .od-editorial-page--card {
      --od-field-margin: 0;
      margin: 24px 16px 0;
      padding: 20px 16px;
      border-radius: 28px;
      background: var(--od-surface);

      /* Android: the first field starts at the top of the card. */
      :global(.md) & > :global(:first-child),
      :global(.md) & > :global(:first-child > .od-text-field--field:first-child),
      :global(.md) & > :global(:first-child > .od-select-field--field:first-child) {
        margin-top: 0;
      }
    }

    /* Phone: the profile and the actions at the bottom of the screen. */
    :global(.od-editorial-page--profile) {
      flex: none;
      height: 130px;
      margin-top: auto;
      padding-top: 24px;
      box-sizing: content-box;
    }

    .od-editorial-page--actions {
      padding: 16px 24px calc(var(--f7-safe-area-bottom) + 28px);
      display: flex;
      align-items: center;
      gap: 8px;

      &.od-editorial-page--end {
        justify-content: flex-end;
      }
    }

    .od-editorial-page--filled {
      flex: 1;
      min-width: 0;
      height: 56px;
      padding: 0 24px;
      border: none;
      border-radius: 28px;
      background: var(--od-primary-action);
      color: var(--od-on-primary-action);
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
        background: color-mix(in srgb, var(--od-text) 12%, transparent);
        color: color-mix(in srgb, var(--od-text) 60%, transparent);

        /* Busy (« Connexion… ») is not disabled: its label in --od-text-2, 6.4:1 (task 2026-11-14-153). */
        &[aria-busy='true'] {
          color: var(--od-text-2);
        }
        cursor: default;
      }
    }

    .od-editorial-page--secondary {
      flex: none;
    }

    /* MD3 Expressive wavy linear progress indicator, indeterminate, under the top bar, 16 dp
       from each side (compte-connexion-encours-android.dc.html, task 2026-11-14-130). */
    .od-editorial-page--linear {
      position: absolute;
      z-index: 600;
      left: 16px;
      right: 16px;
      top: calc(var(--f7-safe-area-top) + var(--f7-navbar-height));
      height: 10px;
    }

    .od-editorial-page--spinner {
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      box-sizing: border-box;
      animation: od-spin 0.9s linear infinite;
    }

    @keyframes od-spin {
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
      :global(.md) .od-editorial-page--body {
        position: relative;
        padding-bottom: 48px;
      }

      :global(.md .od-editorial-page--profile) {
        position: absolute;
        z-index: 0;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 0;
      }

      :global(.md) .od-editorial-page--heading,
      :global(.md) .od-editorial-page--card {
        position: relative;
        z-index: 1;
        box-sizing: border-box;
        width: 100%;
        max-width: 520px;
        margin-left: auto;
        margin-right: auto;
      }

      :global(.md) .od-editorial-page--heading {
        padding: 24px 0 0;
      }

      :global(.md) .od-editorial-page--title {
        font-size: 40px;
        line-height: 48px;
        letter-spacing: -0.5px;
      }

      :global(.md) .od-editorial-page--card {
        padding: 28px 24px 24px;
      }

      :global(.md) .od-editorial-page--actions {
        margin-top: 24px;
        padding: 0;
      }
    }

    /* Landscape: the heading on the left, the card in a 480 dp column on the right, centred vertically. */
    @media (min-width: 768px) and (orientation: landscape) {
      :global(.md) .od-editorial-page--body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 480px;
        grid-template-rows: auto 1fr;
        column-gap: 48px;
        padding: 0 48px 48px;
      }

      :global(.md) .od-editorial-page--heading {
        grid-column: 1;
        grid-row: 1;
        max-width: 560px;
        margin: 0;
      }

      :global(.md) .od-editorial-page--card {
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
    :global(.od-editorial-page--first-launch .page-content) {
      display: flex;
      flex-direction: column;
    }

    .od-editorial-page--band-body {
      padding: 16px 20px 0;
      min-height: 0;
      flex: 1 0 auto;

      .od-editorial-page--heading {
        padding: 0;
        gap: 0;
      }

      .od-editorial-page--eyebrow {
        margin-bottom: 4px;
        font-size: 13px;
        line-height: 18px;
        font-weight: 600;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: var(--od-code-active);
      }

      .od-editorial-page--title {
        margin-bottom: 6px;
        /* 28 sp in the mock-ups, drawn at 24 sp on a 390 dp screen: two lines of title must fit. */
        font-size: 24px;
        line-height: 30px;
        font-weight: 500;
        letter-spacing: -0.2px;
      }

      .od-editorial-page--intro {
        margin-bottom: 20px;
        font-size: 15px;
        line-height: 21px;
      }

      .od-editorial-page--card {
        --od-field-margin: 0;
        margin: 0;
        padding: 0;
        border-radius: 0;
        background: none;
      }

      .od-editorial-page--actions {
        padding: 22px 0 0;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;

        .od-editorial-page--secondary {
          margin: 0;
          flex: none;
          height: 48px;
          padding: 0 22px;
          border: var(--od-outline-width) solid var(--od-chip-outline);
          border-radius: 24px;
          justify-content: center;
          font-size: 15px;
          font-weight: 500;
          color: var(--od-text);
        }

        .od-editorial-page--filled {
          flex: none;
          height: 48px;
          border-radius: 24px;
          font-size: 15px;
        }
      }
    }

    /* The « Retour » link: 20 dp chevron and 15 sp text, a 48 dp tall target, 8 dp out to the left. */
    :global(.od-editorial-page--retour) {
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
      color: var(--od-text);
      cursor: pointer;

      @media (hover: hover) {
        &:hover {
          background: color-mix(in srgb, var(--od-text) 8%, transparent);
        }
      }
    }

    /* The busy indicator runs under the band. */
    .od-editorial-page--linear.od-editorial-page--linear-band {
      top: calc(max(var(--f7-safe-area-top), 24px) + 116px);
    }

    /* iPhone: the same layout with iOS sizes (compte-*-ios.dc.html). */
    :global(.ios) .od-editorial-page--heading {
      padding: 4px 24px 0;
      gap: 10px;
    }

    :global(.ios) .od-editorial-page--eyebrow {
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
    }

    :global(.ios) .od-editorial-page--title {
      font-size: 34px;
      line-height: 41px;
      font-weight: 400;
      letter-spacing: 0.4px;
    }

    :global(.ios) .od-editorial-page--intro {
      font-size: 17px;
      line-height: 24px;
    }

    /* The pages draw their own inset grouped sections. */
    :global(.ios) .od-editorial-page--card {
      --od-field-margin: 16px;
      margin: 4px 0 0;
      padding: 0;
      border-radius: 0;
      background: none;
    }

    :global(.ios) .od-editorial-page--actions {
      padding: 16px 24px calc(var(--f7-safe-area-bottom) + 24px);
      flex-direction: column;
      align-items: stretch;
      gap: 12px;

      .od-editorial-page--secondary {
        margin: 0;
        min-height: 44px;
        justify-content: center;
        font-size: 17px;
      }

      /* The main button first, the plain text button under it. */
      &.od-editorial-page--end .od-editorial-page--secondary {
        order: 1;
      }

      /* "Précédent", a grey capsule beside the main one. */
      &.od-editorial-page--previous {
        flex-direction: row;

        .od-editorial-page--secondary {
          width: 128px;
          height: 56px;
          border-radius: 28px;
          background: var(--od-tint);
          color: var(--od-on-tint);
          font-weight: 600;
        }

        .od-editorial-page--filled {
          flex: 1;
          width: auto;
        }
      }
    }

    :global(.ios) .od-editorial-page--filled {
      flex: none;
      width: 100%;
      height: 56px;
      border-radius: 28px;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: 0;
      gap: 10px;

      &:disabled {
        background: var(--od-primary-action);
        color: var(--od-on-primary-action);
        opacity: 0.5;
      }
    }

    :global(.ios) .od-editorial-page--spinner {
      width: 18px;
      height: 18px;
    }
  }
</style>
