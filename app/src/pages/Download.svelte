<script>
  // @ts-check
  // Download from the dive computer (docs/mockups/ios-telechargement.dc.html;
  // spec, section 5, "Download": pairing the first time, then one gesture,
  // progress, failure explained). Android for now, over Bluetooth Low Energy
  // and Bluetooth Classic, as Subsurface-mobile on Android.
  //
  // 1. Bluetooth and its permission, asked here and only here.
  // 2. The computers: the remembered ones (Settings, dive computers) and the
  //    devices found by the scan whose name is a dive computer (all of them
  //    with "Show all Bluetooth devices"; their model is then chosen).
  // 3. The download (BenthicCore.downloadDives, Subsurface's own code):
  //    the computer, the progress and the dives received so far. Closing
  //    the screen cancels it.
  // 4. The new dives are one undoable step: back to the logbook with "3
  //    dives downloaded" and "Annuler". A failure opens "Download failed".
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar, Link, Button, List, Popover, theme, f7 } from 'framework7-svelte';
  import MenuItem from '../components/MenuItem.svelte';
  import { confirmedComputer } from '../lib/bluetooth-names.js';
  import { hiddenBluetooth, hideBluetooth, showBluetooth } from '../lib/hidden-bluetooth.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import LoadingIndicator from '../components/LoadingIndicator.svelte';
  import LinearWavyProgress from '../components/LinearWavyProgress.svelte';
  import { navigation } from '../lib/navigation.svelte.js';
  import { afterDownload, logbook } from '../lib/logbook.svelte.js';
  import { computerOffer, addOfferedComputer, putOffComputer } from '../lib/inventory.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { layout } from '../lib/layout.svelte.js';
  import { downloadSalinity } from '../lib/tools.js';
  import { errorCode } from '../lib/account.js';
  import { askReviewAfterDownload } from '../lib/review-prompt.js';
  import { addressFor, announceDownload, diveIdsNow, keepReceived, startQuickEntry, lastAttempt, macOf } from '../lib/download.js';
  import { ProgressSmoother } from '../lib/progress-smoothing.js';
  import { formatDateTime, formatDepth, formatDuration } from '../lib/format.js';
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
   * denied, off (Bluetooth off); choose (scan and list); downloading.
   * @type {'checking'|'none'|'permission'|'denied'|'off'|'choose'|'downloading'}
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
  const deviceMenuId = `od-download-menu-${uid}`;
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

  /** @param {Computer} c */
  async function download(c) {
    c = withClassic(c);
    computer = c;
    retrying = false;
    lastAttempt.computer = c;
    lastAttempt.forceDownload = forceDownload;
    connected = false;
    stopping = false;
    fraction = 0;
    smoother.reset();
    received = [];
    phase = 'downloading';
    scanning = false;
    console.info('Download from', c.vendor, c.product, c.address);
    divesBefore = diveIdsNow();
    try {
      const result = await BenthicCore.downloadDives({ ...c, forceDownload, defaultSalinity: downloadSalinity(settings.downloadWater) });
      await afterDownload(result);
      if (leaving) return;
      // A computer that is not in the equipment yet (Benthic+): the screen stays on « Téléchargement terminé » with the
      // card « Ajouter le … à votre équipement ? » (task 2026-11-19-306); closing it leaves as below.
      if (result.downloaded && computerOffer.computer) {
        finished = result;
        phase = 'finished';
        return;
      }
      leaving = true;
      f7router.back();
      afterSuccess(result, c.product);
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
      } else if (code === 'NOT_FOUND' || code === 'FAILED') {
        leaving = true;
        const reason = code === 'NOT_FOUND' ? 'notFound' : 'lost';
        f7router.navigate(
          `/download/failed?computer=${encodeURIComponent(c.product)}&reason=${reason}&received=${kept}`,
          { reloadCurrent: true },
        );
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

  /** Back on the logbook after a download: the system may ask for a review, and the toast says what arrived. @param {import('benthic-core').DownloadResult} result @param {string} product */
  function afterSuccess(result, product) {
    if (result.downloaded) setTimeout(() => askReviewAfterDownload({ dives: logbook.dives.length, error: !!logbook.error, conflict: !!logbook.conflict }), 1500);
    // New dives without a site: « Compléter la plongée » first, the message when it closes.
    if (result.downloaded) {
      if (!startQuickEntry(f7router, result, divesBefore)) announceDownload(result);
    } else toast(t('download.noneNew', { computer: result.product || product }));
  }

  /** The dive ids before the download, to tell the new dives. @type {Set<number>} */
  let divesBefore = new Set();

  /** The download that ended on the offer card. @type {import('benthic-core').DownloadResult|null} */
  let finished = $state(null);

  async function addComputer() {
    const piece = await addOfferedComputer();
    if (piece) showSnackbar(t('gear.computerOffer.added', { name: piece.name }));
  }

  function close() {
    if (phase === 'finished' && finished) {
      putOffComputer();
      leaving = true;
      f7router.back();
      afterSuccess(finished, lastAttempt.computer?.product ?? '');
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
  /** Android: each computer is a card (the iOS look keeps its grouped rows). */
  const card = $derived(!theme.ios);
  /** Tablet (task 2026-11-19-293): the Bluetooth state is a card under the remembered computers, not the whole screen. */
  const stateBelow = $derived(layout.split && (phase === 'permission' || phase === 'denied' || phase === 'off'));
  const percent = $derived(Math.round(fraction * 100));
  /** @param {Computer} c */
  const subtitle = (c) => t('download.vendorBluetooth', { vendor: c.vendor });
</script>

{#snippet avatar(/** @type {string} */ vendor, /** @type {string} */ product)}
  {#snippet bluetoothAvatar()}
    <span class="bc-download--avatar" aria-hidden="true"><Icon name="bluetooth" size={22} /></span>
  {/snippet}
  <!-- A model with a photo shows it (40 dp tile, 48 pt on iPhone); the others keep the Bluetooth circle (tasks 2026-11-19-303). -->
  {#if product}
    <span class="bc-download--photo" aria-hidden="true"><DcTile model={product} {vendor} size={theme.ios ? 48 : 40} fallback={bluetoothAvatar} /></span>
  {:else}
    {@render bluetoothAvatar()}
  {/if}
{/snippet}

<Page class="bc-download">
  <Navbar title={t('download.title')}>
    {#snippet left()}
      {#if theme.ios}
        <Link onClick={close}>{phase === 'downloading' ? t('download.cancel') : t('download.close')}</Link>
      {:else}
        <Link iconOnly onClick={close}>
          <Icon name="close" /><span class="bc-sr-only">{phase === 'downloading' ? t('download.cancel') : t('download.close')}</span>
        </Link>
      {/if}
    {/snippet}
  </Navbar>

  {#snippet offerIcon()}
    <span class="bc-download--offer-icon" aria-hidden="true"><Icon name="wristComputer" size={28} weight={1.8} /></span>
  {/snippet}

  {#snippet bluetoothState()}
    <div class="bc-download--state">
      <div class="bc-download--state-icon" aria-hidden="true"><Icon name="bluetooth" size={32} /></div>
      <h1>{t(`download.${phase}.title`)}</h1>
      <p>{t(`download.${phase}.text`)}</p>
      <div class="bc-download--state-actions">
        {#if phase === 'permission'}
          <button type="button" class="bc-download--filled" onclick={askPermission}>{t('download.permission.button')}</button>
        {:else if phase === 'denied'}
          <button type="button" class="bc-text-button" onclick={askPermission}>{t('download.denied.again')}</button>
          <button type="button" class="bc-download--filled" onclick={() => BenthicCore.openAppSettings()}>{t('download.denied.button')}</button>
        {:else if phase === 'off'}
          <button type="button" class="bc-download--filled" onclick={turnOn}>{t('download.off.button')}</button>
        {/if}
      </div>
    </div>
  {/snippet}

  {#if phase === 'checking'}
    <div class="bc-download--state" aria-busy="true"></div>
  {:else if stateBelow}
    <p class="bc-download--intro">{t('download.intro')} {t('download.pairingNote')}</p>
    {#if remembered.length}
      <h2 class="bc-download--subheader">{t('download.remembered')}</h2>
      <ul class="bc-download--rows bc-download--cards" class:bc-download--card-list={card}>
        {#each remembered as c (c.address)}
          <li>
            <div class="bc-download--row" class:bc-download--card={card}>
              {@render avatar(c.vendor, c.product)}
              <span class="bc-download--texts">
                <span class="bc-download--headline">{c.product}</span>
                <span class="bc-download--supporting">{subtitle(c)}</span>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    <label class="bc-download--switch-row">
      <span class="bc-download--texts">
        <span class="bc-download--headline">{t('download.forceAll')}</span>
        <span class="bc-download--supporting">{t('download.forceAllText')}</span>
      </span>
      <span class="toggle"><input type="checkbox" bind:checked={forceDownload} /><span class="toggle-icon"></span></span>
    </label>
    <div class="bc-download--state-card">
      {@render bluetoothState()}
    </div>
  {:else if phase === 'none' || phase === 'permission' || phase === 'denied' || phase === 'off'}
    {@render bluetoothState()}
  {:else if phase === 'choose'}
    <p class="bc-download--intro">{t('download.intro')} {t('download.pairingNote')}</p>

    {#if remembered.length}
      <h2 class="bc-download--subheader">{t('download.remembered')}</h2>
      <ul class="bc-download--rows bc-download--cards" class:bc-download--card-list={card}>
        {#each remembered as c (c.address)}
          <li>
            <button type="button" class="bc-download--row" class:bc-download--card={card} onclick={() => download(c)}>
              {@render avatar(c.vendor, c.product)}
              <span class="bc-download--texts">
                <span class="bc-download--headline">{c.product}</span>
                <span class="bc-download--supporting">{subtitle(c)}</span>
              </span>
              {#if found[macOf(c.address)]}<span class="bc-download--trailing">{t('download.seen')}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <h2 class="bc-download--subheader">
      {t('download.nearby')}
      {#if scanning}{#if theme.ios}<span class="bc-download--spinner" role="status" aria-label={t('download.searching')}></span>{:else}<LoadingIndicator size={20} label={t('download.searching')} />{/if}{/if}
    </h2>
    {#if nearby.length}
      <ul class="bc-download--rows bc-download--cards" class:bc-download--card-list={card}>
        {#each nearby as d (d.mac)}
          <li class="bc-download--nearby">
            <button type="button" class="bc-download--row" class:bc-download--card={card} onclick={() => pick(d)}>
              {@render avatar(d.computer?.vendor ?? "", d.computer?.product ?? "")}
              <span class="bc-download--texts">
                <span class="bc-download--headline">{d.computer ? d.computer.product : d.name}</span>
                <span class="bc-download--supporting">
                  {d.computer ? t('download.vendorBluetooth', { vendor: d.computer.vendor }) : t('download.unknownModel')}
                </span>
              </span>
            </button>
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

    <label class="bc-download--switch-row">
      <span class="bc-download--texts">
        <span class="bc-download--headline">{t('download.forceAll')}</span>
        <span class="bc-download--supporting">{t('download.forceAllText')}</span>
      </span>
      <span class="toggle">
        <input type="checkbox" bind:checked={forceDownload} />
        <span class="toggle-icon"></span>
      </span>
    </label>
  {:else if phase === 'finished' && computer && finished}
    <h2 class="bc-download--subheader">{t('download.computer')}</h2>
    <div class="bc-download--computer" class:bc-download--card={card}>
      {@render avatar(computer.vendor, computer.product)}
      <span class="bc-download--texts">
        <span class="bc-download--headline">{computer.product}</span>
        <span class="bc-download--supporting">{subtitle(computer)}</span>
      </span>
      <span class="bc-download--connected"><Icon name="check" size={16} weight={2.4} />{t('download.connected')}</span>
    </div>

    <div class="bc-download--progress">
      <div class="bc-download--progress-head">
        <span class="bc-download--headline">{t('download.finished')}</span>
        <span class="bc-download--percent">{t('download.finishedCount', { n: finished.downloaded })}</span>
      </div>
      {#if theme.ios}
        <div class="bc-download--bar" role="progressbar" aria-label={t('download.progressLabel')} aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
          <div class="bc-download--fill" style:width="100%"></div>
        </div>
      {:else}
        <LinearWavyProgress value={1} label={t('download.progressLabel')} />
      {/if}
      {#if computerOffer.computer}<p class="bc-download--hint">{t('download.firstTime', { name: computer.product })}</p>{/if}
    </div>

    {#if computerOffer.computer}
      <div class="bc-download--offer" role="group" aria-label={t('gear.computerOffer.title', { name: computer.product })}>
        <div class="bc-download--offer-head">
          <DcTile model={computerOffer.computer.model} size={56} radius={12} fallback={offerIcon} />
          <span class="bc-download--texts">
            <span class="bc-download--offer-title">{t('gear.computerOffer.title', { name: computer.product })}</span>
            <span class="bc-download--supporting">{t('gear.computerOffer.text')}</span>
          </span>
        </div>
        <div class="bc-download--offer-actions">
          <button type="button" class="bc-download--offer-later" onclick={putOffComputer}>{t('gear.computerOffer.later')}</button>
          <button type="button" class="bc-download--offer-add" onclick={addComputer}>{t('gear.computerOffer.add')}</button>
        </div>
      </div>
    {/if}

    {#if received.length}
      <h2 class="bc-download--subheader">{t('download.receivedAll')}</h2>
      <ul class="bc-download--rows bc-dive-list">
        {#each received as d, i (`${d.date}-${i}`)}
          <li class="bc-download--dive">
            <ProfileThumbnail profile={d.profile} maxDepthMm={d.maxDepthMm} prefs={logbook.prefs} />
            <span class="bc-download--texts">
              <span class="bc-download--headline">{t('download.newDive')}</span>
              <span class="bc-download--supporting">{formatDateTime(d.date)}</span>
            </span>
            <span class="bc-download--values">
              <span class="bc-download--depth">{formatDuration(d.durationSeconds)}</span>
              {#if d.maxDepthMm}<span class="bc-download--supporting">{formatDepth(d.maxDepthMm, logbook.prefs)}</span>{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if phase === 'downloading' && computer}
    <h2 class="bc-download--subheader">{t('download.computer')}</h2>
    <div class="bc-download--computer" class:bc-download--card={card}>
      {@render avatar(computer.vendor, computer.product)}
      <span class="bc-download--texts">
        <span class="bc-download--headline">{computer.product}</span>
        <span class="bc-download--supporting">{subtitle(computer)}</span>
      </span>
      {#if connected}
        <span class="bc-download--connected"><Icon name="check" size={16} weight={2.4} />{t('download.connected')}</span>
      {:else}
        <span class="bc-download--trailing">{t('download.connecting')}</span>
      {/if}
    </div>
    {#if retrying}<p class="bc-download--retrying" role="status">{t('download.retryingClassic')}</p>{/if}

    <div class="bc-download--progress">
      <div class="bc-download--progress-head">
        <span class="bc-download--headline">{forceDownload ? t('download.readingAll') : t('download.reading')}</span>
        {#if fraction > 0}<span class="bc-download--percent">{t('download.percent', { n: percent })}</span>{/if}
      </div>
      {#if theme.ios}
      <div
        class="bc-download--bar"
        class:bc-download--indeterminate={fraction <= 0}
        role="progressbar"
        aria-label={t('download.progressLabel')}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={fraction > 0 ? percent : undefined}
      >
        <div class="bc-download--fill" style:width={fraction > 0 ? `${percent}%` : undefined}></div>
      </div>
      {:else}
        <LinearWavyProgress value={fraction} indeterminate={fraction <= 0} label={t('download.progressLabel')} />
      {/if}
      <p class="bc-download--hint">{t('download.keepNear')}{forceDownload ? '' : ` ${t('download.notAgain')}`}</p>
    </div>

    <div class="bc-download--stop">
      <Button outline disabled={stopping} onClick={close}>{stopping ? t('download.stopping') : t('download.stop')}</Button>
    </div>

    {#if received.length}
      <h2 class="bc-download--subheader">{t('download.received')}</h2>
      <ul class="bc-download--rows bc-dive-list">
        {#each received as d, i (`${d.date}-${i}`)}
          <li class="bc-download--dive">
            <ProfileThumbnail profile={d.profile} maxDepthMm={d.maxDepthMm} prefs={logbook.prefs} />
            <span class="bc-download--texts">
              <span class="bc-download--headline">{t('download.newDive')}</span>
              <span class="bc-download--supporting">{formatDateTime(d.date)}</span>
            </span>
            <span class="bc-download--values">
              {#if theme.ios}
                <span class="bc-download--depth">{formatDepth(d.maxDepthMm, logbook.prefs)}</span>
                <span class="bc-download--supporting">{formatDuration(d.durationSeconds)}</span>
              {:else}
                <!-- Android: the duration above the depth, as in the dive rows. -->
                <span class="bc-download--depth">{formatDuration(d.durationSeconds)}</span>
                {#if d.maxDepthMm}<span class="bc-download--supporting">{formatDepth(d.maxDepthMm, logbook.prefs)}</span>{/if}
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
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
  @layer od.components {
    /* MD3 lists (Android): 14 sp subheaders, two-line 72 dp items with a
       40 dp leading avatar; iOS keeps the same order with its sizes. */
    .bc-download--intro {
      margin: 16px 16px 8px;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);

      :global(.ios) & {
        font-size: 15px;
        line-height: 20px;
      }
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
        font-size: 13px;
        font-weight: 400;
      }
    }

    .bc-download--rows {
      margin: 0;
      padding: 0;
      list-style: none;

      :global(.ios) & {
        margin: 0 16px;
        border-radius: 10px;
        background: var(--bc-surface);
        overflow: hidden;
      }
    }

    .bc-download--row,
    .bc-download--computer,
    .bc-download--dive,
    .bc-download--switch-row {
      box-sizing: border-box;
      width: 100%;
      min-height: 72px;
      padding: 8px 24px 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
    }

    .bc-download--row {
      cursor: pointer;
    }

    .bc-download--nearby {
      display: flex;
      align-items: center;

      .bc-download--row {
        flex: 1;
        min-width: 0;
        padding-inline-end: 0;
      }
    }

    .bc-download--more {
      flex: none;
      width: 48px;
      height: 48px;
      margin-inline-end: 8px;
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
      width: 40px;
      height: 40px;
      border-radius: 20px;
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

      :global(.ios) & {
        font-size: 17px;
      }
    }

    .bc-download--computer .bc-download--headline {
      font-weight: 600;
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

    .bc-download--trailing {
      flex: none;
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      color: var(--bc-text-2);
    }

    .bc-download--connected {
      flex: none;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 14px;
      color: var(--bc-oxygen);
    }

    /* Android: a computer is a card, remembered, nearby or connected. */
    .bc-download--card {
      width: auto;
      margin: 0 16px;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--bc-surface);
    }

    /* 8 dp between cards. Two columns when the pane itself is wide (container
       query below), one column on a phone and in portrait. */
    .bc-download--card-list {
      margin: 0 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;

      > li {
        display: flex;
      }

      .bc-download--card {
        width: auto;
        flex: 1;
        margin: 0;
      }
    }

    /* The page is the container: the width left beside the list decides, not the orientation. */
    :global(.bc-download .page-content) {
      container-type: inline-size;
    }

    @container (min-width: 720px) {
      .bc-download--card-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      /* The connected computer is one column wide, like the cards of the choice. */
      .bc-download--computer.bc-download--card {
        width: calc((100cqw - 40px) / 2);
      }
    }

    .bc-download--computer {
      :global(.ios) & {
        margin: 0 16px;
        width: auto;
        border-radius: 10px;
        background: var(--bc-surface);
      }
    }

    .bc-download--retrying {
      margin: 8px 16px 0;
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

    .bc-download--switch-row {
      margin-top: 16px;
      cursor: pointer;

      :global(.ios) & {
        margin: 24px 16px 0;
        width: auto;
        min-height: 44px;
        border-radius: 10px;
        background: var(--bc-surface);
      }
    }

    .toggle {
      flex: none;
    }

    .bc-download--spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--bc-separator);
      border-top-color: var(--bc-text);
      border-radius: 50%;
      animation: od-download-spin 0.9s linear infinite;
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

    .bc-download--progress {
      margin: 24px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .bc-download--progress-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;

      .bc-download--headline {
        font-weight: 500;
      }
    }

    .bc-download--percent {
      font-size: 16px;
      color: var(--bc-text-2);
      font-variant-numeric: tabular-nums;
    }

    /* MD3 linear progress indicator: 4 dp track; 8 pt on iOS (mock-up). */
    .bc-download--bar {
      position: relative;
      height: 4px;
      border-radius: 2px;
      background: var(--bc-surface-2);
      overflow: hidden;

      :global(.ios) & {
        height: 8px;
        border-radius: 4px;
      }
    }

    .bc-download--fill {
      height: 100%;
      border-radius: inherit;
      background: var(--bc-action);
      transition: width 0.3s;
    }

    .bc-download--indeterminate .bc-download--fill {
      position: absolute;
      width: 40%;
      animation: od-download-slide 1.4s ease-in-out infinite;
    }

    .bc-download--stop {
      margin: 16px 16px 8px;
    }

    .bc-download--hint {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);

      :global(.ios) & {
        font-size: 15px;
      }
    }

    .bc-download--values {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      font-variant-numeric: tabular-nums;
    }

    .bc-download--depth {
      font-size: 16px;
      font-weight: 600;
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

    .bc-download--state-icon {
      color: var(--bc-text-2);
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

    @keyframes od-download-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes od-download-slide {
      from {
        left: -40%;
      }
      to {
        left: 100%;
      }
    }
  }
</style>
