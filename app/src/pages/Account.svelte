<script>
  // @ts-check
  import { addDeviceDives } from '../lib/account.js';
  // Account screen (docs/mockups/compte-*.dc.html; docs/agent-inbox.md, task
  // 2026-11-06-02): the Subsurface cloud account, or the choices to get one.
  // Change password is shown but not wired yet. Create and sign in open the
  // screens of first launch, whose actions are not built yet.
  import { Page, Navbar, Link, f7, theme } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import Icon from '../components/Icon.svelte';
  import SyncControl from '../components/SyncControl.svelte';
  import MenuButton from '../components/MenuButton.svelte';
  import { bottomNav, layout, ios, deviceKind } from '../lib/layout.svelte.js';
  import { deviceSuffix } from '../lib/first-launch.js';
  import SectionBand from '../components/SectionBand.svelte';
  import BandBackdrop from '../components/BandBackdrop.svelte';
  import { OpenDivesCore } from 'opendives-core';
  import { logbook, setAutoSync, signOut, syncNow, deviceDiveCount } from '../lib/logbook.svelte.js';
  import { showSection } from '../lib/navigation.svelte.js';

  /**
   * Android phone: back to the page Compte was opened over (the account sheet opens it over a
   * section); shown as a section itself (after signing in), back to the Carnet.
   */
  function leave() {
    const router = f7.views.current?.router;
    if (router && router.history.length > 1) router.back();
    else showSection('logbook');
  }
  import { formatDateTime, formatNumber, formatTimeOfDay } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';
  import { isRelease } from '../lib/edition.js';
  import { devAccounts } from '../lib/dev-switch.js';

  const signedIn = $derived(!!logbook.email);
  /** The logbook lives in the user's own git repository, not in the Subsurface cloud. */
  const git = $derived(logbook.mode === 'git');
  /** The git repository is the OpenDives server account's (release edition): named « Serveur OpenDives », not edited. */
  const server = $derived(git && logbook.odplus);
  let serverEmail = $state('');
  $effect(() => {
    if (!server) return;
    OpenDivesCore.serverSessionInfo().then(
      (info) => (serverEmail = info.email),
      (e) => console.error('Reading the OpenDives session', e),
    );
  });

  /** Branch of the connected repository (never its token). */
  let gitBranch = $state('');
  $effect(() => {
    if (!git) return;
    OpenDivesCore.gitConfig().then(
      (saved) => (gitBranch = saved.branch),
      (e) => console.error('Reading the connected repository', e),
    );
  });
  /** "owner/name", then "host · branch main" (spec, section 4, Compte in git mode). */
  const gitName = $derived(logbook.repository.split('/').slice(1).join('/').replace(/\.git$/, ''));
  const gitHost = $derived(logbook.repository.split('/')[0]);

  /** Dives logged on this device without an account, which the account can take (0: none). */
  let deviceCount = $state(0);
  $effect(() => {
    if (signedIn && !logbook.loading) deviceDiveCount().then((n) => (deviceCount = n));
  });
  const count = $derived(logbook.dives.length);

  /** "today, 06:58", or the full date for an older sync. */
  const lastSync = $derived.by(() => {
    if (!logbook.lastSync) return t('account.lastSyncNever');
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return logbook.lastSync.startsWith(today)
      ? t('account.todayAt', { time: formatTimeOfDay(logbook.lastSync) })
      : formatDateTime(logbook.lastSync);
  });

  /** "Connected through the Europe server (ssrf-cloud-eu)": the host actually in use. */
  const serverCaption = $derived.by(() => {
    if (!logbook.server) return '';
    const host = logbook.server.split('.')[0];
    const code = host.match(/^ssrf-cloud-(\w+)$/)?.[1];
    const region = code ? tIfExists(`account.regions.${code}`) : undefined;
    return region ? t('account.server', { region, host }) : t('account.serverHost', { host });
  });

  /** @param {string} s */
  /** The sign-out icon (Icon.svelte « logout ») and a cloud with an upward arrow, for the dialog's HTML. */
  const LOGOUT = 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 16l4-4-4-4M20 12H9';
  const CLOUD_UPLOAD = 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18zM12 15.5v-5M9.75 12.5 12 10.25l2.25 2.25';
  const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

  /**
   * "Sign out" (spec, section 4): always confirmed. With changes not sent, the
   * dialog says so and offers to sync first; deleting the device copy is only
   * possible once everything is sent.
   * @param {MouseEvent} e
   */
  function confirmSignOut(e) {
    e?.preventDefault();
    const pending = logbook.pending;
    const text = pending ? t(server ? 'signOut.textPendingServer' : git ? 'signOut.textPendingGit' : 'signOut.textPending', { n: pending }) : t(server ? 'signOut.textNoneServer' : git ? 'signOut.textNoneGit' : 'signOut.textNone');
    // Android, cloud (task 2026-11-14-165; compte-android-deconnexion.dc.html): the waiting changes
    // in a box of the pending family (od-sign-out-dialog--pending), in place of the sentence.
    const box = pending && !git && !ios;
    const lead = box
      ? `<div class="od-sign-out-dialog--pending">
          <svg class="od-sign-out-dialog--pending-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${CLOUD_UPLOAD}"/></svg>
          <span><strong>${escape(t('signOut.pendingCount', { n: pending }))}</strong><br>${escape(t('signOut.pendingWhen', { n: pending }))}</span>
        </div>`
      : `<p class="od-account--signout-text">${escape(text)}</p>`;
    const content = `
      ${lead}
      <label class="od-account--signout-copy${pending ? ' disabled' : ''}">
        <span class="checkbox"><input type="checkbox"${pending ? ' disabled' : ''}><i class="icon-checkbox"></i></span>
        <span>${escape(t('signOut.deleteCopy'))}${pending ? `<span class="od-account--signout-hint">${escape(t('signOut.deleteCopyHint'))}</span>` : ''}</span>
      </label>`;
    /** @param {any} dialog */
    const deleteCopy = (dialog) => !pending && dialog.$el.find('input[type="checkbox"]')[0]?.checked === true;
    const buttons = pending
      ? [
          { text: t('signOut.syncThenSignOut'), bold: true, onClick: () => syncThenSignOut() },
          { text: t('signOut.signOutAnyway'), onClick: () => runSignOut(false) },
          { text: t('signOut.cancel') },
        ]
      : [
          { text: t('signOut.cancel') },
          { text: t('signOut.confirm'), bold: true, onClick: (/** @type {any} */ dialog) => runSignOut(deleteCopy(dialog)) },
        ];
    const title = escape(t(server ? 'signOut.titleServer' : git ? 'signOut.titleGit' : 'signOut.title'));
    // Android: the Material 3 dialog with icon, the sign-out icon centred over a centred title; iOS keeps its alert.
    const heroTitle = ios ? title : `<svg class="od-sign-out-dialog--icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="${LOGOUT}"/></svg><span>${title}</span>`;
    f7.dialog.create({ title: heroTitle, content, buttons, verticalButtons: pending > 0, cssClass: `od-account--signout${ios ? '' : ' od-sign-out-dialog'}` }).open();
  }

  /** @param {boolean} deleteCopy */
  async function runSignOut(deleteCopy) {
    try {
      await signOut({ deleteCopy });
      showSection('logbook');
    } catch (err) {
      console.error('Signing out', err);
      showSnackbar(t('signOut.failed'));
    }
  }

  async function syncThenSignOut() {
    await syncNow();
    if (logbook.pending > 0) {
      showSnackbar(t('signOut.syncFailed'));
      return;
    }
    await runSignOut(false);
  }

  /** Actions whose behaviour in Subsurface is still to be checked. */
  function notAvailable(/** @type {MouseEvent} */ e) {
    e.preventDefault();
    showSnackbar(t('account.notAvailable'));
  }
</script>

<Page class="od-account">
  <Navbar large={theme.ios && !bottomNav()} class={theme.ios ? 'od-ios-bar' : 'od-band-bar'} title={t('account.title')}>
    {#snippet left()}
      {#if bottomNav()}
        <!-- Android phone: Compte opens from the account sheet, over a section (task 2026-11-14-120). -->
        <Link iconOnly onClick={leave}>
          <i class="icon icon-back"></i>
          <span class="od-sr-only">{t('detail.back')}</span>
        </Link>
      {:else}
        <MenuButton />
      {/if}
    {/snippet}
  </Navbar>

  <!-- Android: the band and its wave stay at the top while the page scrolls, as on Statistics and Tools. -->
  {#if !theme.ios}<BandBackdrop short />{/if}
  <SectionBand bare={!theme.ios} summary={t(signedIn ? (server ? 'account.bandServer' : git ? 'account.bandGit' : 'account.bandSignedIn') : 'account.bandNone')} />

  {#if signedIn}
    <div class="od-account--identity">
      {#if server}
        <span class="od-account--avatar"><Icon name="cloud" size={28} /></span>
        <span class="od-account--text">
          <span class="od-account--name">{t('account.serverName')}</span>
          <span class="od-account--status">{serverEmail}</span>
        </span>
      {:else if git}
        <span class="od-account--avatar"><Icon name="git" size={28} /></span>
        <span class="od-account--text">
          <span class="od-account--name">{gitName}</span>
          <span class="od-account--status">{t('account.gitCaption', { host: gitHost, branch: gitBranch })}</span>
        </span>
      {:else}
        <span class="od-account--avatar"><Icon name="account" size={28} /></span>
        <span class="od-account--text">
          <span class="od-account--name">{logbook.email}</span>
          <span class="od-account--status"><Icon name="cloud" size={16} />{t('account.cloudLine')}</span>
        </span>
      {/if}
    </div>

    <div class="block-title">{t('account.syncGroup')}</div>
    <div class="list list-strong inset list-dividers">
      <ul>
        <li>
          <label class="item-content">
            <div class="item-inner">
              <div class="item-title">
                {t('account.autoSync')}
                <div class="item-footer">{t(logbook.autoSync ? 'account.autoSyncText' : 'account.autoSyncOff')}</div>
              </div>
              <div class="item-after">
                <span class="toggle">
                  <input type="checkbox" checked={logbook.autoSync} onchange={(e) => setAutoSync(e.currentTarget.checked)} />
                  <span class="toggle-icon"></span>
                </span>
              </div>
            </div>
          </label>
        </li>
        {#if !logbook.autoSync}
          <li>
            <div class="item-content">
              <div class="item-inner">
                <div class="item-title">{t('account.pending')}</div>
                <div class="item-after od-value" class:od-account--pending={logbook.pending > 0}>{formatNumber(logbook.pending)}</div>
              </div>
            </div>
          </li>
        {/if}
        <li>
          <div class="item-content">
            <div class="item-inner">
              <div class="item-title">{t('account.lastSync')}</div>
              <div class="item-after od-value">{lastSync}</div>
            </div>
          </div>
        </li>
        <li>
          <div class="item-content">
            <div class="item-inner">
              <div class="item-title">{t(server ? 'account.serverDives' : git ? 'account.gitDives' : 'account.cloudDives')}</div>
              <div class="item-after od-value">{formatNumber(count)}</div>
            </div>
          </div>
        </li>
        {#if deviceCount}
          <li>
            <a href="#device-dives" class="item-link item-content external no-chevron" role="button" onclick={(e) => { e.preventDefault(); addDeviceDives(); }}>
              <div class="item-inner">
                <div class="item-title">
                  {t('account.addDeviceDives')}
                  <div class="item-footer">{t('account.addDeviceDivesText', { n: deviceCount })}</div>
                </div>
              </div>
            </a>
          </li>
        {/if}
        <li class="od-account--sync-now">
          <SyncControl />
        </li>
      </ul>
    </div>

    {#if server}
      <!-- The OpenDives server: the repository is the account's, there is nothing to edit here. -->
    {:else if git && !isRelease}
      <!-- « Modifier le dépôt »: the alpha's. The beta never offers the personal git repository. -->
      <div class="block-title">{t('account.gitGroup')}</div>
      <div class="list list-strong inset list-dividers">
        <ul>
          <li>
            <a href="/account/git" class="item-link item-content" role="button">
              <div class="item-inner">
                <div class="item-title">
                  {t('account.gitEdit')}
                  <div class="item-footer">{t('account.gitEditText')}</div>
                </div>
              </div>
            </a>
          </li>
        </ul>
      </div>
    {:else if !git}
      <div class="block-title">{t('account.subsurfaceGroup')}</div>
      <div class="list list-strong inset list-dividers">
        <ul>
          <li>
            <a href="#password" class="item-link item-content external no-chevron" role="button" onclick={notAvailable}>
              <div class="item-inner">
                <div class="item-title">
                  {t('account.changePassword')}
                  <div class="item-footer">{t('account.changePasswordText')}</div>
                </div>
              </div>
            </a>
          </li>
        </ul>
      </div>
    {/if}

    {#if git}
      <!-- The git repository: signing out only (there is no account to delete); under the group,
           apart from it (tasks 2026-11-14-132 and 133). -->
      <div class="od-account--leave od-account--sign-out">
        <button type="button" class="od-outlined-button" onclick={confirmSignOut}>{t(server ? 'account.serverSignOut' : 'account.gitSignOut')}</button>
        <span class="od-account--consequence">{t(server ? 'account.serverSignOutText' : 'account.gitSignOutText')}</span>
      </div>
      {#if devAccounts && server}
        {#await import('../components/DevDeleteAccount.svelte') then dev}
          {@const DevDeleteAccount = dev.default}
          <DevDeleteAccount email={serverEmail || logbook.email} />
        {/await}
      {/if}
    {:else}
      <!-- « Quitter le cloud » (task 2026-11-14-164): both ways out side by side, so that they are
           compared at a glance. The danger is carried by the alarm colour, the icon and
           « définitivement », not by a heading. Signing out opens a dialog (no chevron); deleting
           opens a page (a chevron). -->
      <h2 class="block-title">{t('account.leaveGroup')}</h2>
      <div class="od-account-leave">
        <button type="button" class="od-account-leave--row od-account-leave--sign-out" aria-haspopup="dialog" onclick={confirmSignOut}>
          <Icon name="logout" size={24} />
          <span class="od-account-leave--texts">
            <span class="od-account-leave--label">{t('account.signOutDevice')}</span>
            <span class="od-account-leave--supporting">{t(`account.signOutKeeps${deviceSuffix(deviceKind())}`)}</span>
          </span>
        </button>
        <button type="button" class="od-account-leave--row od-account-leave--delete" onclick={() => f7.views.current?.router.navigate('/account/delete')}>
          <Icon name="delete" size={24} />
          <span class="od-account-leave--texts">
            <span class="od-account-leave--label">{t('account.delete')}</span>
            <span class="od-account-leave--supporting">{t(`account.deleteKeeps${deviceSuffix(deviceKind())}`)}</span>
          </span>
          <span class="od-account-leave--chevron"><Icon name="chevron" size={20} /></span>
        </button>
      </div>
    {/if}

    {#if serverCaption && !git}<p class="od-account--caption">{serverCaption}</p>{/if}
  {:else}
    <div class="od-account--identity">
      <span class="od-account--avatar"><Icon name="device" size={26} /></span>
      <span class="od-account--text">
        <span class="od-account--name">{t('account.noAccount')}</span>
        <span class="od-account--status">{t('account.deviceDives', { n: count })}</span>
      </span>
    </div>
    <!-- The beta has none of these: no Subsurface cloud, no personal git repository (the OpenDives+ server is signed in to from the first launch). -->
    {#if !isRelease}
    <p class="od-account--pitch">{t('account.pitch')}</p>
    <!-- Three choices, each with its consequence and a decorative icon (task 2026-11-14-135,
         compte-android-sans-compte.dc.html); the git repository is the third, on no background. -->
    <div class="od-account--choices">
      <a href="/account/create" class="od-account--choice od-account--primary">
        <Icon name="personAdd" />
        <span class="od-account--choice-texts">
          <span class="od-account--label">{t('account.create')}</span>
          <span class="od-account--consequence">{t('account.createText', { n: count })}</span>
        </span>
      </a>
      <a href="/account/sign-in" class="od-account--choice">
        <Icon name="login" />
        <span class="od-account--choice-texts">
          <span class="od-account--label">{t('account.signIn')}</span>
          <span class="od-account--consequence">{t('account.signInText', { n: count })}</span>
        </span>
      </a>
      <a href="/account/git/new" class="od-account--choice od-account--third">
        <Icon name="git" />
        <span class="od-account--choice-texts">
          <span class="od-account--label">{t('account.ownGit')}</span>
          <span class="od-account--consequence">{t('account.ownGitText', { n: count })}</span>
        </span>
      </a>
    </div>
    {/if}
  {/if}
</Page>

<style>
  @layer od.components {
    .od-account--identity {
      margin: 16px 16px 0;
      padding: 16px;
      border-radius: 16px;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      gap: 14px;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .od-account--avatar {
      flex: none;
      width: 52px;
      height: 52px;
      border-radius: 26px;
      background: var(--od-surface-2);
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-account--text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .od-account--name {
      font-size: 17px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .od-account--status {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .item-footer {
      white-space: normal;
    }

    /* "Sync": a real button centred in its row (style: .od-tonal-button). */
    .od-account--sync-now {
      padding: 12px 16px 14px;
      display: flex;
      justify-content: center;
    }

    .od-account--pending {
      color: var(--od-tertiary);
    }

    /* Sign-out dialog (outside this page in the document): fully global selectors. */
    :global(.od-account--signout .od-account--signout-text) {
      margin: 0 0 12px;
    }

    :global(.od-account--signout .od-account--signout-copy) {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      text-align: start;
    }

    /* The check box keeps its 18 dp: never shrunk by the text beside it. */
    :global(.od-account--signout .od-account--signout-copy .checkbox) {
      flex: none;
      margin-top: 2px;
    }

    :global(.od-account--signout .od-account--signout-copy.disabled) {
      opacity: 0.55;
    }

    /* Android (task 2026-11-14-165): the icon and the title centred, Material 3 « dialog with icon ». */
    :global(.od-sign-out-dialog .dialog-title) {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
    }

    :global(.od-sign-out-dialog .od-sign-out-dialog--icon) {
      fill: none;
      stroke: var(--od-secondary);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* The waiting changes: a 16 dp box of the pending family (tertiary container, pending text). */
    :global(.od-sign-out-dialog .od-sign-out-dialog--pending) {
      margin: 0 0 12px;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--od-tertiary-container);
      color: var(--od-pending);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      text-align: start;
      font-size: 14px;
      line-height: 20px;

      :global(strong) {
        font-weight: 600;
      }
    }

    :global(.od-sign-out-dialog .od-sign-out-dialog--pending-icon) {
      flex: none;
      margin-top: 1px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* The checkbox: 18 dp in a 48 dp target (MD3). */
    :global(.od-sign-out-dialog .od-account--signout-copy) {
      align-items: center;
      min-height: 48px;
    }

    :global(.od-account--signout .od-account--signout-hint) {
      display: block;
      font-size: 13px;
      color: var(--od-text-2);
    }

    .od-account--leave {
      margin: 0 16px 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;

      .od-account--consequence {
        max-width: 300px;
        font-size: 13px;
        line-height: 18px;
        color: var(--od-text-2);
        text-align: center;
      }
    }

    /* 32 dp between the account group and « Se déconnecter » (task 2026-11-14-133). */
    .od-account--sign-out {
      margin-top: 32px;
    }

    /* « Quitter le cloud »: one card of two list rows (task 2026-11-14-164). */
    .od-account-leave {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .od-account-leave--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 72px;
      padding: 12px 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;

      :global(.od-icon) {
        flex: none;
      }

      & + .od-account-leave--row {
        border-top: 1px solid var(--od-row-divider);
      }

      :global(.ios) & {
        min-height: 60px;
        padding: 10px 16px;
      }
    }

    .od-account-leave--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-account-leave--label {
      font-size: 16px;
      line-height: 24px;

      :global(.ios) & {
        font-size: 17px;
        line-height: 22px;
      }
    }

    .od-account-leave--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    /* Deleting: the alarm colour on the icon and the label, medium weight. */
    .od-account-leave--delete {
      > :global(.od-icon),
      .od-account-leave--label {
        color: var(--od-alarm);
      }

      .od-account-leave--label {
        font-weight: 500;
      }
    }

    .od-account-leave--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    /* The server in use, set apart in small type (task 2026-11-14-134). */
    .od-account--caption {
      margin: 24px 20px;
      font-size: 11px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-account--pitch {
      margin: 18px 20px 0;
      font-size: 16px;
      line-height: 24px;
      color: var(--od-text-2);
    }

    .od-account--choice-texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .od-account--choices {
      margin: 16px 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .od-account--choice {
      padding: 14px 16px;
      border-radius: 20px;
      border: 1px solid var(--od-separator);
      background: var(--od-surface);
      color: var(--od-text);
      text-decoration: none;
      display: flex;
      align-items: flex-start;
      gap: 14px;

      /* The 24 dp icon on the left, aligned with the title. */
      :global(.od-icon) {
        flex: none;
        margin-top: 0;
      }

      /* The git repository: the third choice, on no background. */
      &.od-account--third {
        background: transparent;
      }

      :global(.ios) & {
        border-radius: 10px;
      }

      &.od-account--primary {
        border-color: var(--od-primary-action);
        background: var(--od-primary-action);
        color: var(--od-on-primary-action);

        .od-account--consequence {
          color: inherit;
          opacity: 0.85;
        }
      }
    }

    .od-account--label {
      font-size: 17px;
      font-weight: 700;
    }

    .od-account--consequence {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .od-account--choice {
        transition: box-shadow 120ms linear;
      }
      .od-account--choice:hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .od-account--choice {
        transition: none;
      }
    }
  }
</style>
