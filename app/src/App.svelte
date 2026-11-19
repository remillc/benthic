<script>
  // @ts-check
  // Main navigation (spec, section 3). Phone layout: a top bar on each screen
  // and a side menu with the four sections and Settings. Tablet layout: the
  // iPad sidebar or the Android rail and, in the Logbook, the list and the
  // dive side by side from `splitBreakpoint` (Framework7's master-detail).
  import { onMount } from 'svelte';
  import { App, Views, View, f7, f7ready } from 'framework7-svelte';
  import Logbook from './pages/Logbook.svelte';
  import DiveDetail from './pages/DiveDetail.svelte';
  import Placeholder from './pages/Placeholder.svelte';
  import Settings from './pages/Settings.svelte';
  import PaneEmpty from './pages/PaneEmpty.svelte';
  import Account from './pages/Account.svelte';
  import WelcomeStart from './pages/WelcomeStart.svelte';
  import WelcomeEntry from './pages/WelcomeEntry.svelte';
  import { isRelease } from './lib/edition.js';
  import Sites from './pages/Sites.svelte';
  import Statistics from './pages/Statistics.svelte';
  import StatisticsResult from './pages/StatisticsResult.svelte';
  import StatisticsDives from './pages/StatisticsDives.svelte';
  import Tools from './pages/Tools.svelte';
  import NavRail from './components/NavRail.svelte';
  import DesktopLogbook from './pages/DesktopLogbook.svelte';
  import DesktopStatistics from './pages/DesktopStatistics.svelte';
  import DesktopTools from './pages/DesktopTools.svelte';
  import DesktopSelection from './pages/DesktopSelection.svelte';
  import DesktopLogbookStart from './components/DesktopLogbookStart.svelte';
  import DesktopFirstLaunch from './components/DesktopFirstLaunch.svelte';
  import AdaptivePage from './components/AdaptivePage.svelte';
  import { logbookToNarrow, settingsToNarrow, settingsToWide, statisticsToNarrow, statisticsToWide, toolsToNarrow, toolsToWide } from './lib/adaptive-handoff.js';
  import DesktopSites from './pages/DesktopSites.svelte';
  import RouteBadge from './components/RouteBadge.svelte';
  import { devAccounts } from './lib/dev-switch.js';
  /** Development aid: the address of the page on screen (app/.env.local, VITE_SHOW_ROUTE=1). */
  // The route badge, for development builds: shown when app/.env.local (not in git) sets
  // VITE_SHOW_ROUTE=1, on the development server and in the APKs built here. A release is
  // built without these switches (AGENTS.md, Conventions).
  const showRoute = /** @type {any} */ (import.meta).env?.VITE_SHOW_ROUTE === '1';
  import NavMenu from './components/NavMenu.svelte';
  import NavigationBar from './components/NavigationBar.svelte';
  import AccountSheet from './components/AccountSheet.svelte';
  import AccountManageDialog from './components/AccountManageDialog.svelte';
  import BackupDialog from './components/BackupDialog.svelte';
  import SyncFailureSheet from './components/SyncFailureSheet.svelte';
  import ConflictHost from './components/ConflictHost.svelte';
  import QrReceived from './components/QrReceived.svelte';
  import ValidationConfirm from './components/ValidationConfirm.svelte';
  import { connection } from './lib/online.svelte.js';
  import { flushQueue, loadValidations, refreshPending } from './lib/validation.svelte.js';
  import { odplusAccount } from './lib/odplus-state.svelte.js';
  import FileImportProgress from './components/FileImportProgress.svelte';
  import Welcome from './components/Welcome.svelte';
  import DemoHost from './components/DemoHost.svelte';
  import { accountGuard } from './lib/demo.svelte.js';
  import { layout, ios, listWidth, splitBreakpoint, bottomNav, desktopApp, desktopMac, settingsWindow, profileWindow, sideWindow } from './lib/layout.svelte.js';
  import { logbooks, noLogbook, enableLogbookCommands } from './lib/desktop-logbooks.svelte.js';
  import DesktopAccountSheet from './components/DesktopAccountSheet.svelte';
  import { releaseModalListeners } from './lib/f7-modal-cleanup.js';
  import { startDesktopShell } from './lib/desktop-shell.js';
  import { navigation } from './lib/navigation.svelte.js';
  import { enableRouterGuard } from './lib/router-guard.js';
  import { trackSection, enableSectionSwipes, enableFullSwipeBack } from './lib/navigation.svelte.js';
  import { applyMotionTokens } from './lib/motion.js';
  import { TAP_SLOP } from './lib/tap.js';
  import { enableBackButton } from './lib/back-button.js';
  import { followContrast } from './lib/contrast.js';
  import { OpenDivesCore } from 'opendives-core';
  import { App as CapacitorApp } from '@capacitor/app';
  import { enableDialogFit } from './lib/dialog-fit.js';
  import { enableTopBarScroll } from './lib/top-bar.js';
  import { enableDeepLinks } from './lib/open-link.js';
  import { startFlightReminder } from './lib/flight-reminder.svelte.js';
  import { enableAccessibility } from './lib/accessibility.js';
  import { enableDetailPageCleanup } from './lib/detail-pages.js';
  import { enableModalCleanup } from './lib/modal-cleanup.js';
  import { schedulePreparingSiteMaps } from './lib/site-image.js';
  import { logbook, isSubscriber } from './lib/logbook.svelte.js';
  import { loadOdplusAccount } from './lib/odplus-state.svelte.js';
  import { rememberHero, heroOf } from './lib/profile-frame.js';
  import { resumePendingImport } from './lib/desktop-pending-import.js';
  import { t } from './lib/i18n.js';
  import { lazyRoute, stylesheetsReady } from './lib/lazy-route.js';
  import { mark } from './lib/perf.js';
  import { settings } from './lib/settings.svelte.js';
  import MapsDialogs from './components/MapsDialogs.svelte';
  import ErrorReportHost from './components/ErrorReportHost.svelte';
  import { noteLog } from './lib/error-report.js';
  import { startOfflineMaps } from './lib/offline-maps.svelte.js';

  /**
   * A route whose page is its own chunk, loaded when the route is first opened (not with the first screen).
   * `props` are the page's props. A page that a master-detail view shows beside its list (detailRoutes) and the
   * roots of the sections stay in the main chunk.
   * @param {() => Promise<{ default: any }>} load
   * @param {Record<string, any>} [props]
   */
  const lazy = lazyRoute;

  // Addresses: a resource has no trailing slash, a collection has one (AGENTS.md).
  const appRoutes = [
    { path: '/dives/new', ...lazy(() => import('./pages/NewDive.svelte')) },
    { path: '/filter', ...lazy(() => import('./pages/Filter.svelte')) },
    { path: '/filter/:key', ...lazy(() => import('./pages/FilterCriterion.svelte')) },
    { path: '/add/:what', ...lazy(() => import('./pages/AddUnavailable.svelte')) },
    { path: '/download', ...lazy(() => import('./pages/Download.svelte')) },
    // iPhone: the dives of an Apple Watch Ultra from Apple Health (to-do #67).
    { path: '/health', ...lazy(() => import('./pages/HealthImport.svelte')) },
    { path: '/download/failed', ...lazy(() => import('./pages/DownloadFailed.svelte')) },
    // Desktop app from 1200 dp: Réglages as categories with a search, and À propos as a dialog
    // (task 2026-11-15-202); else the phone's pages.
    { path: '/settings/', ...(settingsWindow ? { component: Settings, options: { props: { desk: true, windowed: true } } } : { component: AdaptivePage, options: { props: { wide: Settings, narrow: Settings, wideProps: { desk: true }, narrowProps: { desk: false } } } }) },
    { path: '/about', async: async (/** @type {{ resolve: Function }} */ { resolve }) => {
      const { default: About } = await import('./pages/About.svelte');
      await stylesheetsReady();
      resolve(layout.desktop ? { popup: { component: About } } : { component: About });
    },
    },
    { path: '/about/notes', ...lazy(() => import('./pages/AboutText.svelte'), { which: 'notes' }) },
    { path: '/about/licence', ...lazy(() => import('./pages/AboutText.svelte'), { which: 'licence' }) },
    { path: '/about/privacy', ...lazy(() => import('./pages/AboutText.svelte'), { which: 'privacy' }) },
    { path: '/about/libraries', ...lazy(() => import('./pages/AboutLibraries.svelte')) },
    { path: '/settings/bailout', ...lazy(() => import('./pages/SettingsBailout.svelte')) },
    { path: '/settings/computers/', ...lazy(() => import('./pages/LogbookComputers.svelte')) },
    { path: '/settings/computers/edit', ...lazy(() => import('./pages/LogbookComputer.svelte')) },
    { path: '/settings/cylinders/', ...lazy(() => import('./pages/CylinderTypes.svelte')) },
    { path: '/settings/cylinders/new', ...lazy(() => import('./pages/CylinderType.svelte')) },
    { path: '/settings/cylinders/type', ...lazy(() => import('./pages/CylinderType.svelte')) },
    // Offline maps: the list, adding a region (a rectangle drawn on the map).
    { path: '/settings/maps/', ...lazy(() => import('./pages/SettingsMaps.svelte')) },
    { path: '/settings/maps/area', ...lazy(() => import('./pages/SettingsMapsArea.svelte')) },
    // Release edition: « Mon profil de plongeur » and the equipment inventory (task 2026-11-17-267).
    ...(isRelease
      ? [
          { path: '/profile', ...lazy(() => import('./pages/ProfileDiver.svelte')) },
          { path: '/profile/gear/', ...lazy(() => import('./pages/ProfileGear.svelte')) },
          { path: '/profile/gear/new', ...lazy(() => import('./pages/ProfilePieceEdit.svelte')) },
          { path: '/profile/gear/retired/', ...lazy(() => import('./pages/ProfileRetired.svelte')) },
          { path: '/profile/gear/:id', ...lazy(() => import('./pages/ProfilePiece.svelte')) },
          { path: '/profile/gear/:id/edit', ...lazy(() => import('./pages/ProfilePieceEdit.svelte')) },
          { path: '/profile/gear/:id/edit-computer', ...lazy(() => import('./pages/ProfileComputerEdit.svelte')) },
          { path: '/profile/gear/:id/maintenance', ...lazy(() => import('./pages/ProfilePieceMaintenance.svelte')) },
          { path: '/profile/gear/:id/maintenance/note', ...lazy(() => import('./pages/ProfileMaintenanceNote.svelte')) },
          { path: '/profile/maintenance/', ...lazy(() => import('./pages/ProfileMaintenance.svelte')) },
          { path: '/profile/info', ...lazy(() => import('./pages/ProfileInfo.svelte')) },
          { path: '/profile/info/edit', ...lazy(() => import('./pages/ProfileInfoEdit.svelte')) },
          { path: '/profile/emergency', ...lazy(() => import('./pages/EmergencySheet.svelte')) },
          { path: '/profile/emergency/content', ...lazy(() => import('./pages/EmergencyContent.svelte')) },
          { path: '/profile/certs/', ...lazy(() => import('./pages/ProfileCerts.svelte')) },
          { path: '/profile/certs/new', ...lazy(() => import('./pages/ProfileCertEdit.svelte')) },
          { path: '/profile/certs/:id', ...lazy(() => import('./pages/ProfileCert.svelte')) },
          { path: '/profile/certs/:id/edit', ...lazy(() => import('./pages/ProfileCertEdit.svelte')) },
          { path: '/profile/documents/new/:kind', ...lazy(() => import('./pages/ProfileDocumentEdit.svelte')) },
          { path: '/profile/documents/:id', ...lazy(() => import('./pages/ProfileDocument.svelte')) },
          { path: '/profile/documents/:id/edit', ...lazy(() => import('./pages/ProfileDocumentEdit.svelte')) },
          { path: '/profile/kits/new', ...lazy(() => import('./pages/ProfileKit.svelte')) },
          { path: '/profile/kits/:id', ...lazy(() => import('./pages/ProfileKit.svelte')) },
        ]
      : []),
    { path: '/account', component: Account },
    { path: '/account/backup', ...lazy(() => import('./pages/AccountBackup.svelte')) },
    { path: '/account/backup/version/:id', ...lazy(() => import('./pages/AccountBackupVersion.svelte')) },
    { path: '/account/backup/dive/', ...lazy(() => import('./pages/AccountBackupDive.svelte')) },
    { path: '/account/backup/dive/:key', ...lazy(() => import('./pages/AccountBackupDive.svelte')) },
    { path: '/account/backup/deleted/', ...lazy(() => import('./pages/AccountBackupDeleted.svelte')) },
    { path: '/account/backup/browse/:id', ...lazy(() => import('./pages/AccountBackupBrowse.svelte')) },
    { path: '/account/manage', ...lazy(() => import('./pages/AccountManage.svelte')) },
    { path: '/account/delete', ...lazy(() => import('./pages/DeleteAccount.svelte')) },
    // Signing in and creating an account, from the Account screen without an account.
    // The Subsurface cloud (sign in, create an account) is the alpha's: the beta never opens that logbook.
    ...(isRelease
      ? []
      : [
          { path: '/account/sign-in', ...lazy(() => import('./pages/SignIn.svelte')), beforeEnter: accountGuard },
          { path: '/account/create', ...lazy(() => import('./pages/CreateAccount.svelte')), beforeEnter: accountGuard },
          { path: '/account/code', ...lazy(() => import('./pages/ConfirmCode.svelte')) },
        ]),
    { path: '/account/import', ...lazy(() => import('./pages/BringLogbook.svelte')), beforeEnter: accountGuard },
    { path: '/account/importing', ...lazy(() => import('./pages/ImportProgress.svelte')) },
    // The logbook in the user's own git repository (Modifier le dépôt) is the alpha's: the beta never offers to open a
    // logbook in a personal git repository (nor, on its first launch, in a cloud drive); the OpenDives server does not
    // use these pages.
    ...(isRelease
      ? []
      : [
          { path: '/account/git', ...lazy(() => import('./pages/GitRepository.svelte'), { edit: true }), beforeEnter: accountGuard },
          { path: '/account/git/token', ...lazy(() => import('./pages/TokenHelp.svelte')) },
          { path: '/account/git/repository', ...lazy(() => import('./pages/RepositoryHelp.svelte')) },
          // Without an account (task 2026-11-14-135): the same setup, then this device's dives sent there.
          { path: '/account/git/new', ...lazy(() => import('./pages/GitRepository.svelte')) },
        ]),
    // First launch, in the view of its popup (components/Welcome.svelte).
    // The release edition has its own first launch (pages/WelcomeEntry.svelte); the alpha keeps WelcomeStart.
    { path: '/welcome', component: isRelease ? WelcomeEntry : WelcomeStart },
    ...(isRelease
      ? []
      : [
          { path: '/welcome/sign-in', ...lazy(() => import('./pages/SignIn.svelte'), { welcome: true }) },
          { path: '/welcome/create', ...lazy(() => import('./pages/CreateAccount.svelte'), { welcome: true }) },
          { path: '/welcome/code', ...lazy(() => import('./pages/ConfirmCode.svelte'), { welcome: true }) },
          { path: '/welcome/downloading', ...lazy(() => import('./pages/FirstDownload.svelte')) },
        ]),
    { path: '/welcome/local', ...lazy(() => import('./pages/WithoutAccount.svelte')) },
    { path: '/welcome/import', ...lazy(() => import('./pages/BringLogbook.svelte')) },
    { path: '/welcome/importing', ...lazy(() => import('./pages/ImportProgress.svelte')) },
    ...(isRelease
      ? []
      : [
          { path: '/welcome/git', ...lazy(() => import('./pages/GitRepository.svelte'), { welcome: true }) },
          { path: '/welcome/git/token', ...lazy(() => import('./pages/TokenHelp.svelte')) },
          { path: '/welcome/git/repository', ...lazy(() => import('./pages/RepositoryHelp.svelte')) },
          // Phone: the repository's logbook comes down on the download screen (task 2026-11-16-247).
          { path: '/welcome/git/downloading', ...lazy(() => import('./pages/FirstDownload.svelte')) },
        ]),
    // « Faire valider la plongée » (task 2026-11-19-309): the choice, the signature and the QR code, one full screen.
    { path: '/validate', ...lazy(() => import('./pages/Validate.svelte')) },
    // Phone: a full screen. Tablet: a sheet (iPad) or a pane (Android) over the
    // list and the dive, chosen when the screen opens (EditDive.svelte).
    {
      path: '/dives/:id/edit',
      async: async (/** @type {{ resolve: Function }} */ { resolve }) => {
        const { default: EditDive } = await import('./pages/EditDive.svelte');
        resolve(!layout.rail ? { component: EditDive } : { popup: { component: EditDive } });
      },
    },
    // « Modifier ensemble… » on the checked dives (?ids=1,2,3): the same kind of screen.
    {
      path: '/dives/edit-together',
      async: async (/** @type {{ resolve: Function }} */ { resolve }) => {
        const { default: EditDivesTogether } = await import('./pages/EditDivesTogether.svelte');
        resolve(!layout.rail ? { component: EditDivesTogether } : { popup: { component: EditDivesTogether } });
      },
    },
    // « Compléter la plongée »: the quick entry after a download (task 2026-11-14-151), a full screen.
    { path: '/dives/:id/complete', ...lazy(() => import('./pages/QuickEntry.svelte')) },
    // A dive opened from another section (site, tools) or from a trip: the
    // same screen, without the master-detail routing of the Logbook, which
    // would put a second Logbook in the history.
    { path: '/dives/:id', component: DiveDetail },
    { path: '/trips/:id', ...lazy(() => import('./pages/Trip.svelte')) },
    { path: '/trips/:trip/dives/:id', component: DiveDetail },
    // Planned dives, and a saved plan reopened.
    { path: '/plans/', ...lazy(() => import('./pages/Plans.svelte')) },
    { path: '/plans/:id', ...lazy(() => import('./pages/Planner.svelte'), { reopen: true }) },
    // The planner: /plan/new for a new dive, /plan/<dive id> from a logbook dive.
    // The planner's settings, a screen of their own (task 2026-11-08-01, to-do #3 U3).
    { path: '/settings/planner', ...lazy(() => import('./pages/PlannerSettings.svelte')) },
    { path: '/plan/:id', ...lazy(() => import('./pages/Planner.svelte')) },
    // Desktop app from 1200 dp: the sites as a table beside the map (task 2026-11-15-171); else the phone's screen.
    { path: '/sites/', component: AdaptivePage, options: { props: { wide: DesktopSites, narrow: Sites } } },
    { path: '/sites/without/', ...lazy(() => import('./pages/DivesWithoutSite.svelte')) },
    { path: '/sites/without-site/:diveId', ...lazy(() => import('./pages/DiveNoSiteProfile.svelte')) },
    { path: '/sites/cleanup', ...lazy(() => import('./pages/SitesCleanup.svelte')) },
    // « Choisir un site » (task 2026-11-14-151): lib/site-choice.js.
    { path: '/sites/choose', ...lazy(() => import('./pages/SiteChoose.svelte')) },
    { path: '/sites/unplaced/', ...lazy(() => import('./pages/SitesUnplaced.svelte')) },
    { path: '/sites/new', ...lazy(() => import('./pages/SiteEdit.svelte')) },
    { path: '/sites/:uuid', ...lazy(() => import('./pages/SiteSheet.svelte')) },
    { path: '/sites/:uuid/edit', ...lazy(() => import('./pages/SiteEdit.svelte')) },
    { path: '/statistics/', component: Statistics },
    { path: '/statistics/result', component: StatisticsResult },
    { path: '/statistics/dives/', component: StatisticsDives },
    // Android: a full-screen dialog; iPhone: a sheet (the popup pushes the view back).
    {
      path: '/statistics/new',
      async: async (/** @type {{ resolve: Function }} */ { resolve }) => resolve({ popup: { component: (await import('./pages/StatisticNew.svelte')).default } }),
    },
    // Desktop app from 1200 dp: the tools list and the chosen tool side by side (task 2026-11-15-196).
    { path: '/tools/', component: AdaptivePage, options: { props: { wide: DesktopTools, narrow: Tools, toWide: (/** @type {any} */ r) => toolsToWide(r, '/tools/'), toNarrow: (/** @type {any} */ r) => toolsToNarrow(r, '/tools/') } } },
    { path: '/tools/desaturation', ...lazy(() => import('./pages/Desaturation.svelte')) },
    { path: '/tools/ead-mod', ...lazy(() => import('./pages/GasEadMod.svelte')) },
    { path: '/tools/best-mix', ...lazy(() => import('./pages/GasBestMix.svelte')) },
    { path: '/tools/blender', ...lazy(() => import('./pages/GasBlender.svelte')) },
    // A subpage of Réglages (task 2026-11-13-111): last, after every /settings/<name> route above.
    { path: '/settings/:section', component: Settings },
  ];

  /**
   * The Logbook view's routes: the Logbook is the master of a master-detail
   * pair, so a dive (/dives/<id>) opens beside the list on a wide enough
   * tablet, and full screen otherwise. Only this view has it, before the
   * other routes; /dives/new comes first, or it would be taken for a dive.
   */
  /** The detail pane emptied, back to its first view (pages/PaneEmpty.svelte, to-do #33). */
  const PANE_EMPTY = { path: '/pane/empty', component: PaneEmpty };

  const logbookRoutes = [
    appRoutes[0],
    {
      path: '/',
      // Desktop app from 1200 dp: the logbook as a table (task 2026-11-15-169); else the list.
      component: AdaptivePage,
      options: { props: { wide: DesktopLogbook, narrow: Logbook, toNarrow: logbookToNarrow } },
      master: true,
      detailRoutes: [{ path: '/dives/:id', component: DiveDetail }, { path: '/pane/selection', component: DesktopSelection }, PANE_EMPTY],
    },
    ...appRoutes,
  ];

  /**
   * The Statistics view's routes (tablet): the list of statistics is the
   * master, a result opens beside it (as the Logbook, above).
   */
  const statisticsRoutes = [
    {
      path: '/statistics/',
      // Desktop app from 1200 dp: the list and the chart of the chosen statistic on one page
      // (task 2026-11-15-171), not a master with a detail beside it; else the tablet's list.
      component: AdaptivePage,
      options: { props: { wide: DesktopStatistics, narrow: Statistics, toWide: statisticsToWide, toNarrow: statisticsToNarrow } },
      master: true,
      detailRoutes: [
        { path: '/statistics/result', component: StatisticsResult },
        { path: '/statistics/dives/', component: StatisticsDives },
        PANE_EMPTY,
      ],
    },
    ...appRoutes,
  ];

  /**
   * The Account view's routes (tablet): Réglages opens there (lib/navigation.svelte.js,
   * openOver), its overview the master, a subpage beside it (task 2026-11-13-111).
   */
  const accountRoutes = [
    {
      path: '/settings/',
      // Desktop app: Réglages is one page with its categories (task 2026-11-15-202); below, a master with a detail.
      component: AdaptivePage,
      options: { props: { wide: Settings, narrow: Settings, wideProps: { desk: true }, narrowProps: { desk: false }, toWide: settingsToWide, toNarrow: settingsToNarrow } },
      master: true,
      detailRoutes: [{ path: '/settings/:section', component: Settings }, PANE_EMPTY],
    },
    ...appRoutes,
  ];

  /** Width of the list beside a result (Statistics), from the tablet mock-ups. Tools has no
      list pane since task 2026-11-14-122: its page takes the width, a tool opens over it. */
  const statisticsListWidth = ios ? 420 : 400;

  const f7params = {
    name: 'OpenDives',
    theme: ios ? 'ios' : 'md',
    // Settings, Display, Theme: the device's, or light or dark.
    darkMode: settings.theme === 'system' ? 'auto' : settings.theme === 'dark',
    // Framework7 derives its palette from --od-action (theme.css); the mapped
    // variables in theme.css then take precedence.
    colors: { primary: getComputedStyle(document.documentElement).getPropertyValue('--od-action').trim() },
    // A fingertip tap moves a little: past 5 px (Framework7's default) the tap
    // was dropped, so a button or a menu entry did nothing now and then.
    touch: { touchClicksDistanceThreshold: TAP_SLOP },
    // Framework7's own dialog buttons are in English.
    dialog: { buttonOk: t('dialog.ok'), buttonCancel: t('dialog.cancel') },
    // A screen with a back arrow goes back with a swipe to the right, from
    // anywhere on it (not only from the edge); the page follows the finger.
    // Not where the swipe already means something: the dive detail (previous
    // dive), the map, the profile, the wheels (class no-swipeback).
    view: {
      mdSwipeBack: true,
      iosSwipeBack: true,
      mdSwipeBackActiveArea: 10000,
      iosSwipeBackActiveArea: 10000,
      // From anywhere, the gesture must not take a tap whose finger slid a little.
      mdSwipeBackThreshold: TAP_SLOP,
      iosSwipeBackThreshold: TAP_SLOP,
      // On Android the pages only slide, like the sections (enableFullSwipeBack).
      mdSwipeBackAnimateOpacity: false,
      mdSwipeBackAnimateShadow: false,
    },
    routes: appRoutes,
    // Framework7 leaves a swipeable sheet's or popup's app listeners behind when it is destroyed.
    on: { modalBeforeDestroy: releaseModalListeners },
  };

  // Each time the logbook is loaded, the maps of its new sites are prepared.
  $effect(() => {
    if (logbook.dives.length) schedulePreparingSiteMaps();
  });

  // Desktop app: the dives the first launch brought are imported once the new logbook it made is open (task 2026-11-16-228).
  $effect(() => {
    if (desktopApp && !noLogbook && !sideWindow && !logbook.loading && !logbook.welcome && !logbook.error) void resumePendingImport();
  });

  // Dive validations (task 2026-11-19-309): read the records; once online and signed in, send the confirmations this phone
  // queued offline and ask the server about the validations still waiting.
  $effect(() => {
    if (!odplusAccount.signedIn || !odplusAccount.subscribed) return;
    const online = connection.online;
    void loadValidations().then(() => (online ? Promise.all([flushQueue(), refreshPending()]) : undefined)).catch((e) => console.error('Validations', e));
  });

  // The bottom bar on screen: the content, the « + » and the snackbar make room for it (theme.css).
  $effect(() => {
    document.documentElement.classList.toggle('od-bottom-nav-on', bottomNav() && navigation.atRoot);
    document.documentElement.classList.toggle('od-bottom-nav', bottomNav());
  });

  // The Mac's menu item « Mon profil de plongeur… » is on while the diver has OpenDives+; the separate profile window
  // reads the diver's line from the device's store (task 2026-11-18-277).
  $effect(() => {
    if (!desktopMac || sideWindow) return;
    const on = isSubscriber();
    /** @type {any} */ (window).odDesktop.setProfileAvailable?.(on);
    if (on) rememberHero(heroOf(logbook));
  });

  onMount(() => {
    applyMotionTokens();
    // The OpenDives+ account of the device (signed in, subscribed), whatever the place of the logbook.
    void loadOdplusAccount();
    // The desktop app's shortcuts and text size; the Mac's Réglages window stops there (task 2026-11-15-202).
    startDesktopShell();
    if (sideWindow) {
      enableDialogFit(f7);
      return;
    }
    // Dialog buttons stacked when they do not fit on one line (task 2026-11-14-143).
    enableDialogFit(f7);
    f7ready(() => {
      enableRouterGuard(f7);
      f7.on('routeChanged', (/** @type {any} */ to) => noteLog('route', to?.path ?? ''));
    });
    enableBackButton();
    // High contrast when the system asks for more contrast (task 2026-11-14-149).
    followContrast({
      readLevel: () => OpenDivesCore.contrastLevel().then((r) => r.level),
      onResume: (listener) => void CapacitorApp.addListener('resume', listener),
    });
    enableTopBarScroll();
    enableDeepLinks();
    startFlightReminder();
    if (isRelease) {
      // The maintenance notifications follow the reminders: read the inventory once at start so that they are right.
      import('./lib/maintenance-notify.js')
        .then((m) => m.startMaintenanceNotifications())
        .then(() => import('./lib/inventory.svelte.js'))
        .then((m) => m.loadInventory())
        .catch((e) => console.error('Inventory', e));
      // The same for the documents that expire (task 2026-11-19-309).
      import('./lib/document-notify.js')
        .then((m) => m.startDocumentNotifications())
        .catch((e) => console.error('Documents', e));
    }
    enableAccessibility();
    enableDetailPageCleanup();
    enableModalCleanup();
    trackSection();
    enableSectionSwipes();
    enableFullSwipeBack();
    // The settings are applied and the logbook is loaded from main.js, before
    // the screens are built.
    mark('onMount');
    // Offline maps: follows the downloads and checks for updates (at most once a day).
    startOfflineMaps();
    // Several logbooks (task 2026-11-15-173): new, open, close and save a copy, from the keyboard and the Mac's menu bar.
    return enableLogbookCommands();
  });
</script>

{#if sideWindow}
<App {...f7params}>
  <Views class="safe-areas">
    <View id={profileWindow ? 'view-profile-window' : 'view-settings-window'} main url={profileWindow ? '/profile/gear/' : '/settings/'} />
  </Views>
</App>
{:else}
<App {...f7params}>
  <!-- Tablet, both orientations: the rail (Android) or the sidebar (iPad). Android phone: the
       bottom bar; iPhone: the tab bar (task 2026-11-14-127). The account sheet: phones and
       Android tablets (tasks 2026-11-14-120, 126, 127). The ☰ side menu only remains for a
       window between the phone and tablet layouts that has no rail. -->
  {#if layout.rail}<NavRail />{:else if !bottomNav()}<NavMenu />{/if}
  {#if layout.desktop}<DesktopAccountSheet />{:else if bottomNav() || (layout.rail && !ios)}<AccountSheet />{/if}
  {#if bottomNav() && navigation.atRoot}<NavigationBar />{/if}
  <AccountManageDialog />
  {#if layout.desktop}<BackupDialog />{/if}
  <SyncFailureSheet />
  <ErrorReportHost />
  <ConflictHost />
  <QrReceived />
  <ValidationConfirm />
  <FileImportProgress />
  <MapsDialogs />
  {#if showRoute}<RouteBadge />{/if}
  {#if devAccounts}{#await import('./components/DevToolsHost.svelte') then { default: DevToolsHost }}<DevToolsHost />{/await}{/if}
  <Welcome />
  <DemoHost />
  <!-- Desktop: a window with no logbook shows its start screen. The release edition shows « Pour commencer » (task 2026-11-16-228); the new-logbook dialog opens from the selector and the menu bar (task 2026-11-15-173). -->
  {#if desktopApp && noLogbook}{#if isRelease}<DesktopFirstLaunch />{:else}<DesktopLogbookStart />{/if}{/if}
  {#if desktopApp && logbooks.dialog}{#await import('./components/DesktopNewLogbook.svelte') then { default: DesktopNewLogbook }}<DesktopNewLogbook onclose={() => (logbooks.dialog = false)} />{/await}{/if}
  <Views tabs class="safe-areas {layout.rail ? 'od-tablet' : ''}" style="--f7-page-master-width: {listWidth}px; --od-no-dive: '{t('tablet.noDive')}'">
    <View id="view-logbook" main tab tabActive url="/" routes={logbookRoutes} masterDetailBreakpoint={splitBreakpoint} />
    <View id="view-sites" tab url="/sites/" />
    <View
      id="view-statistics"
      tab
      url="/statistics/"
      routes={statisticsRoutes}
      masterDetailBreakpoint={splitBreakpoint}
      style="--f7-page-master-width: {statisticsListWidth}px; --od-no-dive: '{t('tablet.noStatistic')}'"
    />
    <View id="view-tools" tab url="/tools/" />
    <View id="view-account" tab url="/account" routes={accountRoutes} masterDetailBreakpoint={splitBreakpoint} />
  </Views>
</App>
{/if}

<style>
  @layer od.components {
    /* Tablet: the views leave room for the sidebar or the rail (NavRail.svelte). */
    :global(.views.od-tablet) {
      /* The rail or sidebar takes the left safe area (camera cut-out in
         landscape): the pages beside it must not add it again. */
      --f7-safe-area-left: 0px;
      margin-left: calc(var(--od-nav-width) + var(--od-safe-left));
      width: calc(100% - var(--od-nav-width) - var(--od-safe-left));
    }

    /* Logbook, list and dive side by side (Framework7 master-detail). */
    /* Adaptive pages: the desktop layout of a master route fills the view, with no list column's width or border. */
    :global(.view-master-detail .page-master:is(.od-desktop-statistics, .od-desktop-settings)) {
      width: 100%;
      border-right: 0;
    }
    /* ... and no detail pane or empty-pane notice beside it (a detail opened in the tablet layout comes back when the window narrows). */
    :global(.view-master-detail:has(> .page-master:is(.od-desktop-statistics, .od-desktop-settings)) > .page-master-detail:is(.od-settings, .od-statistics-result, .od-statistics-dives, .od-pane-empty, .od-dive-detail, .od-desktop-selection)),
    :global(.view-master-detail:has(> .page-master:is(.od-desktop-statistics, .od-desktop-settings))::after) {
      display: none;
    }
    /* A screen opened over the section (the profile, an equipment piece, About's pages) is a detail page to Framework7 too:
       over the full-width desktop page it takes the whole view. Hidden, it measured 0 wide (bug of 19 November 2026). */
    :global(.view-master-detail:has(> .page-master:is(.od-desktop-statistics, .od-desktop-settings)) > .page-master-detail:not(.od-settings, .od-statistics-result, .od-statistics-dives, .od-pane-empty, .od-dive-detail, .od-desktop-selection)) {
      inset: 0;
      width: 100%;
      z-index: 1000;
    }
    /* ... and it is not a pane's first screen: its Back button stays (nothing else leads back to the page under it). */
    :global(.view-master-detail:has(> .page-master:is(.od-desktop-statistics, .od-desktop-settings)) > .page-master-detail-root:not(.od-settings, .od-statistics-result, .od-statistics-dives, .od-pane-empty, .od-dive-detail, .od-desktop-selection) .navbar .left),
    :global(.view-master-detail:has(> .page-master:is(.od-desktop-statistics, .od-desktop-settings)) > .page-master-detail-root:not(.od-settings, .od-statistics-result, .od-statistics-dives, .od-pane-empty, .od-dive-detail, .od-desktop-selection) .navbar .left .back) {
      display: flex;
    }
    :global(.view-master-detail .page-master-detail) {
      background: var(--od-surface);
    }

    /* Android download panes: the computers are white cards on the page background. */
    :global(.md .view-master-detail .page-master-detail:is(.od-download, .od-download-failed)) {
      background: var(--od-background);

      :global(.navbar-bg) {
        background: var(--od-background);
      }
    }

    /* First screen of the detail pane (what a row of the list opened): no Back button, the list stays on screen.
       The download pages keep their ✕: it closes the task (back to the previous pane).
       A screen opened from inside the pane keeps its ← (lib/pane-history.js). */
    :global(.view-master-detail .page-master-detail-root:not(.od-download, .od-download-failed) .navbar .left .back) {
      display: none;
    }

    /* No ☰ button on a tablet and no Back button beside the list: no empty button bubble (iOS). */
    :global(.views.od-tablet .navbar .left:not(:has(a, button))),
    :global(.view-master-detail .page-master-detail-root:not(.od-download, .od-download-failed) .navbar .left) {
      display: none;
    }

    /* Without a button before it, the title keeps the side margin of the pane. */
    :global(.views.od-tablet .navbar .left:not(:has(a, button)) + .title),
    :global(.view-master-detail .page-master-detail-root:not(.od-download, .od-download-failed) .navbar .left + .title) {
      margin-left: 16px;
    }

    /* The release edition's empty logbook in portrait: the list pane is the whole width, under the band (task 224). */
    @media (orientation: portrait) {
      :global(.view-master-detail:not(:has(.page-master-detail)):has(.od-release-empty)) {
        --f7-page-master-width: 100%;
      }
    }

    /* Nothing chosen yet. */
    :global(.view-master-detail:not(:has(.page-master-detail))::after) {
      content: var(--od-no-dive);
      position: absolute;
      inset: 0 0 0 var(--f7-page-master-width);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--od-surface);
      color: var(--od-text-2);
      font-size: 16px;
      text-align: center;
    }
  }
</style>
