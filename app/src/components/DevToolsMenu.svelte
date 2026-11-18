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
        title: 'Development tools', free: 'Free', subscribed: 'OpenDives+ subscriber', none: 'No session', dives: 'dives',
        account: 'Account', trial: 'Test accounts', first: 'First launch',
        toFreeOut: 'Switch to free, signed out', toFreeOutHint: 'Forgets the session and opens the logbook kept on this device.',
        toFreeKeep: 'Switch to free, signed in', toFreeKeepHint: 'Keeps the session and marks the account as not subscribed on the server.',
        toSub: 'Switch to subscriber', toSubHint: 'Marks the account as subscribed to OpenDives+ on the server.',
        fresh: 'New test account', freshHint: 'Creates an account with a temporary e-mail address and signs in with it.',
        del: 'Delete this test account', delHint: 'Deletes the account and its data on the local server.', delOnly: 'Only a test account (temporary address) can be deleted.',
        delConfirm: 'Delete the account for good?', delYes: 'Delete', cancel: 'Cancel',
        replay: 'Replay the first launch', replayHint: 'Shows the welcome screens again; the logbooks are not touched.',
        close: 'Close', done: 'Done', failed: 'Failed: ',
      }
    : {
        title: 'Outils de développement', free: 'Gratuit', subscribed: 'Abonné OpenDives+', none: 'Aucune session', dives: 'plongées',
        account: 'Compte', trial: 'Comptes d’essai', first: 'Premier lancement',
        toFreeOut: 'Passer en gratuit, déconnecté', toFreeOutHint: 'Oublie la session et ouvre le carnet gardé sur cet appareil.',
        toFreeKeep: 'Passer en gratuit, connecté', toFreeKeepHint: 'Garde la session et marque le compte comme non abonné sur le serveur.',
        toSub: 'Passer en abonné', toSubHint: 'Marque le compte comme abonné à OpenDives+ sur le serveur.',
        fresh: 'Nouveau compte d’essai', freshHint: 'Crée un compte avec une adresse e-mail temporaire et s’y connecte.',
        del: 'Supprimer ce compte d’essai', delHint: 'Supprime le compte et ses données sur le serveur local.', delOnly: 'Seul un compte d’essai (adresse temporaire) peut être supprimé.',
        delConfirm: 'Supprimer le compte pour de bon ?', delYes: 'Supprimer', cancel: 'Annuler',
        replay: 'Rejouer le premier lancement', replayHint: 'Réaffiche les écrans d’accueil ; les carnets ne sont pas touchés.',
        close: 'Fermer', done: 'Fait', failed: 'Échec : ',
      };

  /** @type {Awaited<ReturnType<typeof realDevTools>>|null} */
  let tools = $state(null);
  /** @type {import('../lib/dev-tools.js').DevState|null} */
  let current = $state(null);
  /** The key of the action that runs, for its indicator. */
  let busy = $state('');
  let confirming = $state(false);

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
              {#if current.kind === 'subscribed'}
                <span class="od-dev-tools-menu--badge od-dev-tools-menu--badge-plus"><OdPlusChip onLight />{text.subscribed}</span>
              {:else}
                <span class="od-dev-tools-menu--badge">{text.free}</span>
              {/if}
            </div>
            <dl class="od-dev-tools-menu--facts">
              <dt><Icon name="mail" size={16} /></dt>
              <dd>{current.email || text.none}</dd>
              <dt><Icon name="server" size={16} /></dt>
              <dd>{current.server || '-'}</dd>
              <dt><Icon name="logbook" size={16} /></dt>
              <dd>{logbook.dives.length} {text.dives}</dd>
            </dl>
          {/if}
        </section>

        <section class="od-dev-tools-menu--section" aria-labelledby="od-dev-s-account">
          <h3 class="od-dev-tools-menu--heading" id="od-dev-s-account">{text.account}</h3>
          <div class="od-dev-tools-menu--group">
            {@render row('out', 'logout', text.toFreeOut, text.toFreeOutHint, () => run('out', () => tools?.toFree('signOut')))}
            {@render row('keep', 'lock', text.toFreeKeep, text.toFreeKeepHint, () => run('keep', () => tools?.toFree('unsubscribe')))}
            {@render row('sub', 'plusMark', text.toSub, text.toSubHint, () => run('sub', () => tools?.toSubscribed()))}
          </div>
        </section>

        <section class="od-dev-tools-menu--section" aria-labelledby="od-dev-s-trial">
          <h3 class="od-dev-tools-menu--heading" id="od-dev-s-trial">{text.trial}</h3>
          <div class="od-dev-tools-menu--group">
            {@render row('new', 'personAdd', text.fresh, text.freshHint, () => run('new', () => tools?.newAccount()))}
            {#if confirming}
              <div class="od-dev-tools-menu--confirm" role="alertdialog" aria-label={text.delConfirm}>
                <span class="od-dev-tools-menu--confirm-text">{text.delConfirm}</span>
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
        padding-top: 20px;
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
      margin: 4px 0 8px;
      border-radius: 2px;
      background: var(--od-text-2);
      opacity: 0.5;
    }
    .od-dev-tools-menu--head {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: none;
      padding: 4px 0 8px;
    }
    .od-dev-tools-menu--title {
      font-size: 20px;
      font-weight: 600;
      line-height: 28px;
    }
    .od-dev-tools-menu--tag {
      padding: 1px 7px;
      border-radius: 6px;
      background: var(--od-dev);
      color: var(--od-on-dev);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.6px;
    }
    .od-dev-tools-menu--close {
      display: inline-flex;
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
      padding: 14px 16px;
      border: 1.5px dashed var(--od-dev);
      border-radius: 20px;
      background: var(--od-dev-tint);
    }
    .od-dev-tools-menu--badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 28px;
      padding: 0 12px;
      border-radius: 14px;
      background: var(--od-surface);
      color: var(--od-text);
      font-size: 13px;
      font-weight: 600;
    }
    .od-dev-tools-menu--badge-plus {
      padding-left: 2px;
    }
    .od-dev-tools-menu--facts {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 10px;
      align-items: center;
      margin: 12px 0 0;
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
      margin: 0 0 6px 8px;
      color: var(--od-text-2);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .od-dev-tools-menu--group {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
      border-radius: 20px;
      background: var(--od-surface-container-high);
    }
    .od-dev-tools-menu--action {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 64px;
      padding: 10px 16px;
      border: 0;
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
    .od-dev-tools-menu--action-icon {
      display: inline-flex;
      flex: none;
      color: var(--od-dev);
    }
    .od-dev-tools-menu--action-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .od-dev-tools-menu--action-title {
      font-size: 16px;
      font-weight: 500;
    }
    .od-dev-tools-menu--action-hint {
      color: var(--od-text-2);
      font-size: 13px;
      line-height: 18px;
    }
    .od-dev-tools-menu--danger .od-dev-tools-menu--action-icon,
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
      background: var(--od-alarm-tint);
    }
    .od-dev-tools-menu--confirm-text {
      flex: 1 1 100%;
      color: var(--od-alarm);
      font-weight: 600;
    }
    .od-dev-tools-menu--confirm-cancel,
    .od-dev-tools-menu--confirm-yes {
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
    .od-dev-tools-menu button:focus-visible {
      outline: 2px solid var(--od-dev);
      outline-offset: -2px;
    }
  }
</style>
