<script>
  // @ts-check
  // Download from the dive computer (spec, section 5, "Download": pairing the first time, then one gesture,
  // progress, failure explained), redrawn by tasks 2026-11-23-357 and 358: one tap on « Télécharger » of a computer
  // starts it. The same steps on the Android phone and tablet, the iPhone and the desktop dialog, only the frame
  // changes (`kind`): choice or search, connection, progress, connection lost, nothing new, done, done with a new
  // computer. Over Bluetooth Low Energy and Bluetooth Classic, as Subsurface-mobile on Android.
  //
  // 1. Bluetooth and its permission, asked here and only here.
  // 2. The computers: the remembered ones (Settings, dive computers) and the
  //    devices found by the scan whose name is a dive computer (all of them
  //    with "Show all Bluetooth devices"; their model is then chosen).
  // 3. The download (BenthicCore.downloadDives, Subsurface's own code):
  //    the computer, the progress and the dives received so far. Closing
  //    the screen cancels it.
  // 4. The new dives are one undoable step, shown on the « done » step: « Terminer » goes back to the logbook with
  //    "3 dives downloaded" and "Annuler", « Voir dans le carnet » shows them. A computer not found opens "Download
  //    failed"; a connection lost after it was made stays here (« Connexion perdue »): the dives received are kept
  //    in the logbook and « Réessayer » reads on from where the computer stopped.
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar, Link, List, Popover, theme, f7 } from 'framework7-svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import { confirmedComputer } from '../lib/bluetooth-names.js';
  import { hiddenBluetooth, hideBluetooth, showBluetooth } from '../lib/hidden-bluetooth.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import LoadingIndicator from '../components/LoadingIndicator.svelte';
  import DownloadRing from '../components/DownloadRing.svelte';
  import DownloadDives from '../components/DownloadDives.svelte';
  import { navigation, showSection } from '../lib/navigation.svelte.js';
  import { showDives } from '../lib/filter.svelte.js';
  import { recordDownload, recordOf } from '../lib/download-history.js';
  import { afterDownload, logbook } from '../lib/logbook.svelte.js';
  import { computerOffer, addOfferedComputer, putOffComputer } from '../lib/inventory.svelte.js';
  import { settings, setAppSetting } from '../lib/settings.svelte.js';
  import { layout, desktopApp } from '../lib/layout.svelte.js';
  import { downloadSalinity } from '../lib/tools.js';
  import { errorCode } from '../lib/account.js';
  import { askReviewAfterDownload } from '../lib/review-prompt.js';
  import { addressFor, announceDownload, diveIdsNow, keepReceived, startQuickEntry, lastAttempt, macOf } from '../lib/download.js';
  import { ProgressSmoother } from '../lib/progress-smoothing.js';
  import { formatDateTime, formatInstantDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';
  import DcTile from '../components/DcTile.svelte';

  /** @typedef {import('../lib/download.js').Computer} Computer */
  /** @typedef {import('benthic-core').BluetoothDevice} BluetoothDevice */
  /** @typedef {import('benthic-core').ReceivedDive} ReceivedDive */

  /** @type {{ f7router: any, retry?: boolean }} */
  let { f7router, retry = false } = $props();
  // "Réessayer" of the failure screen: the last attempt again, at once.
  // svelte-ignore state_referenced_locally
  let retryPending = retry;

  /**
   * checking; none (no Bluetooth on this device); permission (to ask),
   * denied, off (Bluetooth off); choose (scan and list; the search screen while nothing is found and no computer
   * is remembered); downloading (the connection, then the progress); finished (the dives, the new computer offer);
   * nothing (no new dive); lost (the connection dropped after it was made).
   * @type {'checking'|'none'|'permission'|'denied'|'off'|'choose'|'downloading'|'finished'|'nothing'|'lost'}
   */
  let phase = $state('checking');
  let scanning = $state(false);
  /** Found devices by MAC address. @type {Record<string, BluetoothDevice>} */
  let found = $state({});
  // svelte-ignore state_referenced_locally
  let forceDownload = $state(retryPending ? lastAttempt.forceDownload : false);
  /** @type {import('benthic-core').BluetoothVendor[]} */
  let models = $state([]);

  /** The download running. @type {Computer|null} */
  let computer = $state(null);
  let connected = $state(false);
  /** Bluetooth Low Energy failed: the second attempt, over Classic. */
  let retrying = $state(false);
  /** Cancel pressed: the core finishes the dive it is reading first. */
  let stopping = $state(false);
  /** The fraction shown, smoothed. */
  let fraction = $state(0);
  const smoother = new ProgressSmoother();
  /** @type {ReceivedDive[]} */
  let received = $state([]);
  let leaving = false;

  /** Choice of the model of a device whose name says nothing. */
  let choosing = $state(/** @type {{ step: 'vendor'|'product', device: BluetoothDevice, vendor: string }|null} */ (null));

  /** @type {{ remove: () => Promise<void> }[]} */
  const listeners = [];

  /** The model's transports, from the core's list. @param {string} vendor @param {string} product */
  function transportsOf(vendor, product) {
    return models.find((m) => m.vendor === vendor)?.products.find((p) => p.name === product) ?? null;
  }

  const remembered = $derived(
    (logbook.prefs.diveComputers ?? [])
      .filter((dc) => dc.vendor && dc.product && dc.device)
      .map((dc) => ({ vendor: dc.vendor, product: dc.product, address: dc.device, name: dc.name })),
  );
  const rememberedMacs = $derived(new Set(remembered.map((c) => macOf(c.address))));
  const nearby = $derived(
    Object.values(found)
      .filter((d) => !rememberedMacs.has(d.mac) && !hiddenBluetooth.addresses.includes(d.mac))
      .filter((d) => d.computer || (settings.showAllBluetooth && d.name))
      .sort((a, b) => Number(!!b.computer) - Number(!!a.computer) || a.name.localeCompare(b.name)),
  );

  const uid = $props.id();
  const deviceMenuId = `bc-download-menu-${uid}`;
  let menuDevice = $state(/** @type {BluetoothDevice|null} */ (null));

  /** @param {MouseEvent} e @param {BluetoothDevice} d */
  function openDeviceMenu(e, d) {
    menuDevice = d;
    f7.popover.open(`#${deviceMenuId}`, /** @type {HTMLElement} */ (e.currentTarget));
  }

  /** "Not a dive computer": hidden for good, undone from the snackbar or in Settings. */
  function hideDevice() {
    f7.popover.close(`#${deviceMenuId}`);
    const d = menuDevice;
    if (!d) return;
    hideBluetooth(d.mac);
    showSnackbar(t('download.hidden', { name: d.computer ? d.computer.product : d.name }), {
      action: t('dialog.cancel'),
      onAction: () => showBluetooth(d.mac),
    });
  }

  /** Bluetooth and its permission, then the scan. */
  async function check() {
    phase = 'checking';
    try {
      const status = await BenthicCore.bluetoothStatus();
      if (status.permission !== 'granted') {
        phase = status.permission === 'denied' ? 'denied' : 'permission';
        return;
      }
      if (status.bluetooth === 'none') phase = 'none';
      else if (status.bluetooth === 'off') phase = 'off';
      else {
        phase = 'choose';
        if (retryPending && lastAttempt.computer) {
          retryPending = false;
          download(lastAttempt.computer);
        } else {
          scan();
        }
      }
    } catch (e) {
      console.error('Bluetooth status', e);
      phase = 'none';
    }
  }

  async function askPermission() {
    try {
      const status = await BenthicCore.requestBluetoothPermission();
      if (status.permission === 'granted') check();
      else phase = 'denied';
    } catch (e) {
      console.error('Bluetooth permission', e);
      phase = 'denied';
    }
  }

  async function turnOn() {
    try {
      await BenthicCore.enableBluetooth();
    } catch (e) {
      console.error('Turning Bluetooth on', e);
    }
    check();
  }

  async function scan() {
    found = {};
    try {
      await BenthicCore.startBluetoothScan({ durationMs: 60000 });
      scanning = true;
    } catch (e) {
      const code = errorCode(e);
      console.error('Bluetooth scan', code);
      scanning = false;
      if (code === 'BLUETOOTH_OFF') phase = 'off';
      else if (code === 'PERMISSION') phase = 'permission';
      else if (code === 'NO_BLUETOOTH') phase = 'none';
    }
  }

  /** A found device: its model when the name tells it, else chosen by the diver. @param {BluetoothDevice} d */
  function pick(d) {
    if (d.computer) {
      const { vendor, product } = d.computer;
      download(withClassic({ vendor, product, name: d.name, address: addressFor(d, transportsOf(vendor, product)) }));
    } else {
      choosing = { step: 'vendor', device: d, vendor: '' };
    }
  }

  /**
   * Over Bluetooth Low Energy, a device also paired as Bluetooth Classic is
   * tried once over Classic when the BLE link fails (Christian's choice):
   * its MAC goes with the request when the model has Classic.
   * @param {Computer} c
   * @returns {Computer}
   */
  function withClassic(c) {
    const d = found[macOf(c.address)];
    const classic = c.address.startsWith('LE:') && d?.classic && transportsOf(c.vendor, c.product)?.classic;
    return classic ? { ...c, classicAddress: d.mac } : c;
  }

  /**
   * `resume`: « Réessayer » after the connection was lost: the dives received before stay on the screen and count
   * with the new ones.
   * @param {Computer} c
   * @param {{ resume?: boolean }} [options]
   */
  async function download(c, { resume = false } = {}) {
    c = withClassic(c);
    computer = c;
    retrying = false;
    lastAttempt.computer = c;
    lastAttempt.forceDownload = forceDownload;
    connected = false;
    stopping = false;
    fraction = 0;
    smoother.reset();
    if (!resume) {
      received = [];
      earlier = 0;
      divesBefore = diveIdsNow();
    }
    phase = 'downloading';
    scanning = false;
    console.info('Download from', c.vendor, c.product, c.address);
    try {
      const result = await BenthicCore.downloadDives({ ...c, forceDownload, defaultSalinity: downloadSalinity(settings.downloadWater) });
      await afterDownload(result);
      if (leaving) return;
      recordDownload(c.address, received.map((d) => d.date));
      // The result stays on the screen: « Terminer » leaves (the quick entry and the message follow), « Voir dans le
      // carnet » shows the new dives. A computer that is not in the equipment yet (Benthic+) is offered on this
      // screen (task 2026-11-19-306).
      finished = result;
      phase = result.downloaded + earlier ? 'finished' : 'nothing';
    } catch (e) {
      const code = errorCode(e);
      console.error('Download', code, /** @type {any} */ (e)?.message);
      await afterDownload(null);
      // The dives received before the failure, offered as Subsurface-mobile does.
      let kept = 0;
      if (code === 'CANCELLED' || code === 'NOT_FOUND' || code === 'FAILED') {
        try {
          kept = (await BenthicCore.downloadPartial({ action: 'count' })).dives;
        } catch (err) {
          console.error('Dives received', err);
        }
      }
      if (leaving) {
        if (kept) BenthicCore.downloadPartial({ action: 'discard' }).catch(() => {});
        return;
      }
      if (code === 'CANCELLED') {
        leaving = true;
        f7router.back();
        if (kept) offerPartial(kept);
        else toast(t('download.cancelled'));
      } else if (code === 'NOT_FOUND') {
        leaving = true;
        f7router.navigate(
          `/download/failed?computer=${encodeURIComponent(c.product)}&reason=notFound&received=${kept}`,
          { reloadCurrent: true },
        );
      } else if (code === 'FAILED') {
        // Connection lost: the dives received are kept in the logbook (as « Garder » did on the failure screen), and
        // « Réessayer » reads on from where the computer stopped.
        if (kept) {
          try {
            await afterDownload(await BenthicCore.downloadPartial({ action: 'keep' }));
            earlier += kept;
          } catch (err) {
            console.error('Keeping the dives received', err);
          }
        }
        phase = 'lost';
      } else if (code === 'BLUETOOTH_OFF' || code === 'PERMISSION') {
        check();
      } else {
        phase = 'choose';
        const key = code === 'WRITE_LOCKED' ? 'edit.writeLocked' : 'download.cannotAdd';
        f7.dialog.create({ title: t('download.title'), text: t(key), buttons: [{ text: t('dialog.ok') }] }).open();
        scan();
      }
    }
  }

  /** Cancelled after some dives arrived: keep them or not (MD3 dialog). @param {number} n */
  function offerPartial(n) {
    f7.dialog
      .create({
        title: t('download.cancelledTitle'),
        text: t('download.cancelledKeep', { n }),
        buttons: [
          {
            text: t('download.dropReceived'),
            onClick: () => {
              BenthicCore.downloadPartial({ action: 'discard' }).catch(() => {});
              toast(t('download.cancelled'));
            },
          },
          { text: t('download.keepReceived', { n }), onClick: () => keepReceived() },
        ],
      })
      .open();
  }

  /** @param {string} text */
  function toast(text) {
    showSnackbar(text);
  }

  /** Back on the logbook after a download: the system may ask for a review, and the toast says what arrived. @param {import('benthic-core').DownloadResult} result */
  function afterSuccess(result) {
    const done = { ...result, downloaded: doneCount };
    if (done.downloaded) setTimeout(() => askReviewAfterDownload({ dives: logbook.dives.length, error: !!logbook.error, conflict: !!logbook.conflict }), 1500);
    // New dives without a site: « Compléter la plongée » first, the message when it closes.
    if (done.downloaded && !startQuickEntry(f7router, done, divesBefore)) announceDownload(done);
  }

  /** The dive ids before the download, to tell the new dives. @type {Set<number>} */
  let divesBefore = new Set();

  /** The download that ended (new dives, or none). @type {import('benthic-core').DownloadResult|null} */
  let finished = $state(null);
  /** Dives of earlier attempts of this download, kept in the logbook after a lost connection. */
  let earlier = $state(0);
  /** Every new dive of this download, those kept before a lost connection included. */
  const doneCount = $derived((finished?.downloaded ?? 0) + earlier);

  async function addComputer() {
    const piece = await addOfferedComputer();
    if (piece) showSnackbar(t('gear.computerOffer.added', { name: piece.name }));
  }

  /** « Voir dans le carnet »: back, then the Logbook shows the new dives only. */
  function seeInLogbook() {
    if (!finished) return;
    const result = finished;
    const added = [...diveIdsNow()].filter((id) => !divesBefore.has(id));
    const ids = added.length ? added : (result.list?.mergedIds ?? []);
    putOffComputer();
    leaving = true;
    f7router.back();
    setTimeout(() => askReviewAfterDownload({ dives: logbook.dives.length, error: !!logbook.error, conflict: !!logbook.conflict }), 1500);
    announceDownload({ ...result, downloaded: doneCount });
    showSection('logbook');
    if (ids.length) showDives(ids, logbook.prefs);
  }

  /** « Tout retélécharger… » of the « nothing new » step: asks first, then reads every dive of the same computer again. */
  function downloadAllAgain() {
    const c = lastAttempt.computer;
    if (!c) return;
    f7.dialog
      .create({
        title: t('download.nothing.confirmTitle'),
        text: t('download.forceAllText'),
        buttons: [
          { text: t('dialog.cancel') },
          {
            text: t('download.nothing.confirmButton'),
            onClick: () => {
              forceDownload = true;
              download(c);
            },
          },
        ],
      })
      .open();
  }

  /** « Réessayer » after the connection was lost. */
  function retryLost() {
    if (lastAttempt.computer) download(lastAttempt.computer, { resume: true });
  }

  function close() {
    if (phase === 'finished' && finished) {
      putOffComputer();
      leaving = true;
      f7router.back();
      afterSuccess(finished);
      return;
    }
    if (phase === 'downloading') {
      // The core stops at its next step (up to a dive's read); the screen
      // closes once it has.
      stopping = true;
      BenthicCore.cancelDownload().catch(() => {});
      return;
    }
    leaving = true;
    f7router.back();
  }

  onMount(async () => {
    navigation.downloadPanes++;
    listeners.push(
      await BenthicCore.addListener('bluetoothDevice', (/** @type {BluetoothDevice} */ d) => {
        found = { ...found, [d.mac]: { ...d, computer: confirmedComputer(d.name, d.computer) } };
      }),
      await BenthicCore.addListener('bluetoothScanStopped', () => {
        scanning = false;
      }),
      await BenthicCore.addListener('downloadProgress', (/** @type {import('benthic-core').DownloadProgress} */ p) => {
        if (p.state === 'retrying') {
          // BLE failed: the dives of the first attempt are read again over Classic.
          retrying = true;
          received = [];
          fraction = 0;
          smoother.reset();
          return;
        }
        connected = p.state === 'connected';
        const now = Date.now();
        smoother.report(p.fraction, now);
        for (let i = 0; i < p.newDives.length; i++) smoother.diveReceived(now);
        fraction = smoother.tick(now);
        if (p.newDives.length) received = [...p.newDives.slice().reverse(), ...received];
      }),
    );
    try {
      models = await BenthicCore.bluetoothModels();
      // The remembered computers as the core holds them now.
      logbook.prefs = await BenthicCore.getPrefs();
    } catch (e) {
      console.error('Bluetooth models', e);
    }
    check();
  });

  // The bar moves on between the core's reports (lib/progress-smoothing.js).
  $effect(() => {
    if (phase !== 'downloading') return;
    const timer = setInterval(() => (fraction = smoother.tick(Date.now())), 250);
    return () => clearInterval(timer);
  });

  onDestroy(() => {
    // Left with Back or the menu while downloading: the download stops.
    const running = phase === 'downloading' && !leaving;
    navigation.downloadPanes--;
    leaving = true;
    for (const l of listeners) l.remove();
    BenthicCore.stopBluetoothScan().catch(() => {});
    if (running) BenthicCore.cancelDownload().catch(() => {});
  });

  const vendorOptions = $derived(models.map((m) => ({ value: m.vendor, label: m.vendor })));
  const chosenVendor = $derived(choosing ? choosing.vendor : '');
  const productOptions = $derived(
    (models.find((m) => m.vendor === chosenVendor)?.products ?? []).map((p) => ({ value: p.name, label: p.name })),
  );
  /** Which device the texts and the frame are for (« le téléphone », « l’iPhone », « la tablette »; the desktop dialog). */
  const kind = $derived(desktopApp ? 'desktop' : layout.split ? 'tablet' : theme.ios ? 'iphone' : 'phone');
  /** Tablet (task 2026-11-19-293): the Bluetooth state is a card under the remembered computers, not the whole screen. */
  const stateBelow = $derived(layout.split && (phase === 'permission' || phase === 'denied' || phase === 'off'));
  const percent = $derived(Math.round(fraction * 100));
  const product = $derived(computer?.product ?? '');

  /** The first time and nothing seen yet: the search step (the desktop dialog lists its sections instead). */
  const searching = $derived(phase === 'choose' && !desktopApp && !remembered.length && !nearby.length);
  /** The connection step: nothing came from the computer yet (the desktop's pairing goes through the system). */
  const connecting = $derived(phase === 'downloading' && !connected && !received.length && !desktopApp);
  /** The steps with a ⋮ menu. */
  const hasMenu = $derived(phase === 'choose');
  /** Leaving at once is « Annuler » while a choice or a download is open, « Fermer » once it ended. */
  const closeText = $derived(phase === 'finished' || phase === 'nothing' || phase === 'lost' ? t('download.close') : t('download.cancel'));
  const showActions = $derived(phase === 'downloading' || phase === 'finished' || phase === 'nothing' || phase === 'lost');

  /** The dives of the list, newest first; once they are in the logbook, with their number. */
  const diveRows = $derived.by(() => {
    const numbers = new Map(phase === 'finished' || phase === 'lost' ? logbook.dives.filter((d) => !divesBefore.has(d.id)).map((d) => [d.date, d.number]) : []);
    return received.map((d, i) => ({ key: `${d.date}-${i}`, ...d, number: numbers.get(d.date) }));
  });

  /** « Shearwater · dernier téléchargement le … », or the vendor alone before any download from this device. @param {Computer} c */
  function lastLine(c) {
    const record = recordOf(c.address);
    return record ? t('download.lastDownload', { vendor: c.vendor, date: formatInstantDate(Date.parse(record.at)) }) : t('download.vendorBluetooth', { vendor: c.vendor });
  }

  /** « Dernière plongée reçue : … » of the computer just read, when this device knows it. */
  const lastDiveText = $derived.by(() => {
    const date = lastAttempt.computer ? recordOf(lastAttempt.computer.address)?.lastDive : '';
    return date ? t('download.nothing.last', { date: formatDateTime(date) }) : '';
  });

  const moreMenuId = `bc-download-more-${uid}`;
  /** @param {MouseEvent} e */
  function openMore(e) {
    f7.popover.open(`#${moreMenuId}`, /** @type {HTMLElement} */ (e.currentTarget));
  }

  /** « Aide au téléchargement »: what to check, as a numbered list. */
  function openHelp() {
    const steps = [t('download.search.on'), t('download.search.bluetooth'), t(`download.search.near.${kind}`), t('download.search.otherApp')];
    f7.dialog
      .create({
        title: t('download.help'),
        content: `<div class="dialog-text"><ol class="bc-download--help">${steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>`,
        buttons: [{ text: t('download.helpClose') }],
      })
      .open();
  }
</script>

{#snippet avatar(/** @type {string} */ vendor, /** @type {string} */ product, /** @type {number} */ size = 40)}
  {#snippet bluetoothAvatar()}
    <span class="bc-download--avatar" style:--bc-download-avatar="{size}px" aria-hidden="true"><Icon name="bluetooth" size={Math.round(size / 2)} /></span>
  {/snippet}
  <!-- A model with a photo shows it (40 dp tile in the rows, 72 dp on the remembered computer's card); the others keep the Bluetooth circle (tasks 2026-11-19-303). -->
  {#if product}
    <span class="bc-download--photo" aria-hidden="true"><DcTile model={product} {vendor} {size} fallback={bluetoothAvatar} /></span>
  {:else}
    {@render bluetoothAvatar()}
  {/if}
{/snippet}

<Page class="bc-download bc-download--{kind}">
  {#if !desktopApp}
    <Navbar title={t('download.title')}>
      {#snippet left()}
        {#if theme.ios}
          <Link onClick={close}>{closeText}</Link>
        {:else}
          <Link iconOnly onClick={close}>
            <Icon name="close" /><span class="bc-sr-only">{closeText}</span>
          </Link>
        {/if}
      {/snippet}
      {#snippet right()}
        {#if hasMenu}
          <Link iconOnly onClick={openMore}>
            <Icon name={theme.ios ? 'moreCircle' : 'more'} weight={theme.ios ? 1.8 : 4} /><span class="bc-sr-only">{t('download.menu')}</span>
          </Link>
        {/if}
      {/snippet}
    </Navbar>
  {/if}

  {#snippet offerIcon()}
    <span class="bc-download--offer-icon" aria-hidden="true"><Icon name="wristComputer" size={28} weight={1.8} /></span>
  {/snippet}

  {#snippet bluetoothState()}
    <div class="bc-download--state">
      <div class="bc-download--state-icon" aria-hidden="true"><Icon name="bluetooth" size={36} weight={2} /></div>
      <h1>{t(`download.${phase}.title`)}</h1>
      <p>{t(`download.${phase}.text`)}</p>
      <div class="bc-download--state-actions">
        {#if phase === 'permission'}
          <button type="button" class="bc-download--filled" onclick={askPermission}>{t('download.permission.button')}</button>
        {:else if phase === 'denied'}
          <button type="button" class="bc-text-button" onclick={askPermission}>{t('download.denied.again')}</button>
          <button type="button" class="bc-download--filled" onclick={() => BenthicCore.openAppSettings()}>{t('download.denied.button')}</button>
        {:else if phase === 'off'}
          <button type="button" class="bc-download--filled bc-download--filled-blue" onclick={turnOn}>{t('download.off.button')}</button>
        {/if}
      </div>
    </div>
  {/snippet}

  <!-- « Votre ordinateur »: the remembered computer on a large card, its state, and the button that starts the download. -->
  {#snippet mine(/** @type {Computer} */ c, /** @type {boolean} */ interactive)}
    {@const seen = !!found[macOf(c.address)]}
    <div class="bc-download--mine">
      <div class="bc-download--mine-head">
        {@render avatar(c.vendor, c.product, desktopApp ? 48 : 72)}
        <span class="bc-download--texts">
          <span class="bc-download--name">{c.product}</span>
          <span class="bc-download--supporting">{lastLine(c)}</span>
          {#if interactive}
            <span class="bc-download--seen" class:bc-download--seen-ok={seen}>
              <span class="bc-download--dot" aria-hidden="true"></span>{seen ? t('download.inRange') : t('download.notSeen')}
            </span>
          {/if}
        </span>
        {#if interactive && desktopApp}
          <button type="button" class="bc-download--primary" aria-label={t('download.downloadFrom', { name: c.product })} onclick={() => download(c)}>
            <Icon name="download" size={20} />{t('download.action')}
          </button>
        {/if}
      </div>
      {#if interactive && !desktopApp}
        <button type="button" class="bc-download--primary bc-download--primary-block" aria-label={t('download.downloadFrom', { name: c.product })} onclick={() => download(c)}>
          <Icon name="download" size={22} />{t('download.action')}
        </button>
      {/if}
    </div>
  {/snippet}

  {#snippet diveList(/** @type {boolean} */ chip, /** @type {boolean} */ heading = true)}
    {#if received.length}
      {#if heading}<h2 class="bc-download--subheader">{t('download.received')}</h2>{/if}
      <div class="bc-download--dives"><DownloadDives dives={diveRows} prefs={logbook.prefs} {chip} /></div>
    {/if}
  {/snippet}

  {#snippet actions()}
    <div class="bc-download--actions" class:bc-download--actions-bar={!desktopApp}>
      {#if phase === 'downloading'}
        <button type="button" class="bc-outlined-button" disabled={stopping} onclick={close}>{stopping ? t('download.stopping') : t('download.stop')}</button>
      {:else if phase === 'lost'}
        <button type="button" class="bc-download--primary" onclick={retryLost}>{t('download.lost.retry')}</button>
        <button type="button" class="bc-text-button" onclick={close}>{t('download.close')}</button>
      {:else if phase === 'nothing'}
        <button type="button" class="bc-download--primary" onclick={close}>{t('download.end')}</button>
        <button type="button" class="bc-text-button" onclick={downloadAllAgain}>{t('download.forceAllEllipsis')}</button>
      {:else if phase === 'finished'}
        <button type="button" class="bc-download--primary" onclick={seeInLogbook}>{t('download.seeInLogbook')}</button>
        {#if !(desktopApp && computerOffer.computer)}
          <button type="button" class="bc-text-button" onclick={close}>{t('download.end')}</button>
        {/if}
      {/if}
    </div>
  {/snippet}

  <div class={desktopApp ? 'bc-download--dialog' : 'bc-download--frame'}>
    {#if desktopApp}
      <header class="bc-download--dialog-head">
        <h1>{t('download.title')}</h1>
        {#if hasMenu}
          <button type="button" class="bc-icon-button" aria-label={t('download.menu')} onclick={openMore}><Icon name="more" weight={4} /></button>
        {/if}
        <button type="button" class="bc-icon-button" aria-label={closeText} onclick={close}><Icon name="close" /></button>
      </header>
    {/if}

    <div class="bc-download--content" class:bc-download--with-bar={showActions && !desktopApp}>
      {#if phase === 'checking'}
        <div class="bc-download--state" aria-busy="true"></div>
      {:else if stateBelow}
        <p class="bc-download--hint">{t(`download.hint.${kind}`)}</p>
        {#if remembered.length}
          <h2 class="bc-download--subheader">{remembered.length > 1 ? t('download.mineMany') : t('download.mine')}</h2>
          {#each remembered as c (c.address)}{@render mine(c, false)}{/each}
        {/if}
        <div class="bc-download--state-card">
          {@render bluetoothState()}
        </div>
      {:else if phase === 'none' || phase === 'permission' || phase === 'denied' || phase === 'off'}
        {@render bluetoothState()}
      {:else if searching}
        <!-- First time, nothing found yet: pulsing rings around a Bluetooth disc and the three things to do. -->
        <div class="bc-download--center">
          <DownloadRing size={200}><span class="bc-download--bt-disc"><Icon name="bluetooth" size={40} /></span></DownloadRing>
          <h1 class="bc-download--title">{t('download.search.title')}</h1>
          <p class="bc-download--text">{t('download.search.text')}</p>
          <ol class="bc-download--steps">
            {#each ['on', 'bluetooth', 'near'] as step, i (step)}
              <li>
                <span class="bc-download--number" aria-hidden="true">{i + 1}</span>
                <span>{step === 'near' ? t(`download.search.near.${kind}`) : t(`download.search.${step}`)}</span>
              </li>
            {/each}
          </ol>
          <button type="button" class="bc-text-button" onclick={openHelp}>{t('download.search.missing')}</button>
          {#if !scanning}<button type="button" class="bc-text-button" onclick={scan}>{t('download.searchAgain')}</button>{/if}
        </div>
      {:else if phase === 'choose'}
        <p class="bc-download--hint">{t(`download.hint.${kind}`)}</p>
        {#if forceDownload}<p class="bc-download--force" role="status">{t('download.forceOn')}</p>{/if}

        {#if remembered.length}
          <h2 class="bc-download--subheader">{remembered.length > 1 ? t('download.mineMany') : t('download.mine')}</h2>
          {#each remembered as c (c.address)}{@render mine(c, true)}{/each}
        {/if}

        <h2 class="bc-download--subheader">
          {desktopApp ? t('download.bluetoothNearby') : t('download.others')}
          {#if scanning}{#if theme.ios}<span class="bc-download--spinner" role="status" aria-label={t('download.searching')}></span>{:else}<LoadingIndicator size={20} label={t('download.searching')} />{/if}{/if}
        </h2>
        {#if nearby.length}
          <ul class="bc-download--rows">
            {#each nearby as d (d.mac)}
              <li class="bc-download--nearby">
                <div class="bc-download--row">
                  {@render avatar(d.computer?.vendor ?? '', d.computer?.product ?? '')}
                  <span class="bc-download--texts">
                    <span class="bc-download--headline">{d.computer ? d.computer.product : d.name}</span>
                    <span class="bc-download--supporting">
                      {d.computer ? t('download.vendorBluetooth', { vendor: d.computer.vendor }) : t('download.unknownModel')}
                    </span>
                  </span>
                  {#if d.computer}
                    <button type="button" class="bc-tonal-button" aria-label={t('download.downloadFrom', { name: d.computer.product })} onclick={() => pick(d)}>{t('download.action')}</button>
                  {:else}
                    <button type="button" class="bc-outlined-button" onclick={() => pick(d)}>{t('download.chooseModel')}</button>
                  {/if}
                </div>
                <button type="button" class="bc-download--more" aria-label={t('download.moreFor', { name: d.computer ? d.computer.product : d.name })} onclick={(e) => openDeviceMenu(e, d)}><Icon name="more" weight={4} /></button>
              </li>
            {/each}
          </ul>
          <Popover id={deviceMenuId} class="bc-menu" backdrop={false}>
            <List noChevron>
              <MenuItem icon="visibilityOff" text={t('download.notAComputer')} onclick={hideDevice} />
            </List>
          </Popover>
        {:else}
          <p class="bc-download--empty">{scanning ? t('download.searching') : t('download.noneFound')}</p>
        {/if}
        {#if !scanning}
          <div class="bc-download--again"><button type="button" class="bc-outlined-button" onclick={scan}>{t('download.searchAgain')}</button></div>
        {/if}
      {:else if connecting}
        <!-- Connection: the computer's picture in pulsing rings; the system's pairing dialog shows over it the first time. -->
        <div class="bc-download--center">
          <DownloadRing size={200}>{@render avatar(computer?.vendor ?? '', product, 88)}</DownloadRing>
          <h1 class="bc-download--title">{product ? t('download.connect.title', { product }) : t('download.connect.titleNoName')}</h1>
          {#if kind !== 'desktop'}<p class="bc-download--text">{t(`download.connect.pairing.${kind}`)}</p>{/if}
        </div>
      {:else if phase === 'downloading'}
        <div class="bc-download--center">
          <DownloadRing value={fraction} percent={fraction > 0 ? `${percent} %` : ''} label={t('download.progressLabel')} size={200}>
            {@render avatar(computer?.vendor ?? '', product, 72)}
          </DownloadRing>
          <h1 class="bc-download--title">{received.length ? t('download.progress.received', { n: received.length }) : t('download.progress.none')}</h1>
          <p class="bc-download--text">
            {#if product}
              {forceDownload ? t('download.progress.readingAll', { product }) : t('download.progress.reading', { product })}
            {:else}
              {t('download.progress.readingNoName')}
            {/if}
          </p>
          <p class="bc-download--text">{t(`download.keepNear.${kind}`)}</p>
          {#if retrying}<p class="bc-download--retrying" role="status">{t('download.retryingClassic')}</p>{/if}
        </div>
        {@render diveList(true)}
      {:else if phase === 'lost'}
        <div class="bc-download--center">
          <span class="bc-download--disc bc-download--disc-alarm" aria-hidden="true"><Icon name="bluetoothOff" size={40} /></span>
          <h1 class="bc-download--title">{t('download.lost.title')}</h1>
          <p class="bc-download--text">{earlier ? t('download.lost.text', { n: earlier }) : t('download.lost.text.none')}</p>
        </div>
        {@render diveList(false)}
      {:else if phase === 'nothing'}
        <div class="bc-download--center">
          <span class="bc-download--disc bc-download--disc-neutral" aria-hidden="true"><Icon name="checkCircle" size={40} /></span>
          <h1 class="bc-download--title">{t('download.nothing.title')}</h1>
          <p class="bc-download--text">{product ? t('download.nothing.text', { product }) : t('download.nothing.textNoName')}</p>
          {#if lastDiveText}<p class="bc-download--text">{lastDiveText}</p>{/if}
        </div>
      {:else if phase === 'finished'}
        <div class="bc-download--center">
          <span class="bc-download--disc bc-download--disc-ok" aria-hidden="true"><Icon name="check" size={40} weight={2.4} /></span>
          <h1 class="bc-download--title">{t('download.doneTitle', { n: doneCount })}</h1>
          <p class="bc-download--text">{product ? t('download.doneText', { product }) : t('download.doneTextNoName')}</p>
        </div>

        {#if computerOffer.computer}
          <div class="bc-download--offer" role="group" aria-label={t('gear.computerOffer.title', { name: product })}>
            <div class="bc-download--offer-head">
              <DcTile model={computerOffer.computer.model} size={56} radius={12} fallback={offerIcon} />
              <span class="bc-download--texts">
                <span class="bc-download--offer-title">{t('gear.computerOffer.title', { name: product })}</span>
                <span class="bc-download--supporting">{t('gear.computerOffer.text')}</span>
              </span>
            </div>
            <div class="bc-download--offer-actions">
              <button type="button" class="bc-download--offer-later" onclick={putOffComputer}>{t('gear.computerOffer.later')}</button>
              <button type="button" class="bc-download--offer-add" onclick={addComputer}>{t('gear.computerOffer.add')}</button>
            </div>
          </div>
        {/if}
        {@render diveList(false, false)}
      {/if}
    </div>

    {#if desktopApp && showActions}
      <footer class="bc-download--dialog-foot">{@render actions()}</footer>
    {/if}
  </div>

  {#if hasMenu}
    <!-- The ⋮ menu (the iPhone's pull-down menu): « Tout retélécharger » is only here, no longer a row of the screen. -->
    <Popover id={moreMenuId} class="bc-menu" backdrop={false}>
      <List noChevron>
        <MenuItem icon="refresh" text={t('download.forceAll')} supporting={forceDownload ? t('download.menuOn') : ''} onclick={() => (forceDownload = !forceDownload)} />
        <MenuItem icon="visibility" text={t('download.showAll')} supporting={settings.showAllBluetooth ? t('download.menuOn') : ''} onclick={() => setAppSetting('showAllBluetooth', !settings.showAllBluetooth)} />
        <MenuItem icon="info" text={t('download.help')} onclick={openHelp} />
      </List>
    </Popover>
  {/if}

  {#snippet fixedContent()}
    {#if showActions && !desktopApp}{@render actions()}{/if}
  {/snippet}
</Page>

{#if choosing?.step === 'vendor'}
  <ChoiceDialog
    title={t('download.chooseVendor')}
    options={vendorOptions}
    value=""
    oncancel={() => (choosing = null)}
    onselect={(vendor) => {
      if (choosing && vendor) choosing = { ...choosing, step: 'product', vendor };
    }}
  />
{:else if choosing?.step === 'product'}
  <ChoiceDialog
    title={t('download.chooseProduct', { vendor: choosing.vendor })}
    options={productOptions}
    value=""
    oncancel={() => (choosing = null)}
    onselect={(product) => {
      const c = choosing;
      choosing = null;
      if (c && product)
        download({ vendor: c.vendor, product, name: c.device.name, address: addressFor(c.device, transportsOf(c.vendor, product)) });
    }}
  />
{/if}

<style>
  @layer bc.components {
    /* MD3 lists (Android): 14 sp subheaders, two-line 72 dp items with a
       40 dp leading avatar; iOS keeps the same order with its sizes. */
    /* The frame. Phone: the page itself. Tablet (task 2026-11-23-358): the content centred in a 640 dp column, the bottom
       buttons in a 420 dp column, a 72 dp top bar. Desktop: a 640 px dialog (28 px corners, at most 820 px high). */
    :global(.bc-download--tablet) {
      --f7-navbar-height: 72px;
    }

    .bc-download--content {
      box-sizing: border-box;
      padding-bottom: 24px;
    }

    :global(.bc-download--tablet) .bc-download--content {
      max-width: 640px;
      margin-inline: auto;
    }

    .bc-download--with-bar {
      padding-bottom: calc(168px + var(--f7-safe-area-bottom, 0px));
    }

    .bc-download--actions {
      display: flex;
      gap: 8px;
    }

    .bc-download--actions-bar {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      z-index: 10;
      box-sizing: border-box;
      width: min(100% - 32px, 420px);
      margin-inline: auto;
      padding-bottom: calc(24px + var(--f7-safe-area-bottom, 0px));
      display: grid;
      justify-items: stretch;

      > button {
        justify-content: center;
        text-align: center;
      }
    }

    :global(.bc-download--desktop) {
      :global(.page-content) {
        background: linear-gradient(var(--bc-scrim), var(--bc-scrim)), var(--bc-background);
        box-sizing: border-box;
        height: 100%;
        padding: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
    }

    .bc-download--dialog {
      box-sizing: border-box;
      width: 640px;
      max-width: 100%;
      max-height: min(820px, 100%);
      display: flex;
      flex-direction: column;
      border-radius: 28px;
      background: var(--bc-dialog);
      overflow: hidden;

      .bc-download--content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-bottom: 8px;
      }
    }

    .bc-download--dialog-head {
      flex: none;
      min-height: 72px;
      padding: 0 16px 0 24px;
      display: flex;
      align-items: center;
      gap: 4px;

      h1 {
        flex: 1;
        margin: 0;
        font-size: 24px;
        line-height: 32px;
        font-weight: 400;
      }
    }

    .bc-download--dialog-foot {
      flex: none;
      padding: 16px 24px 24px;

      .bc-download--actions {
        flex-direction: row-reverse;
        justify-content: flex-start;
        align-items: center;
      }
    }

    /* Hint under the bar, then sections. */
    .bc-download--hint {
      margin: 16px 16px 8px;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);

      :global(.ios) & {
        font-size: 15px;
        line-height: 20px;
      }
    }

    .bc-download--force {
      margin: 0 16px 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text);
    }

    .bc-download--subheader {
      margin: 16px 0 0;
      padding: 0 16px;
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      color: var(--bc-text-2);

      :global(.ios) & {
        min-height: 0;
        margin: 24px 16px 6px;
        padding: 0;
        font-size: 13px;
        font-weight: 400;
      }
    }

    /* « Votre ordinateur »: a large white card (28 dp corners; 10 pt on iPhone). */
    .bc-download--mine {
      margin: 0 16px;
      padding: 16px;
      border-radius: 28px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;

      :global(.ios) & {
        border-radius: 12px;
      }

      :global(.bc-download--desktop) & {
        border-radius: 16px;
        padding: 16px;
        background: var(--bc-surface);
      }
    }

    .bc-download--mine-head {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .bc-download--name {
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;

      :global(.ios) & {
        font-size: 20px;
        line-height: 25px;
        font-weight: 600;
      }

      :global(.bc-download--desktop) & {
        font-size: 18px;
        line-height: 24px;
      }
    }

    .bc-download--seen {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-download--seen-ok {
      color: var(--bc-text);
    }

    .bc-download--dot {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      background: var(--bc-text-2);
      opacity: 0.6;

      .bc-download--seen-ok & {
        background: var(--bc-status-ok);
        opacity: 1;
      }
    }

    /* The button that starts the download: filled, 56 dp (50 pt on iPhone, 48 px on the desktop). */
    .bc-download--primary {
      flex: none;
      width: auto;
      height: 48px;
      padding: 0 24px;
      border: none;
      border-radius: 24px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.1px;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;

      &:disabled {
        opacity: 0.5;
      }

      :global(.ios) & {
        height: 50px;
        border-radius: 12px;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: 0;
      }
    }

    .bc-download--primary-block {
      width: 100%;
      height: 56px;
      border-radius: 28px;
      font-size: 16px;

      :global(.ios) & {
        height: 50px;
        border-radius: 12px;
      }
    }

    @media (hover: hover) and (pointer: fine) {
      .bc-download--primary:not(:disabled):hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }

    /* The other computers: a row with its own button. */
    .bc-download--rows {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;

      :global(.ios) & {
        margin: 0 16px;
        gap: 0;
        border-radius: 12px;
        background: var(--bc-surface);
        overflow: hidden;
      }
    }

    .bc-download--nearby {
      margin: 0 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      display: flex;
      align-items: center;

      :global(.ios) & {
        margin: 0;
        border-radius: 0;
      }
    }

    .bc-download--row {
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      min-height: 72px;
      padding: 8px 0 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--bc-text);
    }

    .bc-download--more {
      flex: none;
      width: 48px;
      height: 48px;
      margin-inline-end: 4px;
      padding: 0;
      border: none;
      background: none;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .bc-download--photo {
      display: contents;
    }

    .bc-download--avatar {
      flex: none;
      width: var(--bc-download-avatar, 40px);
      height: var(--bc-download-avatar, 40px);
      border-radius: 50%;
      background: var(--bc-surface-2);
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;

      /* Android: the computer icon in tertiary. */
      :global(.md) & {
        background: var(--bc-tertiary-container);
        color: var(--bc-tertiary);
      }
    }

    .bc-download--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-download--headline {
      font-size: 16px;
      line-height: 24px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .bc-download--supporting {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);

      :global(.ios) & {
        font-size: 13px;
        line-height: 18px;
      }
    }

    .bc-download--retrying {
      margin: 8px 0 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-download--empty {
      margin: 0 16px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-download--again {
      margin: 12px 16px 0;
    }

    /* The centred steps: search, connection, progress, connection lost, nothing new, done. */
    .bc-download--center {
      margin: 24px 24px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
    }

    .bc-download--title {
      margin: 16px 0 0;
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;

      :global(.ios) & {
        font-size: 28px;
        line-height: 34px;
        font-weight: 700;
      }
    }

    .bc-download--text {
      margin: 0;
      max-width: 420px;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);

      :global(.ios) & {
        font-size: 17px;
        line-height: 22px;
      }
    }

    .bc-download--bt-disc,
    .bc-download--disc {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-download--bt-disc {
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }

    .bc-download--disc-alarm {
      background: var(--bc-alarm-tint);
      color: var(--bc-alarm);
    }

    .bc-download--disc-ok {
      background: var(--bc-status-ok);
      color: var(--bc-background);
    }

    .bc-download--disc-neutral {
      background: var(--bc-secondary-container);
      color: var(--bc-on-secondary-container);
    }

    .bc-download--steps {
      margin: 16px 0 8px;
      padding: 0;
      list-style: none;
      text-align: start;
      max-width: 420px;

      li {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 8px 0;
        font-size: 16px;
        line-height: 24px;
      }
    }

    .bc-download--number {
      flex: none;
      width: 24px;
      height: 24px;
      border-radius: 12px;
      background: var(--bc-tint);
      color: var(--bc-on-tint);
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-download--dives {
      margin: 0 16px;
    }

    :global(.bc-download--help) {
      margin: 0;
      padding: 0 0 0 20px;
      text-align: start;
    }

    .bc-download--spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--bc-separator);
      border-top-color: var(--bc-text);
      border-radius: 50%;
      animation: bc-download-spin 0.9s linear infinite;
    }


    /* « Ajouter le … à votre équipement ? »: a pale blue card, the photo, two lines, « Plus tard » and « Ajouter ». */
    .bc-download--offer {
      margin: 16px 16px 0;
      padding: 16px;
      border-radius: 20px;
      background: var(--bc-release-note);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-download--offer-head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .bc-download--offer-title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
      color: var(--bc-text);
    }

    .bc-download--offer-icon {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-surface);
      color: var(--bc-text-2);
    }

    .bc-download--offer-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .bc-download--offer-later,
    .bc-download--offer-add {
      width: auto;
      height: 40px;
      border: none;
      border-radius: 20px;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-download--offer-later {
      padding: 0 16px;
      background: transparent;
      color: var(--bc-secondary);
    }

    .bc-download--offer-add {
      padding: 0 20px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }

    /* Empty and error states (spec, section 6). */
    .bc-download--state {
      margin: 24px 24px 0;

      h1 {
        margin: 16px 0 8px;
        font-size: 24px;
        line-height: 32px;
        font-weight: 400;

        :global(.ios) & {
          font-size: 28px;
          line-height: 34px;
          font-weight: 700;
        }
      }

      p {
        margin: 0;
        font-size: 16px;
        line-height: 24px;
        color: var(--bc-text-2);
      }
    }

    .bc-download--state-card {
      margin: 16px 16px 0;
      padding: 8px 0 24px;
      border-radius: 16px;
      background: var(--bc-surface-container);

      .bc-download--state {
        margin: 16px 16px 0;
      }
    }

    /* The same on every device: the white icon centred in a 72 dp blue disc, whatever the state. */
    .bc-download--state-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      margin: 0 auto;
      border-radius: 50%;
      background: var(--bc-bluetooth-disc);
      color: var(--bc-on-bluetooth-disc);
    }

    .bc-download--state-actions {
      margin-top: 24px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    /* MD3 filled button; iOS large filled button. */
    .bc-download--filled {
      flex: none;
      width: auto;
      height: 40px;
      padding: 0 24px;
      border: none;
      border-radius: 20px;
      background: var(--bc-primary-action);
      color: var(--bc-on-primary-action);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;

      :global(.ios) & {
        height: 50px;
        border-radius: 12px;
        font-size: 17px;
        font-weight: 600;
      }
    }

    /* « Activer le Bluetooth »: the blue filled button on every device (task 2026-11-23-353). */
    .bc-download--filled-blue {
      background: var(--bc-bluetooth-action);
      color: var(--bc-on-bluetooth-action);
    }

    @keyframes bc-download-spin {
      to {
        transform: rotate(360deg);
      }
    }
  }

  /* The desktop dialog is centred on the whole window, not in the detail pane of the logbook (Framework7 places a detail page
     beside the list; its rules are not in a layer, so this one is not either). */
  :global(.view-master-detail > .page-master-detail.bc-download--desktop) {
    inset: 0;
    width: 100%;
    z-index: 1000;
  }
</style>
