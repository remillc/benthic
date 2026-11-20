<script>
  // @ts-check
  // « Avant de commencer » (docs/mockups/odplus-conditions-android.dc.html; task 2026-11-19-315, point 1): the terms of
  // use of Benthic+ in short, shown once per version of the terms, before the account's sites feed the shared map.
  // « Lire les conditions complètes » shows the full text (public/terms/<language>.html, also the public web page) in the
  // same popup. Back or the system gesture closes it without accepting: nothing is sent, and it comes back at the next
  // start. A full-screen popup on a phone, a dialog from the tablet's width.
  import { Popup, Page, Navbar, Link } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import { language, t } from '../lib/i18n.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { acceptTerms, sharedSites } from '../lib/shared-sites.svelte.js';

  let full = $state(false);
  let busy = $state(false);
  let text = $state('');

  $effect(() => {
    if (!full || text) return;
    /** @param {string} lang */
    const read = (lang) => fetch(`terms/${lang}.html`).then((r) => (r.ok ? r.text() : Promise.reject(r.status)));
    read(language.startsWith('fr') ? 'fr' : 'en')
      .catch(() => read('en'))
      .then((html) => (text = html))
      .catch((e) => console.error('Terms', e));
  });

  async function accept() {
    if (busy) return;
    busy = true;
    try {
      await acceptTerms();
    } catch (e) {
      const code = /** @type {any} */ (e)?.code;
      showSnackbar(t(code === 'TERMS_VERSION_MISMATCH' ? 'sharedSites.terms.changed' : 'sharedSites.terms.failed'));
    } finally {
      busy = false;
    }
  }

  const POINTS = /** @type {const} */ (['yours', 'encrypted', 'shared']);
</script>

<Popup class="od-shared-terms" opened={sharedSites.termsOpen} onPopupClosed={() => ((sharedSites.termsOpen = false), (full = false))} aria-label={t('sharedSites.terms.title')}>
  <Page data-od-scroll>
    {#if full}
      <Navbar title={t('sharedSites.terms.fullTitle')}>
        {#snippet left()}
          <Link iconOnly onClick={() => (full = false)}>
            <i class="icon icon-back"></i>
            <span class="od-sr-only">{t('detail.back')}</span>
          </Link>
        {/snippet}
      </Navbar>
      <!-- The app's own file (public/terms), not text from elsewhere. -->
      <div class="od-shared-terms--full">{@html text}</div>
    {:else}
      <div class="od-shared-terms--body">
        <h1 class="od-shared-terms--title">{t('sharedSites.terms.title')}</h1>
        <p class="od-shared-terms--lead">{t('sharedSites.terms.lead')}</p>
        <ul class="od-shared-terms--points">
          {#each POINTS as point (point)}
            <li class="od-shared-terms--point">
              <span class="od-shared-terms--dot" aria-hidden="true"></span>
              <span class="od-shared-terms--point-text">
                <strong>{t(`sharedSites.terms.${point}Title`)}</strong>
                <span>{t(`sharedSites.terms.${point}Text`)}</span>
              </span>
            </li>
          {/each}
        </ul>
        <button type="button" class="od-shared-terms--read" onclick={() => (full = true)}>{t('sharedSites.terms.readAll')}</button>
      </div>
      <div class="od-shared-terms--actions">
        <button type="button" class="button button-fill button-large od-shared-terms--accept" disabled={busy} onclick={accept}>
          {#if busy}<Icon name="sync" size={20} />{/if}{t('sharedSites.terms.accept')}
        </button>
      </div>
    {/if}
  </Page>
</Popup>

<style>
  @layer od.components {
    :global(.od-shared-terms) {
      --f7-page-bg-color: var(--od-background);
    }
    .od-shared-terms--body {
      padding: calc(48px + var(--f7-safe-area-top, 0px)) 0 120px;
    }
    .od-shared-terms--title {
      margin: 0 24px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
    }
    .od-shared-terms--lead {
      margin: 8px 24px 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);
    }
    .od-shared-terms--points {
      margin: 20px 16px 0;
      padding: 4px 16px;
      list-style: none;
      border-radius: 20px;
      background: var(--od-surface);
    }
    .od-shared-terms--point {
      display: flex;
      gap: 12px;
      padding: 12px 0;
      & + & {
        border-top: 1px solid var(--od-separator);
      }
    }
    .od-shared-terms--dot {
      flex: none;
      width: 8px;
      height: 8px;
      margin-top: 8px;
      border-radius: 4px;
      background: var(--od-secondary);
    }
    .od-shared-terms--point-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
      & strong {
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
        color: var(--od-text);
      }
    }
    .od-shared-terms--read {
      margin: 16px 24px 0;
      padding: 12px 0;
      border: none;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--od-secondary);
      text-decoration: underline;
      cursor: pointer;
    }
    .od-shared-terms--actions {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: calc(32px + var(--f7-safe-area-bottom, 0px));
      z-index: 1;
    }
    .od-shared-terms--accept {
      width: 100%;
      gap: 8px;
      --f7-button-fill-bg-color: var(--od-secondary);
      --f7-button-fill-text-color: var(--od-on-secondary);
    }
    .od-shared-terms--full {
      padding: 8px 24px 32px;
      line-height: 1.5;
    }
  }
</style>
