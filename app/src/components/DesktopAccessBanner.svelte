<script>
  // @ts-check
  // The band at the top of the desktop window about the right to the app (task 2026-11-27-414; mock-ups
  // docs/mockups/bureau-acces-avertissement.dc.html and bureau-acces-lecture-seule.dc.html):
  //   - yellow, from day 25 without a successful check: « Connectez-vous à Internet d'ici N jours pour garder l'accès » and « Réessayer »;
  //   - grey, when the right is not valid (never bought, ended, grace over): « Lecture seule. … » with « Exporter le carnet »,
  //     « Se connecter » and « Renouveler ».
  // It sits above the rail and the pages and pushes them down by its height (`--bc-access-banner-h`, set on the page). The rules
  // of lib/desktop-access.js decide; this only shows them. The few CSS rules at the end take the editing affordances away from
  // the detail's cards while the logbook is read only (the fields themselves read the state, DesktopEditField.svelte).
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { noLogbook } from '../lib/desktop-logbooks.svelte.js';
  import { access, accessEnforced, accessScreenShown, checkDesktopAccess, desktopPurchaseUrl, requestExport, showSignIn } from '../lib/desktop-access.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDate } from '../lib/format.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** The kind of band shown, '' for none. */
  // The sign-in screen has no band (bureau-acces-connexion-requise.dc.html).
  const mode = $derived(!accessEnforced || !access.ready || accessScreenShown(noLogbook) ? '' : access.status === 'readOnly' ? 'readOnly' : access.status === 'warning' ? 'warning' : '');
  /** The days since the last check that worked: the band says 25 on day 25. */
  const days = $derived(30 - access.daysLeft);

  const reasonText = $derived.by(() => {
    if (access.reason === 'ended') return t('desktopAccess.readOnly.ended', { date: formatDate(access.endedOn) });
    if (access.reason === 'none') return t('desktopAccess.readOnly.none');
    if (access.reason === 'graceOver') return t('desktopAccess.readOnly.graceOver');
    return t('desktopAccess.readOnly.never');
  });

  async function retry() {
    if ((await checkDesktopAccess()) !== 'ok') showSnackbar(t('desktopAccess.warning.stillOffline'));
  }

  /** @type {HTMLElement|undefined} */
  let band = $state();
  // The pages below start under the band, whatever its height (it wraps in a narrow window).
  $effect(() => {
    const root = document.documentElement;
    if (!band) {
      root.style.removeProperty('--bc-access-banner-h');
      root.classList.remove('bc-has-access-banner');
      return;
    }
    const element = band;
    const measure = () => root.style.setProperty('--bc-access-banner-h', `${element.offsetHeight}px`);
    measure();
    root.classList.add('bc-has-access-banner');
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--bc-access-banner-h');
      root.classList.remove('bc-has-access-banner');
    };
  });

  onMount(() => () => document.documentElement.classList.remove('bc-access-read-only'));
</script>

{#if mode}
  <div class="bc-access-banner bc-access-banner--{mode}" role="status" bind:this={band}>
    <span class="bc-access-banner--icon"><Icon name="info" size={20} weight={2} /></span>
    {#if mode === 'warning'}
      <span class="bc-access-banner--text">
        {t('desktopAccess.warning.text', { days })}
        <strong>{t('desktopAccess.warning.action', { n: access.daysLeft })}</strong>
      </span>
      <button type="button" class="bc-access-banner--button" disabled={access.checking} onclick={retry}>{t('desktopAccess.warning.retry')}</button>
    {:else}
      <span class="bc-access-banner--text"><strong>{t('desktopAccess.readOnly.title')}</strong> {reasonText} {t('desktopAccess.readOnly.tail')}</span>
      {#if logbook.dives.length}<button type="button" class="bc-access-banner--button" onclick={requestExport}>{t('desktopAccess.readOnly.export')}</button>{/if}
      <button type="button" class="bc-access-banner--button" onclick={showSignIn}>{t('desktopAccess.readOnly.signIn')}</button>
      <a class="bc-access-banner--button bc-access-banner--primary" href={desktopPurchaseUrl} target="_blank" rel="noopener noreferrer">{t('desktopAccess.readOnly.renew')}</a>
    {/if}
  </div>
{/if}

<style>
  @layer bc.components {
    .bc-access-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      /* Above the first-launch screen (6100) and the rail (6000). */
      z-index: 6200;
      box-sizing: border-box;
      min-height: 48px;
      /* 96 dp rail + 16: the text lines up with the pages' content, as in the mock-ups. */
      padding: 6px 16px 6px calc(var(--bc-nav-width, 96px) + 16px);
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--bc-table-divider);
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text);
    }

    .bc-access-banner--warning {
      background: var(--bc-access-warning);
    }

    .bc-access-banner--readOnly {
      background: var(--bc-access-read-only);
    }

    .bc-access-banner--icon {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    .bc-access-banner--warning .bc-access-banner--icon {
      color: var(--bc-access-warning-icon);
    }

    .bc-access-banner--text {
      flex: 1;
      min-width: 0;
    }

    .bc-access-banner--button {
      flex: none;
      /* Framework7 gives every button the width of its row. */
      width: auto;
      margin: 0;
      white-space: nowrap;
      height: 36px;
      padding: 0 16px;
      border: 0;
      border-radius: 18px;
      display: inline-flex;
      align-items: center;
      background: transparent;
      color: var(--bc-access-action);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;

      &:disabled {
        opacity: 0.6;
        cursor: default;
      }
    }

    .bc-access-banner--primary {
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }
  }

  /* The cards of the dive that stay on screen while the logbook is read only: what edits goes, what reads stays. */
  @layer bc.components {
    :global(html.bc-access-read-only) {
      :global(.bc-desktop-chips--remove),
      :global(.bc-desktop-chips--add),
      :global(.bc-desktop-weights--add),
      :global(.bc-desktop-weights--chip-x),
      :global(.bc-desktop-other-gear--remove),
      :global(.bc-desktop-gas-cards--add) {
        display: none;
      }

      /* Plain text: no field, no grey box, nothing that answers a click. */
      :global(.bc-desktop-pick-field--rest),
      :global(.bc-desktop-kit-field),
      :global(.bc-desktop-stars-row--star),
      :global(.bc-desktop-weights--chip-edit),
      :global(.bc-desktop-segments button) {
        pointer-events: none;
      }

      :global(.bc-desktop-pick-field--rest),
      :global(.bc-desktop-kit-field) {
        background: transparent;
        border-color: transparent;
        padding-left: 0;
      }

      :global(.bc-desktop-pick-field--rest svg),
      :global(.bc-desktop-kit-field svg) {
        display: none;
      }
    }
  }
</style>
