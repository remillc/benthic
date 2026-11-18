<script>
  // @ts-check
  // DEVELOPMENT ONLY: the « Outils de développement » menu (a bottom sheet): the state of the account and the actions
  // of lib/dev-tools.js. Loaded through `import()` behind the development switch. Its texts are not in the translation
  // files: they must not reach a release catalogue.
  import { realDevTools } from '../lib/dev-tools.js';
  import { devUi } from '../lib/dev-tools-ui.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';

  const english = typeof navigator !== 'undefined' && !/^fr/i.test(navigator.language);
  const text = english
    ? { title: 'Development tools', free: 'Free', subscribed: 'Subscribed', none: 'no session', server: 'Server', toFreeOut: 'Switch to a free account (sign out, keep the device logbook)', toFreeKeep: 'Switch to a free account (keep the session, mark not subscribed)', toSub: 'Switch to a subscribed account', fresh: 'New test account', del: 'Delete this test account', replay: 'Replay the first launch', close: 'Close', done: 'Done', failed: 'Failed: ' }
    : { title: 'Outils de développement', free: 'Gratuit', subscribed: 'Abonné', none: 'aucune session', server: 'Serveur', toFreeOut: 'Passer en compte gratuit (se déconnecter, garder le carnet de l’appareil)', toFreeKeep: 'Passer en compte gratuit (garder la session, marquer non abonné)', toSub: 'Passer en compte abonné', fresh: 'Nouveau compte d’essai', del: 'Supprimer ce compte d’essai', replay: 'Rejouer le premier lancement', close: 'Fermer', done: 'Fait', failed: 'Échec : ' };

  /** @type {Awaited<ReturnType<typeof realDevTools>>|null} */
  let tools = $state(null);
  /** @type {import('../lib/dev-tools.js').DevState|null} */
  let current = $state(null);
  let busy = $state(false);

  $effect(() => {
    if (!devUi.open) return;
    realDevTools().then(async (t) => {
      tools = t;
      current = await t.state();
    });
  });

  /** @param {() => Promise<void>|void} action */
  async function run(action) {
    if (busy || !tools) return;
    busy = true;
    try {
      await action();
      showSnackbar(text.done);
      devUi.open = false;
    } catch (e) {
      console.error('Development tools', e);
      showSnackbar(text.failed + (e instanceof Error ? e.message : String(e)));
    } finally {
      busy = false;
    }
  }
</script>

{#if devUi.open}
  <div class="od-dev-tools-menu" role="dialog" aria-modal="true" aria-label={text.title}>
    <div class="od-dev-tools-menu--panel">
      <div class="od-dev-tools-menu--head"><span class="od-dev-tools-menu--tag">DEV</span><span class="od-dev-tools-menu--title">{text.title}</span></div>
      <p class="od-dev-tools-menu--state">
        {#if current}
          {current.kind === 'subscribed' ? text.subscribed : text.free} · {current.email || text.none}<br />{text.server} : {current.server || '-'}
        {/if}
      </p>
      <button type="button" disabled={busy || !tools} onclick={() => run(() => tools?.toFree('signOut'))}>{text.toFreeOut}</button>
      <button type="button" disabled={busy || !tools} onclick={() => run(() => tools?.toFree('unsubscribe'))}>{text.toFreeKeep}</button>
      <button type="button" disabled={busy || !tools} onclick={() => run(() => tools?.toSubscribed())}>{text.toSub}</button>
      <button type="button" disabled={busy || !tools} onclick={() => run(() => tools?.newAccount())}>{text.fresh}</button>
      <button type="button" disabled={busy || !tools || !current?.temporary} onclick={() => run(() => tools?.deleteAccount())}>{text.del}</button>
      <button type="button" disabled={busy || !tools} onclick={() => run(() => tools?.replayFirstLaunch())}>{text.replay}</button>
      <button type="button" class="od-dev-tools-menu--close" onclick={() => (devUi.open = false)}>{text.close}</button>
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
      width: 100%;
      max-width: 480px;
      max-height: 100%;
      overflow-y: auto;
      padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
      border-radius: 20px 20px 0 0;
      background: var(--od-surface);
      color: var(--od-text);
      display: flex;
      flex-direction: column;
      gap: 8px;

      button {
        min-height: 44px;
        padding: 8px 14px;
        border: 1px solid var(--od-border, #8888);
        border-radius: 12px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
      }
    }
    .od-dev-tools-menu--head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .od-dev-tools-menu--tag {
      padding: 1px 6px;
      border-radius: 6px;
      background: var(--od-alarm, #b3261e);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
    }
    .od-dev-tools-menu--title {
      font-weight: 600;
      font-size: 17px;
    }
    .od-dev-tools-menu--state {
      margin: 0 0 4px;
      font-size: 13px;
      color: var(--od-text-2);
      overflow-wrap: anywhere;
    }
  }
</style>
