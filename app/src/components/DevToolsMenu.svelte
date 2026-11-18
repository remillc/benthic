<script>
  // @ts-check
  // DEVELOPMENT ONLY: the « Outils de développement » menu (a bottom sheet on a phone, a dialog on a tablet or desktop):
  // the state of the account and the actions of lib/dev-tools.js. Loaded through `import()` behind the development
  // switch. Its texts are not in the translation files: they must not reach a release catalogue.
  import Icon from './Icon.svelte';
  import OdPlusChip from './OdPlusChip.svelte';
  import { realDevTools } from '../lib/dev-tools.js';
  import { devUi } from '../lib/dev-tools-ui.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';

  const english = typeof navigator !== 'undefined' && !/^fr/i.test(navigator.language);
  const text = english
    ? {
        title: 'Development tools', free: 'Free', subscribed: 'Subscriber', none: 'No session', dives: 'dives',
        account: 'Account', trial: 'Test accounts', first: 'First launch',
        toFreeOut: 'Free', toFreeOutTag: 'signed out', toFreeOutHint: 'Switch to free: forgets the session and opens the logbook kept on this device.',
        toFreeKeep: 'Free', toFreeKeepTag: 'signed in', toFreeKeepHint: 'Switch to free: keeps the session and marks the account as not subscribed on the server.',
        toSub: 'Subscriber', toSubTag: 'OpenDives+', toSubHint: 'Switch to subscriber: marks the account as subscribed to OpenDives+ on the server.',
        fresh: 'New test account', freshHint: 'Creates an account with a temporary e-mail address and signs in with it.',
        del: 'Delete this test account', delHint: 'Deletes the account and its data on the local server.', delOnly: 'Only a test account (temporary address) can be deleted.',
        delConfirm: 'Delete the account for good?', delYes: 'Delete', cancel: 'Cancel',
        replay: 'Replay the first launch', replayHint: 'Shows the welcome screens again; the logbooks are not touched.',
        close: 'Close', foot: 'Only visible in development builds.', done: 'Done', failed: 'Failed: ',
      }
    : {
        title: 'Outils de développement', free: 'Gratuit', subscribed: 'Abonné', none: 'Aucune session', dives: 'plongées',
        account: 'Compte', trial: 'Comptes d’essai', first: 'Premier lancement',
        toFreeOut: 'Gratuit', toFreeOutTag: 'déconnecté', toFreeOutHint: 'Passer en gratuit : oublie la session et ouvre le carnet gardé sur cet appareil.',
        toFreeKeep: 'Gratuit', toFreeKeepTag: 'connecté', toFreeKeepHint: 'Passer en gratuit : garde la session et marque le compte comme non abonné sur le serveur.',
        toSub: 'Abonné', toSubTag: 'OpenDives+', toSubHint: 'Passer en abonné : marque le compte comme abonné à OpenDives+ sur le serveur.',
        fresh: 'Nouveau compte d’essai', freshHint: 'Crée un compte avec une adresse e-mail temporaire et s’y connecte.',
        del: 'Supprimer ce compte d’essai', delHint: 'Supprime le compte et ses données sur le serveur local.', delOnly: 'Seul un compte d’essai (adresse temporaire) peut être supprimé.',
        delConfirm: 'Supprimer le compte pour de bon ?', delYes: 'Supprimer', cancel: 'Annuler',
        replay: 'Rejouer le premier lancement', replayHint: 'Réaffiche les écrans d’accueil ; les carnets ne sont pas touchés.',
        close: 'Fermer', foot: 'Visible seulement dans les versions de développement.', done: 'Fait', failed: 'Échec : ',
      };

  /** @type {Awaited<ReturnType<typeof realDevTools>>|null} */
  let tools = $state(null);
  /** @type {import('../lib/dev-tools.js').DevState|null} */
  let current = $state(null);
  /** The key of the action that runs, for its indicator. */
  let busy = $state('');
  let confirming = $state(false);

  /** The segment of the account that matches the state: 0 free and signed out, 1 free and signed in, 2 subscriber. */
  const level = $derived(!current ? -1 : current.kind === 'subscribed' ? 2 : current.signedIn ? 1 : 0);
  const initial = $derived((current?.email || 'D').charAt(0).toUpperCase());

  $effect(() => {
    if (!devUi.open) {
      confirming = false;
      return;
    }
    realDevTools().then(async (t) => {
      tools = t;
      current = await t.state();
    });
  });

  /**
   * @param {string} id
   * @param {() => Promise<void>|void} action
   */
  async function run(id, action) {
    if (busy || !tools) return;
    busy = id;
    try {
      await action();
      showSnackbar(text.done);
      devUi.open = false;
    } catch (e) {
      console.error('Development tools', e);
      showSnackbar(text.failed + (e instanceof Error ? e.message : String(e)));
    } finally {
      busy = '';
      confirming = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (devUi.open && e.key === 'Escape') devUi.open = false;
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet row(id, icon, title, hint, click, off = false, danger = false)}
  <button type="button" class="od-dev-tools-menu--action" class:od-dev-tools-menu--danger={danger} disabled={!!busy || !tools || off} aria-busy={busy === id} onclick={click}>
    <span class="od-dev-tools-menu--action-icon"><Icon name={icon} size={22} /></span>
    <span class="od-dev-tools-menu--action-text">
      <span class="od-dev-tools-menu--action-title">{title}</span>
      <span class="od-dev-tools-menu--action-hint">{hint}</span>
    </span>
    {#if busy === id}<span class="od-dev-tools-menu--spinner" aria-hidden="true"></span>{/if}
  </button>
{/snippet}

{#snippet segment(id, index, icon, title, tag, click)}
  <button type="button" role="radio" class="od-dev-tools-menu--segment" class:od-dev-tools-menu--segment-on={level === index} aria-checked={level === index} disabled={!!busy || !tools} aria-busy={busy === id} onclick={() => level !== index && click()}>
    {#if busy === id}<span class="od-dev-tools-menu--spinner" aria-hidden="true"></span>{:else}<Icon name={icon} size={20} />{/if}
    <span class="od-dev-tools-menu--segment-title">{title}</span>
    <span class="od-dev-tools-menu--segment-tag">{tag}</span>
  </button>
{/snippet}

{#if devUi.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="od-dev-tools-menu" onclick={(e) => e.target === e.currentTarget && (devUi.open = false)}>
    <div class="od-dev-tools-menu--panel" role="dialog" aria-modal="true" aria-label={text.title}>
      <span class="od-dev-tools-menu--handle" aria-hidden="true"></span>
      <header class="od-dev-tools-menu--head">
        <span class="od-dev-tools-menu--title">{text.title}</span>
        <span class="od-dev-tools-menu--tag">DEV</span>
        <button type="button" class="od-dev-tools-menu--close" aria-label={text.close} onclick={() => (devUi.open = false)}><Icon name="close" size={22} /></button>
      </header>

      <div class="od-dev-tools-menu--body">
        <section class="od-dev-tools-menu--state" aria-live="polite">
          {#if current}
            <div class="od-dev-tools-menu--state-top">
              <span class="od-dev-tools-menu--avatar" aria-hidden="true">{initial}</span>
              <div class="od-dev-tools-menu--state-who">
                {#if current.kind === 'subscribed'}
                  <span class="od-dev-tools-menu--badge od-dev-tools-menu--badge-plus"><OdPlusChip onLight />{text.subscribed}</span>
                {:else}
                  <span class="od-dev-tools-menu--badge">{text.free}</span>
                {/if}
                <span class="od-dev-tools-menu--state-mail">{current.email || text.none}</span>
              </div>
            </div>
            <dl class="od-dev-tools-menu--facts">
              <dt><Icon name="server" size={16} /></dt>
              <dd>{current.server || '-'}</dd>
              <dt><Icon name="logbook" size={16} /></dt>
              <dd>{logbook.dives.length} {text.dives}</dd>
            </dl>
          {/if}
        </section>

        <section class="od-dev-tools-menu--section" aria-labelledby="od-dev-s-account">
          <h3 class="od-dev-tools-menu--heading" id="od-dev-s-account">{text.account}</h3>
          <div class="od-dev-tools-menu--segments" role="radiogroup" aria-labelledby="od-dev-s-account">
            {@render segment('out', 0, 'logout', text.toFreeOut, text.toFreeOutTag, () => run('out', () => tools?.toFree('signOut')))}
            {@render segment('keep', 1, 'lock', text.toFreeKeep, text.toFreeKeepTag, () => run('keep', () => tools?.toFree('unsubscribe')))}
            {@render segment('sub', 2, 'plusMark', text.toSub, text.toSubTag, () => run('sub', () => tools?.toSubscribed()))}
          </div>
          {#if level >= 0}
            <p class="od-dev-tools-menu--caption">{[text.toFreeOutHint, text.toFreeKeepHint, text.toSubHint][level]}</p>
          {/if}
        </section>

        <section class="od-dev-tools-menu--section" aria-labelledby="od-dev-s-trial">
          <h3 class="od-dev-tools-menu--heading" id="od-dev-s-trial">{text.trial}</h3>
          <div class="od-dev-tools-menu--group">
            {@render row('new', 'personAdd', text.fresh, text.freshHint, () => run('new', () => tools?.newAccount()))}
            {#if confirming}
              <div class="od-dev-tools-menu--confirm" role="alertdialog" aria-label={text.delConfirm}>
                <span class="od-dev-tools-menu--confirm-text"><Icon name="warning" size={20} />{text.delConfirm}</span>
                <button type="button" class="od-dev-tools-menu--confirm-cancel" disabled={!!busy} onclick={() => (confirming = false)}>{text.cancel}</button>
                <button type="button" class="od-dev-tools-menu--confirm-yes" disabled={!!busy} aria-busy={busy === 'del'} onclick={() => run('del', () => tools?.deleteAccount())}>{text.delYes}</button>
              </div>
            {:else}
              {@render row('del', 'delete', text.del, current && !current.temporary ? text.delOnly : text.delHint, () => (confirming = true), !current?.temporary, true)}
            {/if}
          </div>
        </section>

        <section class="od-dev-tools-menu--section" aria-labelledby="od-dev-s-first">
          <h3 class="od-dev-tools-menu--heading" id="od-dev-s-first">{text.first}</h3>
          <div class="od-dev-tools-menu--group">
            {@render row('replay', 'refresh', text.replay, text.replayHint, () => run('replay', () => tools?.replayFirstLaunch()))}
          </div>
        </section>

        <p class="od-dev-tools-menu--foot">{text.foot}</p>
      </div>
    </div>
  </div>
{/if}

<style>
  @layer od.components {
    .od-dev-tools-menu {
      position: fixed;
      inset: 0;
      z-index: 20001;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgb(0 0 0 / 0.45);
    }
    .od-dev-tools-menu--panel {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 560px;
      max-height: min(100%, 90dvh);
      padding: 8px 16px calc(16px + env(safe-area-inset-bottom));
      border-top: 4px solid var(--od-dev);
      border-radius: 28px 28px 0 0;
      background: var(--od-surface);
      color: var(--od-text);
      box-shadow: 0 -2px 24px rgb(0 0 0 / 0.25);
      animation: od-dev-tools-menu-in 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.1);
    }
    @media (min-width: 768px) {
      .od-dev-tools-menu {
        align-items: center;
      }
      .od-dev-tools-menu--panel {
        border-radius: 28px;
        padding-top: 16px;
      }
      .od-dev-tools-menu--handle {
        display: none;
      }
    }
    @keyframes od-dev-tools-menu-in {
      from {
        transform: translateY(24px);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .od-dev-tools-menu--panel {
        animation: none;
      }
    }
    .od-dev-tools-menu--handle {
      align-self: center;
      flex: none;
      width: 32px;
      height: 4px;
      margin: 4px 0 4px;
      border-radius: 2px;
      background: var(--od-text-2);
      opacity: 0.5;
    }
    .od-dev-tools-menu--head {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: none;
      padding: 4px 0 12px;
    }
    .od-dev-tools-menu--action-icon {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--od-dev-tint);
      color: var(--od-dev);
    }
    .od-dev-tools-menu--title {
      min-width: 0;
      overflow: hidden;
      font-size: 19px;
      font-weight: 600;
      line-height: 28px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-dev-tools-menu--tag {
      padding: 1px 7px;
      border: 1.5px solid var(--od-dev);
      border-radius: 6px;
      background: var(--od-surface);
      color: var(--od-dev);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.6px;
    }
    .od-dev-tools-menu--close {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin: -4px -8px -4px auto;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--od-text);
      cursor: pointer;
    }
    .od-dev-tools-menu--body {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .od-dev-tools-menu--state {
      box-sizing: border-box;
      flex: none;
      min-height: 72px;
      padding: 16px;
      border: 1.5px dashed var(--od-dev);
      border-radius: 20px;
      background: var(--od-surface);
    }
    .od-dev-tools-menu--state-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .od-dev-tools-menu--avatar {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--od-dev-tint);
      color: var(--od-dev);
      font-size: 24px;
      font-weight: 600;
    }
    .od-dev-tools-menu--state-who {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      min-width: 0;
    }
    .od-dev-tools-menu--state-mail {
      max-width: 100%;
      overflow: hidden;
      font-size: 14px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-dev-tools-menu--badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 14px;
      border-radius: 16px;
      background: var(--od-dev);
      color: var(--od-on-dev);
      font-size: 15px;
      font-weight: 600;
    }
    .od-dev-tools-menu--badge-plus {
      padding-left: 4px;
      background: var(--od-surface-container-high);
      color: var(--od-text);
    }
    .od-dev-tools-menu--facts {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 10px;
      align-items: center;
      margin: 14px 0 0;
      padding-top: 12px;
      border-top: 1px solid var(--od-dev-tint);
      font-size: 14px;
    }
    .od-dev-tools-menu--facts dt {
      display: inline-flex;
      color: var(--od-dev);
    }
    .od-dev-tools-menu--facts dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .od-dev-tools-menu--heading {
      margin: 0 0 8px 8px;
      color: var(--od-text-2);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .od-dev-tools-menu--segments {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 4px;
      border-radius: 24px;
      background: var(--od-surface-container-high);
    }
    .od-dev-tools-menu--segment {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-width: 0;
      min-height: 76px;
      padding: 8px 4px;
      border: 0;
      border-radius: 20px;
      background: transparent;
      color: var(--od-text);
      font: inherit;
      cursor: pointer;
    }
    .od-dev-tools-menu--segment-on {
      background: var(--od-dev);
      color: var(--od-on-dev);
      cursor: default;
    }
    .od-dev-tools-menu--segment:disabled:not(.od-dev-tools-menu--segment-on):not([aria-busy='true']) {
      opacity: 0.5;
      cursor: default;
    }
    .od-dev-tools-menu--segment:active:not(:disabled):not(.od-dev-tools-menu--segment-on) {
      background: var(--od-surface-container-highest);
    }
    .od-dev-tools-menu--segment-title {
      max-width: 100%;
      overflow: hidden;
      font-size: 15px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-dev-tools-menu--segment-tag {
      max-width: 100%;
      overflow: hidden;
      font-size: 12px;
      opacity: 0.85;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-dev-tools-menu--caption {
      margin: 8px 8px 0;
      color: var(--od-text-2);
      font-size: 13px;
      line-height: 18px;
    }
    .od-dev-tools-menu--group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .od-dev-tools-menu--action {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 12px 16px 12px 12px;
      border: 0;
      border-radius: 16px;
      background: var(--od-surface-container-high);
      color: var(--od-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .od-dev-tools-menu--action:active:not(:disabled) {
      background: var(--od-surface-container-highest);
    }
    .od-dev-tools-menu--action:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .od-dev-tools-menu--action[aria-busy='true'] {
      opacity: 1;
    }
    .od-dev-tools-menu--action-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .od-dev-tools-menu--action-title {
      overflow: hidden;
      font-size: 16px;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .od-dev-tools-menu--action-hint {
      color: var(--od-text-2);
      font-size: 13px;
      line-height: 18px;
    }
    .od-dev-tools-menu--danger .od-dev-tools-menu--action-icon {
      background: var(--od-alarm-tint);
      color: var(--od-alarm);
    }
    .od-dev-tools-menu--danger .od-dev-tools-menu--action-title {
      color: var(--od-alarm);
    }
    .od-dev-tools-menu--spinner {
      flex: none;
      width: 20px;
      height: 20px;
      border: 2.5px solid var(--od-dev-tint);
      border-top-color: var(--od-dev);
      border-radius: 50%;
      animation: od-dev-tools-menu-spin 0.8s linear infinite;
    }
    .od-dev-tools-menu--segment-on .od-dev-tools-menu--spinner {
      border-color: rgb(255 255 255 / 0.35);
      border-top-color: var(--od-on-dev);
    }
    @keyframes od-dev-tools-menu-spin {
      to {
        transform: rotate(360deg);
      }
    }
    .od-dev-tools-menu--confirm {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--od-alarm-tint);
    }
    .od-dev-tools-menu--confirm-text {
      display: flex;
      flex: 1 1 100%;
      align-items: center;
      gap: 8px;
      color: var(--od-alarm);
      font-weight: 600;
    }
    .od-dev-tools-menu--confirm-cancel,
    .od-dev-tools-menu--confirm-yes {
      flex: 0 0 auto;
      width: auto;
      min-height: 44px;
      padding: 0 20px;
      border: 0;
      border-radius: 22px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .od-dev-tools-menu--confirm-cancel {
      background: transparent;
      color: var(--od-text);
    }
    .od-dev-tools-menu--confirm-yes {
      background: var(--od-alarm);
      color: var(--od-surface);
    }
    .od-dev-tools-menu--confirm button:disabled {
      opacity: 0.5;
    }
    .od-dev-tools-menu--foot {
      margin: 0;
      padding: 4px 8px 0;
      color: var(--od-text-2);
      font-size: 12px;
      line-height: 16px;
      text-align: center;
    }
    .od-dev-tools-menu button:focus-visible {
      outline: 2px solid var(--od-dev);
      outline-offset: -2px;
    }
  }
</style>
