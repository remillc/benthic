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

<Popup class="bc-shared-terms" opened={sharedSites.termsOpen} onPopupClosed={() => ((sharedSites.termsOpen = false), (full = false))} aria-label={t('sharedSites.terms.title')}>
  <Page data-bc-scroll>
    {#if full}
      <Navbar title={t('sharedSites.terms.fullTitle')}>
        {#snippet left()}
          <Link iconOnly onClick={() => (full = false)}>
            <i class="icon icon-back"></i>
            <span class="bc-sr-only">{t('detail.back')}</span>
          </Link>
        {/snippet}
      </Navbar>
      <!-- The app's own file (public/terms), not text from elsewhere. -->
      <div class="bc-shared-terms--full">{@html text}</div>
    {:else}
      <div class="bc-shared-terms--body">
        <h1 class="bc-shared-terms--title">{t('sharedSites.terms.title')}</h1>
        <p class="bc-shared-terms--lead">{t('sharedSites.terms.lead')}</p>
        <ul class="bc-shared-terms--points">
          {#each POINTS as point (point)}
            <li class="bc-shared-terms--point">
              <span class="bc-shared-terms--dot" aria-hidden="true"></span>
              <span class="bc-shared-terms--point-text">
                <strong>{t(`sharedSites.terms.${point}Title`)}</strong>
                <span>{t(`sharedSites.terms.${point}Text`)}</span>
              </span>
            </li>
          {/each}
        </ul>
        <button type="button" class="bc-shared-terms--read" onclick={() => (full = true)}>{t('sharedSites.terms.readAll')}</button>
      </div>
      <div class="bc-shared-terms--actions">
        <button type="button" class="button button-fill button-large bc-shared-terms--accept" disabled={busy} onclick={accept}>
          {#if busy}<Icon name="sync" size={20} />{/if}{t('sharedSites.terms.accept')}
        </button>
      </div>
    {/if}
  </Page>
</Popup>

<style>
  @layer bc.components {
    :global(.bc-shared-terms) {
      --f7-page-bg-color: var(--bc-background);
    }
    .bc-shared-terms--body {
      padding: calc(48px + var(--f7-safe-area-top, 0px)) 0 120px;
    }
    .bc-shared-terms--title {
      margin: 0 24px;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
    }
    .bc-shared-terms--lead {
      margin: 8px 24px 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);
    }
    .bc-shared-terms--points {
      margin: 20px 16px 0;
      padding: 4px 16px;
      list-style: none;
      border-radius: 20px;
      background: var(--bc-surface);
    }
    .bc-shared-terms--point {
      display: flex;
      gap: 12px;
      padding: 12px 0;
      & + & {
        border-top: 1px solid var(--bc-separator);
      }
    }
    .bc-shared-terms--dot {
      flex: none;
      width: 8px;
      height: 8px;
      margin-top: 8px;
      border-radius: 4px;
      background: var(--bc-secondary);
    }
    .bc-shared-terms--point-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
      & strong {
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
        color: var(--bc-text);
      }
    }
    .bc-shared-terms--read {
      margin: 16px 24px 0;
      padding: 12px 0;
      border: none;
      background: none;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-secondary);
      text-decoration: underline;
      cursor: pointer;
    }
    .bc-shared-terms--actions {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: calc(32px + var(--f7-safe-area-bottom, 0px));
      z-index: 1;
    }
    .bc-shared-terms--accept {
      width: 100%;
      gap: 8px;
      --f7-button-fill-bg-color: var(--bc-secondary);
      --f7-button-fill-text-color: var(--bc-on-secondary);
    }
    .bc-shared-terms--full {
      padding: 8px 24px 32px;
      line-height: 1.5;
    }
  }
</style>
