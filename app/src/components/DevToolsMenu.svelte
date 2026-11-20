<script>
  // @ts-check
  // DEVELOPMENT ONLY: the « Outils de développement » menu (a bottom sheet on a phone, a dialog on a tablet or desktop):
  // the state of the account and the actions of lib/dev-tools.js. Loaded through `import()` behind the development
  // switch. Its texts are not in the translation files: they must not reach a release catalogue.
  import Icon from './Icon.svelte';
  import BenthicPlusChip from './BenthicPlusChip.svelte';
  import { realDevTools, accountSegments, runSegment } from '../lib/dev-tools.js';
  import { realDevReset, resetLines } from '../lib/dev-reset.js';
  import { devErrorText } from '../lib/dev-errors.js';
  import { exportOpenLogbook } from '../lib/replace-logbook-ui.js';
  import { devUi } from '../lib/dev-tools-ui.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { traceText } from '../lib/nav-trace.js';

  const english = typeof navigator !== 'undefined' && !/^fr/i.test(navigator.language);
  const text = english
    ? {
        title: 'Development tools', free: 'Free', subscribed: 'Subscriber', none: 'No session', dives: 'dives',
        account: 'Account', trial: 'Test accounts', first: 'First launch', alphaSection: 'Previous version’s logbook',
        toFreeOut: 'Free', toFreeOutTag: '', toFreeOutHint: 'Free, never had an account: forgets the session and opens the logbook kept on this device.',
        toFreeKeep: 'Free', toFreeKeepTag: 'signed in', toFreeKeepHint: 'Switch to free: keeps the session and marks the account as not subscribed on the server. With no session, a test account is created first.',
        toSub: 'Subscriber', toSubTag: 'Benthic+', toSubHint: 'Switch to subscriber: marks the account as subscribed to Benthic+ on the server.',
        fresh: 'New test account', freshHint: 'Creates an account with a temporary e-mail address and signs in with it.',
        del: 'Delete this test account', delHint: 'Deletes the account and its data on the local server.', delOnly: 'Only a test account (temporary address) can be deleted.',
        delConfirm: 'Delete the account for good?', delYes: 'Delete', cancel: 'Cancel',
        replay: 'Replay the first launch', replayHint: 'Resets the app as on a first install: erases the logbook of this device, the settings and the session.',
        resetTitle: 'Erase everything on this device?', resetNothing: 'Your logbook is empty.',
        resetLogbook: (n) => `Your logbook of ${n} dive${n === 1 ? '' : 's'} on this device`, resetSettings: 'Your settings and the choices remembered by the app',
        resetSession: 'Your account session and tokens (the account itself stays on the server)', resetEquipment: 'Equipment, profile, certifications and maintenance',
        resetFiles: 'Staged imports and exports', resetNotifications: 'Scheduled notifications', resetAlpha: 'The copy of the previous version’s logbook',
        resetKeepAlpha: 'Keep the previous version’s copy', resetExport: 'Export the logbook first', resetAll: 'Erase everything', resetAgain: 'Tap again to erase', resetKept: 'Kept: the development authority and the offline maps. No server is called.',
        statusBusy: 'Working…', statusOk: 'Done. The app restarts.',
        alpha: 'Import the previous version’s logbook', alphaHint: 'Copies, read-only, the logbook left on the device.',
        nav: 'Navigation', navLog: 'Navigation log', navHint: 'The last 200 navigation events (pages, Back, swipes, sheets): copy it or share it when a screen is left in a wrong state.',
        navCopy: 'Copy', navShare: 'Share', navEmpty: 'No event yet.', navCopied: 'Navigation log copied',
        close: 'Close', foot: 'Only visible in development builds.', done: 'Done', failed: 'Failed', noSession: 'No account is signed in, so there is nothing to delete.', noAlpha: 'No logbook of the previous version on this device.',
      }
    : {
        title: 'Outils de développement', free: 'Gratuit', subscribed: 'Abonné', none: 'Aucune session', dives: 'plongées',
        account: 'Compte', trial: 'Comptes d’essai', first: 'Premier lancement', alphaSection: 'Carnet de la version précédente',
        toFreeOut: 'Gratuit', toFreeOutTag: '', toFreeOutHint: 'Gratuit, jamais de compte : oublie la session et ouvre le carnet gardé sur cet appareil.',
        toFreeKeep: 'Gratuit', toFreeKeepTag: 'connecté', toFreeKeepHint: 'Passer en gratuit : garde la session et marque le compte comme non abonné sur le serveur. Sans session, un compte d’essai est créé d’abord.',
        toSub: 'Abonné', toSubTag: 'Benthic+', toSubHint: 'Passer en abonné : marque le compte comme abonné à Benthic+ sur le serveur.',
        fresh: 'Nouveau compte d’essai', freshHint: 'Crée un compte avec une adresse e-mail temporaire et s’y connecte.',
        del: 'Supprimer ce compte d’essai', delHint: 'Supprime le compte et ses données sur le serveur local.', delOnly: 'Seul un compte d’essai (adresse temporaire) peut être supprimé.',
        delConfirm: 'Supprimer le compte pour de bon ?', delYes: 'Supprimer', cancel: 'Annuler',
        replay: 'Rejouer le premier lancement', replayHint: 'Remet l’app dans l’état d’une première installation : efface le carnet de cet appareil, les réglages et la session.',
        resetTitle: 'Tout effacer sur cet appareil ?', resetNothing: 'Ton carnet est vide.',
        resetLogbook: (n) => `Ton carnet de ${n} plongée${n === 1 ? '' : 's'} sur cet appareil`, resetSettings: 'Tes réglages et les choix retenus par l’app',
        resetSession: 'Ta session de compte et ses jetons (le compte reste sur le serveur)', resetEquipment: 'Équipement, profil, certifications et entretien',
        resetFiles: 'Les imports et exports en attente', resetNotifications: 'Les notifications programmées', resetAlpha: 'La copie du carnet de la version précédente',
        resetKeepAlpha: 'Garder la copie de la version précédente', resetExport: 'Exporter d’abord le carnet', resetAll: 'Tout effacer', resetAgain: 'Toucher encore pour effacer', resetKept: 'Gardés : l’autorité de développement et les cartes hors ligne. Aucun appel au serveur.',
        statusBusy: 'En cours…', statusOk: 'Fait. L’app redémarre.',
        alpha: 'Importer le carnet de la version précédente', alphaHint: 'Copie, en lecture seule, le carnet resté sur l’appareil.',
        nav: 'Navigation', navLog: 'Journal de navigation', navHint: 'Les 200 derniers événements de navigation (pages, Retour, balayages, feuilles) : à copier ou partager quand un écran reste dans un mauvais état.',
        navCopy: 'Copier', navShare: 'Partager', navEmpty: 'Aucun événement pour l’instant.', navCopied: 'Journal de navigation copié',
        close: 'Fermer', foot: 'Visible seulement dans les versions de développement.', done: 'Fait', failed: 'Échec', noSession: 'Aucun compte connecté : il n’y a rien à supprimer.', noAlpha: 'Aucun carnet de la version précédente sur cet appareil.',
      };

  /** @type {Awaited<ReturnType<typeof realDevTools>>|null} */
  let tools = $state(null);
  /** @type {import('../lib/dev-tools.js').DevState|null} */
  let current = $state(null);
  /** The key of the action that runs, for its indicator. */
  let busy = $state('');
  let confirming = $state(false);
  /** The last result, shown in the sheet itself (a snackbar can be hidden by the sheet). */
  let status = $state({ kind: '', message: '', detail: '' });
  /** « Rejouer le premier lancement »: the confirmation, the checkbox, the second tap. */
  let resetOpen = $state(false);
  let keepAlpha = $state(true);
  let resetArmed = $state(false);

  /** The segment of the account that matches the state: 0 free and signed out, 1 free and signed in, 2 subscriber. */
  const level = $derived(!current ? -1 : current.kind === 'subscribed' ? 2 : current.signedIn ? 1 : 0);
  /** The segment the tapped action is heading to (the pill moves there at once); -1 when none, back to -1 on failure. */
  let target = $state(-1);
  /** The segment the red pill is under. */
  const pillIndex = $derived(target >= 0 ? target : level);
  /** False on the first render so that the pill appears in place; true a frame later so that it then slides. */
  let slide = $state(false);
  $effect(() => {
    if (level < 0 || slide) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => (slide = true)));
    return () => cancelAnimationFrame(frame);
  });
  const segments = $derived(accountSegments(current, { busy, ready: !!tools }));
  const lines = $derived(resetLines({ dives: logbook.dives.length, loggedIn: !!current?.signedIn, keepAlpha }));
  const initial = $derived((current?.email || 'D').charAt(0).toUpperCase());

  $effect(() => {
    if (!devUi.open) {
      confirming = false;
      resetOpen = false;
      resetArmed = false;
      status = { kind: '', message: '', detail: '' };
      return;
    }
    realDevTools().then(async (t) => {
      tools = t;
      current = await t.state();
    }).catch((e) => {
      console.error('Development tools', e);
      status = failure(e);
    });
  });

  /** The sentence that says what happened and what to do; the code only goes in the small detail line. @param {unknown} e */
  function failure(e) {
    const { text: message, detail } = devErrorText(e, english ? 'en' : 'fr');
    return { kind: 'error', message, detail };
  }

  /**
   * @param {string} id
   * @param {() => Promise<void>|void} action
   */
  async function run(id, action) {
    if (busy || !tools) return false;
    busy = id;
    status = { kind: 'busy', message: text.statusBusy, detail: '' };
    try {
      await action();
      status = { kind: 'ok', message: text.statusOk, detail: '' };
      showSnackbar(text.done);
      return true;
    } catch (e) {
      console.error('Development tools', e);
      status = failure(e);
      showSnackbar(status.message);
      return false;
    } finally {
      busy = '';
      confirming = false;
    }
  }

  /** A segment: the pill goes to it at once and comes back if the action fails. @param {'out'|'keep'|'sub'} id @param {number} index */
  async function pick(id, index) {
    target = index;
    const ok = await run(id, () => runSegment(tools, id));
    if (!ok) target = -1;
  }

  /** « Exporter d'abord le carnet »: the existing .ssrf export to the share sheet. */
  async function exportFirst() {
    await run('export', async () => {
      await exportOpenLogbook();
    });
  }

  async function resetNow() {
    if (!resetArmed) {
      resetArmed = true;
      return;
    }
    await run('reset', async () => {
      await (await realDevReset()).run({ keepAlpha });
    });
  }

  /**
   * The grip above the title: the sheet follows the finger downwards; past a quarter of its height, or on a quick flick,
   * it leaves and closes; otherwise it springs back. With reduced motion the sheet only jumps (no animation).
   * @param {HTMLElement} grip
   */
  function dragToClose(grip) {
    const panel = /** @type {HTMLElement} */ (grip.closest('.bc-dev-tools-menu--panel'));
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let active = false;
    /** @param {PointerEvent} e */
    const down = (e) => {
      active = true;
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      velocity = 0;
      panel.style.transition = 'none';
      grip.setPointerCapture(e.pointerId);
    };
    /** @param {PointerEvent} e */
    const move = (e) => {
      if (!active) return;
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = e.timeStamp;
      panel.style.translate = '0 ' + Math.max(0, e.clientY - startY) + 'px';
    };
    /** @param {PointerEvent} e */
    const up = (e) => {
      if (!active) return;
      active = false;
      const dy = Math.max(0, e.clientY - startY);
      const height = panel.offsetHeight || 1;
      const close = dy > height / 4 || (velocity > 0.5 && dy > 8);
      panel.style.transition = reduced() ? 'none' : close ? 'translate 0.2s ease-in' : 'translate 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2)';
      panel.style.translate = close ? '0 ' + height + 'px' : '0 0';
      if (close) setTimeout(() => (devUi.open = false), reduced() ? 0 : 200);
    };
    grip.addEventListener('pointerdown', down);
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    return {
      destroy() {
        grip.removeEventListener('pointerdown', down);
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
      },
    };
  }

  /** « Journal de navigation » (lib/nav-trace.js): the trace as text, read when the panel opens. */
  let navOpen = $state(false);
  let navText = $state('');
  function openNav() {
    navText = traceText();
    navOpen = true;
  }
  async function copyNav() {
    try {
      await navigator.clipboard.writeText(navText);
      showSnackbar(text.navCopied);
    } catch (e) {
      console.error('Navigation log', e);
      status = failure(e);
    }
  }
  async function shareNav() {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: text.navLog, text: navText });
    } catch (e) {
      // No share sheet here (a browser, the desktop), or the diver closed it: the copy is the other way.
      await copyNav();
    }
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (devUi.open && e.key === 'Escape') devUi.open = false;
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet row(id, icon, title, hint, click, off = false, danger = false)}
  <button type="button" class="bc-dev-tools-menu--action" class:bc-dev-tools-menu--danger={danger} disabled={!!busy || !tools || off} aria-busy={busy === id} onclick={click}>
    <span class="bc-dev-tools-menu--action-icon"><Icon name={icon} size={22} /></span>
    <span class="bc-dev-tools-menu--action-text">
      <span class="bc-dev-tools-menu--action-title">{title}</span>
      <span class="bc-dev-tools-menu--action-hint">{hint}</span>
    </span>
    {#if busy === id}<span class="bc-dev-tools-menu--spinner" aria-hidden="true"></span>{/if}
  </button>
{/snippet}

{#snippet segment(id, index, icon, title, tag)}
  {@const seg = segments[index]}
  <button type="button" role="radio" class="bc-dev-tools-menu--segment" class:bc-dev-tools-menu--segment-on={pillIndex === index} aria-checked={seg.on} disabled={seg.disabled} aria-busy={busy === id} onclick={() => pick(id, index)}>
    {#if busy === id}<span class="bc-dev-tools-menu--spinner" aria-hidden="true"></span>{:else}<Icon name={icon} size={20} />{/if}
    <span class="bc-dev-tools-menu--segment-title">{title}</span>
    {#if tag}<span class="bc-dev-tools-menu--segment-tag">{tag}</span>{/if}
  </button>
{/snippet}

{#if devUi.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="bc-dev-tools-menu" onclick={(e) => e.target === e.currentTarget && (devUi.open = false)}>
    <div class="bc-dev-tools-menu--panel" role="dialog" aria-modal="true" aria-label={text.title}>
      <div class="bc-dev-tools-menu--grip" use:dragToClose aria-hidden="true"><span class="bc-dev-tools-menu--handle"></span></div>
      <header class="bc-dev-tools-menu--head">
        <span class="bc-dev-tools-menu--title">{text.title}</span>
        <span class="bc-dev-tools-menu--tag">DEV</span>
        <button type="button" class="bc-dev-tools-menu--close" aria-label={text.close} onclick={() => (devUi.open = false)}><Icon name="close" size={22} /></button>
      </header>

      {#if status.message}
        <p class="bc-dev-tools-menu--status bc-dev-tools-menu--status-{status.kind}" role="status" aria-live="polite">{status.message}{#if status.detail}<span class="bc-dev-tools-menu--status-detail">{text.failed} · {status.detail}</span>{/if}</p>
      {/if}

      <div class="bc-dev-tools-menu--body">
        <section class="bc-dev-tools-menu--state" aria-live="polite">
          {#if current}
            <div class="bc-dev-tools-menu--state-top">
              <span class="bc-dev-tools-menu--avatar" aria-hidden="true">{initial}</span>
              <div class="bc-dev-tools-menu--state-who">
                {#if current.kind === 'subscribed'}
                  <span class="bc-dev-tools-menu--badge bc-dev-tools-menu--badge-plus"><BenthicPlusChip onLight />{text.subscribed}</span>
                {:else}
                  <span class="bc-dev-tools-menu--badge">{text.free}</span>
                {/if}
                <span class="bc-dev-tools-menu--state-mail">{current.email || text.none}</span>
              </div>
            </div>
            <dl class="bc-dev-tools-menu--facts">
              <dt><Icon name="server" size={16} /></dt>
              <dd>{current.server || '-'}</dd>
              <dt><Icon name="logbook" size={16} /></dt>
              <dd>{logbook.dives.length} {text.dives}</dd>
            </dl>
          {/if}
        </section>

        <section class="bc-dev-tools-menu--section" aria-labelledby="od-dev-s-account">
          <h3 class="bc-dev-tools-menu--heading" id="od-dev-s-account">{text.account}</h3>
          <div class="bc-dev-tools-menu--segments" role="radiogroup" aria-labelledby="od-dev-s-account" style:--bc-dev-segment-index={Math.max(pillIndex, 0)}>
            {#if pillIndex >= 0}<span class="bc-dev-tools-menu--segments-pill" class:bc-dev-tools-menu--segments-pill-slide={slide} aria-hidden="true"></span>{/if}
            {@render segment('out', 0, 'phone', text.toFreeOut, text.toFreeOutTag)}
            {@render segment('keep', 1, 'lock', text.toFreeKeep, text.toFreeKeepTag)}
            {@render segment('sub', 2, 'plusMark', text.toSub, text.toSubTag)}
          </div>
          {#if level >= 0}
            <p class="bc-dev-tools-menu--caption">{[text.toFreeOutHint, text.toFreeKeepHint, text.toSubHint][level]}</p>
          {/if}
        </section>

        <section class="bc-dev-tools-menu--section" aria-labelledby="od-dev-s-trial">
          <h3 class="bc-dev-tools-menu--heading" id="od-dev-s-trial">{text.trial}</h3>
          <div class="bc-dev-tools-menu--group">
            {@render row('new', 'personAdd', text.fresh, text.freshHint, () => run('new', () => tools?.newAccount()))}
            {#if confirming}
              <div class="bc-dev-tools-menu--confirm" role="alertdialog" aria-label={text.delConfirm}>
                <span class="bc-dev-tools-menu--confirm-text"><Icon name="warning" size={20} />{text.delConfirm}</span>
                <button type="button" class="bc-dev-tools-menu--confirm-cancel" disabled={!!busy} onclick={() => (confirming = false)}>{text.cancel}</button>
                <button type="button" class="bc-dev-tools-menu--confirm-yes" disabled={!!busy} aria-busy={busy === 'del'} onclick={() => run('del', () => tools?.deleteAccount())}>{text.delYes}</button>
              </div>
            {:else}
              {@render row('del', 'delete', text.del, !current ? text.delHint : !current.signedIn ? text.noSession : !current.temporary ? text.delOnly : text.delHint, () => (confirming = true), !current?.temporary, true)}
            {/if}
          </div>
        </section>

        <section class="bc-dev-tools-menu--section" aria-labelledby="od-dev-s-first">
          <h3 class="bc-dev-tools-menu--heading" id="od-dev-s-first">{text.first}</h3>
          <div class="bc-dev-tools-menu--group">
            {#if resetOpen}
              <div class="bc-dev-tools-menu--reset" role="alertdialog" aria-label={text.resetTitle}>
                <span class="bc-dev-tools-menu--confirm-text"><Icon name="warning" size={20} />{text.resetTitle}</span>
                <ul class="bc-dev-tools-menu--reset-list">
                  {#each lines as line}
                    <li>{line === 'logbook' ? text.resetLogbook(logbook.dives.length) : line === 'settings' ? text.resetSettings : line === 'session' ? text.resetSession : line === 'equipment' ? text.resetEquipment : line === 'files' ? text.resetFiles : line === 'notifications' ? text.resetNotifications : text.resetAlpha}</li>
                  {/each}
                  {#if !lines.includes('logbook')}<li>{text.resetNothing}</li>{/if}
                </ul>
                <label class="bc-dev-tools-menu--reset-check"><input type="checkbox" bind:checked={keepAlpha} disabled={!!busy} />{text.resetKeepAlpha}</label>
                <p class="bc-dev-tools-menu--caption">{text.resetKept}</p>
                {#if logbook.dives.length}
                  <button type="button" class="bc-dev-tools-menu--confirm-cancel" disabled={!!busy} aria-busy={busy === 'export'} onclick={exportFirst}>{text.resetExport}</button>
                {/if}
                <div class="bc-dev-tools-menu--reset-buttons">
                  <button type="button" class="bc-dev-tools-menu--confirm-cancel" disabled={!!busy} onclick={() => ((resetOpen = false), (resetArmed = false))}>{text.cancel}</button>
                  <button type="button" class="bc-dev-tools-menu--confirm-yes" disabled={!!busy} aria-busy={busy === 'reset'} onclick={resetNow}>{resetArmed ? text.resetAgain : text.resetAll}</button>
                </div>
              </div>
            {:else}
              {@render row('replay', 'refresh', text.replay, text.replayHint, () => (resetOpen = true))}
            {/if}
          </div>
        </section>

        <section class="bc-dev-tools-menu--section" aria-labelledby="od-dev-s-nav">
          <h3 class="bc-dev-tools-menu--heading" id="od-dev-s-nav">{text.nav}</h3>
          <div class="bc-dev-tools-menu--group">
            {#if navOpen}
              <div class="bc-dev-tools-menu--reset" role="group" aria-label={text.navLog}>
                <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                <pre class="bc-dev-tools-menu--trace" tabindex="0">{navText || text.navEmpty}</pre>
                <div class="bc-dev-tools-menu--reset-buttons">
                  <button type="button" class="bc-dev-tools-menu--confirm-cancel" onclick={() => (navOpen = false)}>{text.close}</button>
                  <button type="button" class="bc-dev-tools-menu--confirm-cancel" disabled={!navText} onclick={shareNav}>{text.navShare}</button>
                  <button type="button" class="bc-dev-tools-menu--confirm-yes" disabled={!navText} onclick={copyNav}>{text.navCopy}</button>
                </div>
              </div>
            {:else}
              <button type="button" class="bc-dev-tools-menu--action" onclick={openNav}>
                <span class="bc-dev-tools-menu--action-icon"><Icon name="history" size={22} /></span>
                <span class="bc-dev-tools-menu--action-text">
                  <span class="bc-dev-tools-menu--action-title">{text.navLog}</span>
                  <span class="bc-dev-tools-menu--action-hint">{text.navHint}</span>
                </span>
              </button>
            {/if}
          </div>
        </section>

        <section class="bc-dev-tools-menu--section" aria-labelledby="od-dev-s-alpha">
          <h3 class="bc-dev-tools-menu--heading" id="od-dev-s-alpha">{text.alphaSection}</h3>
          <div class="bc-dev-tools-menu--group">
            {@render row('alpha', 'logbook', text.alpha, current?.alphaFolders === 0 ? text.noAlpha : text.alphaHint, () => run('alpha', () => tools?.importAlphaLogbook()), current?.alphaFolders === 0)}
          </div>
        </section>
        <p class="bc-dev-tools-menu--foot">{text.foot}</p>
      </div>
    </div>
  </div>
{/if}

<style>
  @layer od.components {
    .bc-dev-tools-menu {
      position: fixed;
      inset: 0;
      /* Under the snackbar (Framework7's toast is at 20000): a message must never be hidden by this sheet. */
      z-index: 19000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgb(0 0 0 / 0.45);
    }
    .bc-dev-tools-menu--panel {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 560px;
      max-height: min(100%, 90dvh);
      padding: 8px 16px calc(16px + env(safe-area-inset-bottom));
      border-top: 4px solid var(--bc-dev);
      border-radius: 28px 28px 0 0;
      background: var(--bc-surface);
      color: var(--bc-text);
      box-shadow: 0 -2px 24px rgb(0 0 0 / 0.25);
      animation: od-dev-tools-menu-in 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.1);
    }
    @media (min-width: 768px) {
      .bc-dev-tools-menu {
        align-items: center;
      }
      .bc-dev-tools-menu--panel {
        border-radius: 28px;
        padding-top: 16px;
      }
      .bc-dev-tools-menu--grip {
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
      .bc-dev-tools-menu--panel {
        animation: none;
      }
    }
    .bc-dev-tools-menu--grip {
      display: flex;
      flex: none;
      justify-content: center;
      margin: 0 -16px;
      padding: 8px 0;
      cursor: grab;
      touch-action: none;
    }
    .bc-dev-tools-menu--handle {
      align-self: center;
      flex: none;
      width: 32px;
      height: 4px;
      border-radius: 2px;
      background: var(--bc-text-2);
      opacity: 0.5;
    }
    .bc-dev-tools-menu--head {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: none;
      padding: 4px 0 12px;
    }
    .bc-dev-tools-menu--status-detail {
      display: block;
      margin-top: 2px;
      font-size: 11px;
      opacity: 0.7;
    }
    .bc-dev-tools-menu--action-icon {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--bc-dev-tint);
      color: var(--bc-dev);
    }
    .bc-dev-tools-menu--title {
      min-width: 0;
      overflow: hidden;
      font-size: 19px;
      font-weight: 600;
      line-height: 28px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-dev-tools-menu--tag {
      padding: 1px 7px;
      border: 1.5px solid var(--bc-dev);
      border-radius: 6px;
      background: var(--bc-surface);
      color: var(--bc-dev);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.6px;
    }
    .bc-dev-tools-menu--close {
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
      color: var(--bc-text);
      cursor: pointer;
    }
    .bc-dev-tools-menu--body {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .bc-dev-tools-menu--state {
      box-sizing: border-box;
      flex: none;
      min-height: 72px;
      padding: 16px;
      border: 1.5px dashed var(--bc-dev);
      border-radius: 20px;
      background: var(--bc-surface);
    }
    .bc-dev-tools-menu--state-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .bc-dev-tools-menu--avatar {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--bc-dev-tint);
      color: var(--bc-dev);
      font-size: 24px;
      font-weight: 600;
    }
    .bc-dev-tools-menu--state-who {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      min-width: 0;
    }
    .bc-dev-tools-menu--state-mail {
      max-width: 100%;
      overflow: hidden;
      font-size: 14px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-dev-tools-menu--badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 14px;
      border-radius: 16px;
      background: var(--bc-dev);
      color: var(--bc-on-dev);
      font-size: 15px;
      font-weight: 600;
    }
    .bc-dev-tools-menu--badge-plus {
      padding-left: 4px;
      background: var(--bc-surface-container-high);
      color: var(--bc-text);
    }
    .bc-dev-tools-menu--facts {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 10px;
      align-items: center;
      margin: 14px 0 0;
      padding-top: 12px;
      border-top: 1px solid var(--bc-dev-tint);
      font-size: 14px;
    }
    .bc-dev-tools-menu--facts dt {
      display: inline-flex;
      color: var(--bc-dev);
    }
    .bc-dev-tools-menu--facts dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .bc-dev-tools-menu--heading {
      margin: 0 0 8px 8px;
      color: var(--bc-text-2);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .bc-dev-tools-menu--segments {
      position: relative;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 4px;
      border-radius: 24px;
      background: var(--bc-surface-container-high);
    }
    .bc-dev-tools-menu--segments-pill {
      position: absolute;
      inset: 4px auto 4px 4px;
      width: calc((100% - 16px) / 3);
      border-radius: 20px;
      background: var(--bc-dev);
      transform: translateX(calc(var(--bc-dev-segment-index, 0) * (100% + 4px)));
    }
    .bc-dev-tools-menu--segments-pill-slide {
      transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2);
    }
    .bc-dev-tools-menu--segment {
      position: relative;
      transition: color 0.3s ease;
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
      color: var(--bc-text);
      font: inherit;
      cursor: pointer;
    }
    .bc-dev-tools-menu--segment-on {
      color: var(--bc-on-dev);
      cursor: default;
    }
    .bc-dev-tools-menu--segment:disabled:not(.bc-dev-tools-menu--segment-on):not([aria-busy='true']) {
      opacity: 0.5;
      cursor: default;
    }
    .bc-dev-tools-menu--segment:active:not(:disabled):not(.bc-dev-tools-menu--segment-on) {
      background: var(--bc-surface-container-highest);
    }
    .bc-dev-tools-menu--segment-title {
      max-width: 100%;
      overflow: hidden;
      font-size: 15px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-dev-tools-menu--segment-tag {
      max-width: 100%;
      overflow: hidden;
      font-size: 12px;
      opacity: 0.85;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-dev-tools-menu--caption {
      margin: 8px 8px 0;
      color: var(--bc-text-2);
      font-size: 13px;
      line-height: 18px;
    }
    .bc-dev-tools-menu--group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .bc-dev-tools-menu--action {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 12px 16px 12px 12px;
      border: 0;
      border-radius: 16px;
      background: var(--bc-surface-container-high);
      color: var(--bc-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .bc-dev-tools-menu--action:active:not(:disabled) {
      background: var(--bc-surface-container-highest);
    }
    .bc-dev-tools-menu--action:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .bc-dev-tools-menu--action[aria-busy='true'] {
      opacity: 1;
    }
    .bc-dev-tools-menu--action-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .bc-dev-tools-menu--action-title {
      overflow: hidden;
      font-size: 16px;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bc-dev-tools-menu--action-hint {
      color: var(--bc-text-2);
      font-size: 13px;
      line-height: 18px;
    }
    .bc-dev-tools-menu--danger .bc-dev-tools-menu--action-icon {
      background: var(--bc-alarm-tint);
      color: var(--bc-alarm);
    }
    .bc-dev-tools-menu--danger .bc-dev-tools-menu--action-title {
      color: var(--bc-alarm);
    }
    .bc-dev-tools-menu--spinner {
      flex: none;
      width: 20px;
      height: 20px;
      border: 2.5px solid var(--bc-dev-tint);
      border-top-color: var(--bc-dev);
      border-radius: 50%;
      animation: od-dev-tools-menu-spin 0.8s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-dev-tools-menu--segments-pill-slide,
      .bc-dev-tools-menu--segment {
        transition: none;
      }
    }
    .bc-dev-tools-menu--segment-on .bc-dev-tools-menu--spinner {
      border-color: rgb(255 255 255 / 0.35);
      border-top-color: var(--bc-on-dev);
    }
    @keyframes od-dev-tools-menu-spin {
      to {
        transform: rotate(360deg);
      }
    }
    .bc-dev-tools-menu--status {
      margin: 0 16px 8px;
      padding: 10px 14px;
      border-radius: 16px;
      background: var(--bc-surface-container-high);
      font-size: 14px;
    }
    .bc-dev-tools-menu--status-error {
      outline: 2px solid var(--bc-dev);
    }
    .bc-dev-tools-menu--reset {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      border-radius: 20px;
      background: var(--bc-surface-container-high);
    }
    .bc-dev-tools-menu--reset-list {
      margin: 0;
      padding-left: 20px;
      font-size: 14px;
    }
    .bc-dev-tools-menu--reset-check {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
    }
    .bc-dev-tools-menu--reset-buttons {
      display: flex;
      gap: 8px;
    }
    .bc-dev-tools-menu--reset-buttons button {
      flex: 1;
    }
    .bc-dev-tools-menu--confirm {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--bc-alarm-tint);
    }
    .bc-dev-tools-menu--confirm-text {
      display: flex;
      flex: 1 1 100%;
      align-items: center;
      gap: 8px;
      color: var(--bc-alarm);
      font-weight: 600;
    }
    .bc-dev-tools-menu--confirm-cancel,
    .bc-dev-tools-menu--confirm-yes {
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
    .bc-dev-tools-menu--confirm-cancel {
      background: transparent;
      color: var(--bc-text);
    }
    .bc-dev-tools-menu--confirm-yes {
      background: var(--bc-alarm);
      color: var(--bc-surface);
    }
    .bc-dev-tools-menu--confirm button:disabled {
      opacity: 0.5;
    }
    .bc-dev-tools-menu--foot {
      margin: 0;
      padding: 4px 8px 0;
      color: var(--bc-text-2);
      font-size: 12px;
      line-height: 16px;
      text-align: center;
    }
    /* « Journal de navigation »: the trace, one event a line, scrolled inside its box. */
    .bc-dev-tools-menu--trace {
      max-height: 280px;
      margin: 0;
      padding: 8px;
      overflow: auto;
      border-radius: 8px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: 11px/15px ui-monospace, Menlo, Consolas, monospace;
      white-space: pre;
      user-select: text;
    }
    .bc-dev-tools-menu button:focus-visible {
      outline: 2px solid var(--bc-dev);
      outline-offset: -2px;
    }
  }
</style>
