<script>
  // @ts-check
  // The sheet of a certification card (task 2026-11-18-272, docs/mockups-release/profil-brevet-android.dc.html): the
  // photo of the card with a Recto / Verso toggle, then Agence, Niveau, Numéro, Date and Moniteur. The top bar has the
  // card full screen, Modifier and ⋮ (Supprimer). The photos are sealed on the device and opened here, nothing else.
  import { onDestroy, onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import ButtonGroup from '../components/ButtonGroup.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import { services, loadProfile } from '../lib/profile.svelte.js';
  import { changeProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { photoUrl } from '../lib/card-canvas.js';
  import { formatLongDate } from '../lib/profile-format.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();
  const id = f7route.params.id ?? '';

  /** @type {import('../lib/profile.js').Certification|null} */
  let card = $state(null);
  let missing = $state(false);
  let side = $state('front');
  /** @type {Record<string, string>} */
  let urls = $state({});
  let full = $state(false);

  onMount(async () => {
    await loadInventory();
    const c = await services().profile.getCertification(id);
    if (!c) {
      missing = true;
      return;
    }
    card = c;
    /** @type {Record<string, string>} */
    const made = {};
    for (const d of c.documents) {
      const bytes = await services().profile.readPhoto(c.id, d.hash);
      if (bytes) made[d.side] = photoUrl(bytes);
    }
    urls = made;
    if (!made.front && made.back) side = 'back';
  });
  onDestroy(() => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)));

  const agency = $derived(card ? (card.agency === 'other' ? card.agencyName || t('diverProfile.cert.agencyOther') : card.agency) : '');
  const photo = $derived(urls[side] ?? '');
  const sides = [
    { value: 'front', label: t('diverProfile.cert.recto') },
    { value: 'back', label: t('diverProfile.cert.verso') },
  ];

  /** @param {MouseEvent} e */
  function more(e) {
    openPopupMenu(/** @type {HTMLElement} */ (e.currentTarget), [{ label: t('diverProfile.cert.delete'), danger: true, disabled: gear.readOnly, onclick: remove }], t('diverProfile.cert.menu'));
  }

  function remove() {
    confirmAction({
      title: t('diverProfile.cert.deleteTitle'),
      text: t('diverProfile.cert.deleteText'),
      action: t('diverProfile.cert.deleteAction'),
      cancel: t('diverProfile.cert.cancel'),
      onConfirm: async () => {
        try {
          await changeProfile((p) => p.deleteCertification(id));
          showSnackbar(t('diverProfile.cert.deleted'));
          f7router.back();
        } catch {
          showSnackbar(t('diverProfile.cert.saveFailed'));
        }
      },
    });
  }
</script>

<Page class="od-cert">
  <Navbar>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('diverProfile.certs.back')}</span>
      </Link>
    {/snippet}
    {#snippet title()}{agency}{/snippet}
    {#snippet right()}
      <button type="button" class="link icon-only od-cert--bar" disabled={!photo} onclick={() => (full = true)} aria-label={t('diverProfile.cert.fullscreen')}><Icon name="fullscreen" /></button>
      <a href={`/profile/certs/${id}/edit`} class="link icon-only" aria-label={t('diverProfile.cert.edit')}><Icon name="edit" /></a>
      <button type="button" class="link icon-only od-cert--bar" onclick={more} aria-label={t('diverProfile.cert.menu')}><Icon name="more" /></button>
    {/snippet}
  </Navbar>

  <ReadOnlyNotice />

  {#if missing}
    <p class="od-cert--missing">{t('diverProfile.cert.notFound')}</p>
  {:else if card}
    <div class="od-cert--photo" class:od-cert--photo-empty={!photo}>
      {#if photo}
        <img src={photo} alt={t('diverProfile.cert.photoOf')} />
      {:else}
        <Icon name="idCard" size={40} weight={1.4} />
        <span>{t('diverProfile.cert.noPhoto')}</span>
      {/if}
    </div>
    <div class="od-cert--toggle">
      <ButtonGroup options={sides} value={side} onchange={(v) => (side = v)} ariaLabel={t('diverProfile.cert.photoOf')} />
    </div>

    <h2 class="od-cert--section">{t('diverProfile.cert.details')}</h2>
    <div class="od-cert--card">
      <div class="od-cert--row"><span class="od-cert--label">{t('diverProfile.cert.agency')}</span><span class="od-cert--value">{agency}</span></div>
      <div class="od-cert--row"><span class="od-cert--label">{t('diverProfile.cert.level')}</span><span class="od-cert--value">{card.level}</span></div>
      <div class="od-cert--row"><span class="od-cert--label">{t('diverProfile.cert.number')}</span><span class="od-cert--value">{card.number}</span></div>
      {#if card.issuedOn}<div class="od-cert--row"><span class="od-cert--label">{t('diverProfile.cert.date')}</span><span class="od-cert--value">{formatLongDate(card.issuedOn)}</span></div>{/if}
      {#if card.instructor}<div class="od-cert--row"><span class="od-cert--label">{t('diverProfile.cert.instructor')}</span><span class="od-cert--value">{card.instructor}</span></div>{/if}
    </div>
  {/if}
</Page>

{#if full && photo}
  <div class="od-cert--full" role="dialog" aria-modal="true" aria-label={t('diverProfile.cert.fullscreen')}>
    <img src={photo} alt={t('diverProfile.cert.photoOf')} />
    <button type="button" class="od-cert--full-close" onclick={() => (full = false)} aria-label={t('diverProfile.cert.close')}><Icon name="close" /></button>
  </div>
{/if}

<style>
  @layer od.components {
    :global(.od-cert .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-cert--bar {
      border: none;
      background: none;
      color: inherit;
    }

    .od-cert--bar:disabled {
      opacity: 0.38;
    }

    .od-cert--photo {
      margin: 8px 16px 0;
      aspect-ratio: 85.6 / 54;
      border-radius: 20px;
      overflow: hidden;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-cert--photo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .od-cert--photo-empty {
      flex-direction: column;
      gap: 8px;
      color: var(--od-text-2);
      font-size: 14px;
    }

    .od-cert--toggle {
      margin: 12px 16px 0;
      display: flex;
      justify-content: center;
    }

    .od-cert--section {
      margin: 20px 32px 8px;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-cert--card {
      margin: 0 16px 24px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-cert--row {
      padding: 10px 16px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .od-cert--row + .od-cert--row {
      border-top: 1px solid var(--od-separator);
    }

    .od-cert--label {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-cert--value {
      font-size: 17px;
      line-height: 24px;
    }

    .od-cert--missing {
      margin: 32px;
      text-align: center;
      color: var(--od-text-2);
    }

    .od-cert--full {
      position: fixed;
      inset: 0;
      z-index: 20000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-viewer);
    }

    .od-cert--full img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .od-cert--full-close {
      position: absolute;
      top: 12px;
      inset-inline-end: 12px;
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: var(--od-viewer-control);
      color: var(--od-viewer-on);
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>
