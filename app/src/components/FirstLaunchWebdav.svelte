<script>
  // @ts-check
  // The WebDAV or Nextcloud form of the release edition's first launch (task 2026-11-16-224, part 3; mock-ups
  // android-tablette-premier-lancement-production-webdav-paysage, -webdav-erreur-paysage and -ouvrir-webdav-paysage):
  // the server address, the user name and the password (an app password), then « Créer le carnet » or « Voir mes
  // carnets ». Nothing is connected until the personal cloud exists (idea #74, lib/cloud-connection.js): the button
  // says so. The password stays in the form's state and is cleared as soon as it is used; nothing is stored here.
  import ReleaseField from './ReleaseField.svelte';
  import { flow } from '../lib/first-launch.svelte.js';
  import { connectWebdav, webdavProblem } from '../lib/cloud-connection.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { errorCode } from '../lib/account.js';
  import { deviceKey } from '../lib/first-launch-phone.js';
  import { layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{ create: boolean, onconnected?: () => void, oncoming?: () => void }}
   * `create`: a new logbook (« Créer le carnet »); otherwise « Voir mes carnets ». `onconnected` runs once the
   * server answered; `oncoming` when the cloud is not built yet.
   */
  let { create, onconnected, oncoming } = $props();

  const w = flow.webdav;
  let busy = $state(false);

  const addressLive = liveError(
    () => w.url,
    (text) => (/^https:\/\//i.test(text.trim()) ? '' : t('gitRepo.addressNotHttps')),
  );
  const addressError = $derived(addressLive.error || (w.error === 'unreachable' ? t('welcomeSteps.webdavUnreachable') : ''));
  const passwordError = $derived(w.error === 'denied' ? t('welcomeSteps.webdavDenied') : '');
  const ready = $derived(!!w.url.trim() && !!w.user.trim() && !!w.password && !addressLive.error && !busy);

  /** Typing again clears what the server answered. */
  const edited = () => (w.error = '');

  async function run() {
    if (!ready) return;
    busy = true;
    w.error = '';
    try {
      await connectWebdav({ url: w.url.trim(), user: w.user.trim(), password: w.password });
      w.password = '';
      onconnected?.();
    } catch (e) {
      const code = errorCode(e);
      if (code === 'COMING') oncoming?.();
      else w.error = webdavProblem(code) || 'unreachable';
    } finally {
      busy = false;
    }
  }
</script>

<div class="od-first-launch-webdav">
  <ReleaseField label={t('welcomeSteps.webdavAddress')} bind:value={w.url} mono error={addressError} disabled={busy} autocomplete="url" oninput={edited} />
  <ReleaseField label={t('welcomeSteps.webdavUser')} bind:value={w.user} disabled={busy} autocomplete="username" oninput={edited} />
  <ReleaseField label={t('welcomeSteps.webdavPassword')} bind:value={w.password} type="password" disabled={busy} autocomplete="current-password" error={passwordError} help={t(deviceKey('welcomeSteps.webdavHelp', layout.phone))} oninput={edited} />
  <button type="button" class="od-first-launch-webdav--action" disabled={!ready} aria-busy={busy} onclick={run}>
    {t(create ? 'welcomeSteps.createLogbook' : 'welcomeSteps.seeLogbooks')}
  </button>
</div>

<style>
  @layer od.components {
    .od-first-launch-webdav {
      display: flex;
      flex-direction: column;
    }

    .od-first-launch-webdav--action {
      width: auto;
      align-self: flex-end;
      margin-top: 22px;
      height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: 24px;
      background: var(--od-text);
      color: var(--od-background);
      font: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;

      &:disabled {
        cursor: default;
        opacity: 0.38;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          opacity: 0.88;
        }
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: 2px;
      }
    }

/* Phone (task 2026-11-16-227): the button takes the width of the column. */
    @media (max-width: 767.98px) {
      .od-first-launch-webdav--action {
        align-self: stretch;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-first-launch-webdav--action {
        transition: none;
      }
    }
  }
</style>
