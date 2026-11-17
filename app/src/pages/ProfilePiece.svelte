<script>
  // @ts-check
  // The sheet of a piece (task 2026-11-17-267, docs/mockups-release/profil-piece-android.dc.html): the model's image
  // (a type icon until the catalogue of dive computer images exists, to-do #65), the type, the name, three
  // figures (dives, hours under water, deepest), the details, the last dive. ✎ Modifier and ⋮ (Partager la
  // fiche, Archiver, Supprimer) in the top bar. The firmware of a computer is read only: it is filled at each
  // download (« 91 · lu au téléchargement du 3 novembre 2026 »), and hidden for a computer never downloaded.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { Share } from '@capacitor/share';
  import Icon from '../components/Icon.svelte';
  import GearIcon from '../components/GearIcon.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import Md3Dialog from '../components/Md3Dialog.svelte';
  import { gear, loadInventory, change, figuresOf, computerFigures, computerDiveCounts, kitsOf } from '../lib/inventory.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatDepth, formatLongDate, formatNumber, formatHours } from '../lib/format.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  const id = f7route.params.id;
  let loaded = $state(false);
  let confirmDelete = $state(false);
  /** @type {{ dives: number, seconds: number, deepestMm: number, last: string }|null} */
  let computerStats = $state(null);

  const piece = $derived(gear.pieces.find((g) => g.id === id));

  onMount(async () => {
    await loadInventory();
    loaded = true;
    const g = gear.pieces.find((x) => x.id === id);
    if (g?.type === 'computer') {
      const counts = await computerDiveCounts();
      const found = await computerFigures(g);
      const fromRecords = figuresOf(g, counts);
      computerStats = found ? { ...found, dives: Math.max(found.dives, fromRecords.dives) } : fromRecords;
    }
  });

  const figures = $derived(piece ? (piece.type === 'computer' && computerStats ? computerStats : figuresOf(piece)) : { dives: 0, seconds: 0, deepestMm: 0, last: '' });
  const lastDive = $derived(figures.last ? logbook.dives.find((d) => d.date === figures.last) : undefined);
  const kitNames = $derived(piece ? kitsOf(piece.id).map((k) => k.name).join(', ') : '');

  /** The details, in the order of the mock-up; a row without a value is left out. */
  const details = $derived(
    piece
      ? [
          { label: t('gear.piece.brand'), value: piece.brand },
          { label: t('gear.piece.model'), value: piece.model },
          { label: t('gear.piece.serial'), value: piece.serial },
          // Read only, from the download; hidden when the computer was never downloaded.
          { label: t('gear.piece.firmware'), value: piece.firmware && piece.firmwareReadAt ? t('gear.piece.firmwareRead', { version: piece.firmware, date: formatLongDate(piece.firmwareReadAt) }) : '' },
          { label: t('gear.piece.purchasedOn'), value: piece.purchasedOn ? formatLongDate(piece.purchasedOn) : '' },
          { label: t('gear.piece.inKits'), value: kitNames },
        ].filter((row) => row.value)
      : [],
  );

  function refused() {
    showSnackbar(t('gear.inventory.readOnlyRefused'));
  }

  async function share() {
    if (!piece) return;
    const text = t('gear.piece.shareText', {
      name: piece.name,
      type: t(`gear.inventory.type.${piece.type}`),
      details: details.map((d) => `${d.label}: ${d.value}`).join('\n'),
    });
    try {
      await Share.share({ title: piece.name, text, dialogTitle: t('gear.piece.share') });
    } catch (e) {
      console.info('Share piece', e);
    }
  }

  /** @param {boolean} retired */
  async function archive(retired) {
    if (!piece) return;
    try {
      await change((inv) => inv.archiveGear(piece.id, retired));
    } catch {
      refused();
    }
  }

  async function remove() {
    confirmDelete = false;
    try {
      await change((inv) => inv.deleteGear(id));
      showSnackbar(t('gear.piece.deleted'));
      f7router.back();
    } catch {
      refused();
    }
  }

  /** @param {MouseEvent} e */
  function more(e) {
    if (!piece) return;
    const retired = piece.retired;
    openPopupMenu(
      /** @type {HTMLElement} */ (e.currentTarget),
      [
        { label: t('gear.piece.share'), onclick: share },
        { label: retired ? t('gear.piece.unarchive') : t('gear.piece.archive'), onclick: () => (gear.readOnly ? refused() : archive(!retired)) },
        { label: t('gear.piece.delete'), onclick: () => (gear.readOnly ? refused() : (confirmDelete = true)), danger: true },
      ],
      t('gear.piece.more'),
    );
  }
</script>

<Page class="od-piece-page">
  <Navbar>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('gear.piece.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      {#if piece}
        <a
          href={`/profile/gear/${id}/edit`}
          class="link icon-only external"
          role="button"
          onclick={(e) => {
            if (gear.readOnly) {
              e.preventDefault();
              refused();
            } else {
              e.preventDefault();
              f7router.navigate(`/profile/gear/${id}/edit`);
            }
          }}
        >
          <Icon name="edit" /><span class="od-sr-only">{t('gear.piece.edit')}</span>
        </a>
        <a href="#more" class="link icon-only external" role="button" aria-haspopup="menu" onclick={(e) => (e.preventDefault(), more(e))}>
          <Icon name="more" weight={4} /><span class="od-sr-only">{t('gear.piece.more')}</span>
        </a>
      {/if}
    {/snippet}
  </Navbar>

  <ReadOnlyNotice />

  {#if piece}
    <div class="od-piece-page--image" role="img" aria-label={t('gear.piece.image')}><GearIcon type={piece.type} size={72} /></div>
    <p class="od-piece-page--type">{t(`gear.inventory.type.${piece.type}`)}{#if piece.retired}<span class="od-piece-page--badge">{t('gear.piece.archived')}</span>{/if}</p>
    <h2 class="od-piece-page--name">{piece.name}</h2>

    <div class="od-piece-page--figures">
      <span class="od-piece-page--figure"><span class="od-piece-page--value">{formatNumber(figures.dives, 0)}</span><span class="od-piece-page--legend">{t('gear.piece.dives')}</span></span>
      <span class="od-piece-page--figure"><span class="od-piece-page--value">{figures.seconds ? formatHours(figures.seconds) : '–'}</span><span class="od-piece-page--legend">{t('gear.piece.hours')}</span></span>
      <span class="od-piece-page--figure"><span class="od-piece-page--value">{figures.deepestMm ? formatDepth(figures.deepestMm, logbook.prefs) : '–'}</span><span class="od-piece-page--legend">{t('gear.piece.deepest')}</span></span>
    </div>

    {#if details.length}
      <h3 class="od-piece-page--title">{t('gear.piece.details')}</h3>
      <dl class="od-piece-page--details">
        {#each details as row (row.label)}
          <div class="od-piece-page--detail"><dt>{row.label}</dt><dd>{row.value}</dd></div>
        {/each}
      </dl>
    {/if}

    <p class="od-piece-page--last">
      {#if lastDive}
        {lastDive.site ? t('gear.piece.lastDive', { date: formatLongDate(lastDive.date), site: lastDive.site }) : t('gear.piece.lastDiveNoSite', { date: formatLongDate(lastDive.date) })}
      {:else if figures.last}
        {t('gear.piece.lastDiveNoSite', { date: formatLongDate(figures.last) })}
      {:else}
        {t('gear.piece.noDive')}
      {/if}
    </p>
  {:else if loaded}
    <p class="od-piece-page--last">{t('gear.inventory.noResults')}</p>
  {/if}
</Page>

{#if confirmDelete && piece}
  <Md3Dialog title={t('gear.piece.deleteTitle')} text={t('gear.piece.deleteText', { name: piece.name })} role="alertdialog" oncancel={() => (confirmDelete = false)}>
    <span></span>
    {#snippet actions()}
      <button type="button" onclick={() => (confirmDelete = false)}>{t('gear.addSheet.cancel')}</button>
      <button type="button" onclick={remove}>{t('gear.piece.delete')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    .od-piece-page--image {
      margin: 8px 16px 0;
      height: 160px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-text);
    }

    .od-piece-page--type {
      margin: 16px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-piece-page--badge {
      margin-inline-start: 8px;
      padding: 0 6px;
      border: var(--od-outline-width) solid var(--od-text-2);
      border-radius: 8px;
      font-size: 11px;
    }

    .od-piece-page--name {
      margin: 0 20px;
      font-size: 24px;
      line-height: 30px;
      font-weight: 500;
      overflow-wrap: anywhere;
    }

    .od-piece-page--figures {
      margin: 16px 16px 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .od-piece-page--figure {
      padding: 12px 8px;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      background: var(--od-surface);
      text-align: center;
    }

    .od-piece-page--value {
      font-size: 20px;
      line-height: 26px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .od-piece-page--legend {
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }

    .od-piece-page--title {
      margin: 24px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    .od-piece-page--details {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-piece-page--detail {
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      gap: 16px;

      & + & {
        border-top: 1px solid var(--od-separator);
      }

      dt {
        flex: none;
        font-size: 14px;
        color: var(--od-text-2);
      }

      dd {
        margin: 0;
        min-width: 0;
        font-size: 15px;
        text-align: end;
        overflow-wrap: anywhere;
      }
    }

    .od-piece-page--last {
      margin: 16px 20px 32px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
