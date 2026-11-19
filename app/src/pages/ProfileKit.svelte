<script>
  // @ts-check
  // « Nouveau kit » and the kit's own page (task 2026-11-17-267, docs/mockups-release/profil-kit-nouveau-android.dc.html):
  // ✕ and « Enregistrer » in the top bar, the field « Nom du kit », then the inventory by type with a checkbox on
  // each piece and the number chosen. A kit is a name and the ids of its pieces.
  import { onMount } from 'svelte';
  import { Page, Navbar, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import TextField from '../components/TextField.svelte';
  import GearPicker from '../components/GearPicker.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import Md3Dialog from '../components/Md3Dialog.svelte';
  import { gear, loadInventory, change, visibleGear } from '../lib/inventory.svelte.js';
  import { groupGear, kitProblems, kitUse, uniqueKitName } from '../lib/inventory.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { formatLongDate } from '../lib/format.js';
  import { openPopupMenu } from '../lib/popup-menu.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  const kitId = f7route.params.id && f7route.params.id !== 'new' ? f7route.params.id : '';
  let name = $state('');
  /** @type {string[]} */
  let selected = $state([]);
  let saving = $state(false);
  let confirmDelete = $state(false);
  let loaded = $state(false);

  onMount(async () => {
    await loadInventory();
    const kit = gear.kits.find((k) => k.id === kitId);
    if (kit) {
      name = kit.name;
      selected = [...kit.gearIds];
    }
    loaded = true;
  });

  const groups = $derived(groupGear(visibleGear()));
  const use = $derived(kitUse(kitId, gear.records, logbook.dives));
  const useLine = $derived(use.dives ? t('gear.kit.usedIn', { n: use.dives, date: formatLongDate(use.last) }) : t('gear.kit.neverUsed'));
  const others = $derived(gear.kits.filter((k) => k.id !== kitId));
  const problems = $derived(kitProblems({ name, gearIds: selected }, others));
  const live = liveError(
    () => name,
    () => (problems.name === 'taken' ? t('gear.kit.nameTaken') : ''),
  );
  const canSave = $derived(!problems.name && !problems.gearIds && !saving && !gear.readOnly);

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      await change((inv) => inv.saveKit({ id: kitId || undefined, name, gearIds: selected }));
      showSnackbar(t('gear.kit.saved'));
      f7router.back();
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'gear.inventory.saveFailed'));
    } finally {
      saving = false;
    }
  }

  /** A copy of the kit under a name no other kit has, then its own page. */
  async function duplicate() {
    const kit = gear.kits.find((k) => k.id === kitId);
    if (!kit) return;
    const copy = (/** @type {number} */ n) => t(n === 1 ? 'gear.kit.copyName' : 'gear.kit.copyNameN', { name: kit.name, n });
    try {
      const made = await change((inv) => inv.duplicateKit(kitId, uniqueKitName(kit.name, gear.kits.map((k) => k.name), copy)));
      showSnackbar(t('gear.kit.duplicated'));
      f7router.navigate(`/profile/kits/${made.id}`, { reloadCurrent: true });
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'gear.inventory.saveFailed'));
    }
  }

  /** @param {MouseEvent} e */
  function more(e) {
    openPopupMenu(
      /** @type {HTMLElement} */ (e.currentTarget),
      [
        { label: t('gear.kit.duplicate'), onclick: () => (gear.readOnly ? showSnackbar(t('gear.inventory.readOnlyRefused')) : duplicate()) },
        { label: t('gear.kit.delete'), onclick: () => (gear.readOnly ? showSnackbar(t('gear.inventory.readOnlyRefused')) : (confirmDelete = true)), danger: true },
      ],
      t('gear.kit.more'),
    );
  }

  async function remove() {
    confirmDelete = false;
    try {
      await change((inv) => inv.deleteKit(kitId));
      showSnackbar(t('gear.kit.deleted'));
      f7router.back();
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'gear.inventory.saveFailed'));
    }
  }
</script>

{#snippet body()}

  <ReadOnlyNotice />

  <div class="od-kit-page--field">
    <TextField label={t('gear.kit.name')} bind:value={name} invalid={!!live.error} supporting={live.error || (kitId ? useLine : t('gear.kit.nameHint'))} disabled={gear.readOnly} />
  </div>

  {#if loaded}
    <div class="od-kit-page--head">
      <h2>{t('gear.kit.pieces')}</h2>
      <span aria-live="polite">{t('gear.kit.chosen', { n: selected.length })}</span>
    </div>
    {#if groups.length}
      <GearPicker {groups} bind:selected disabled={gear.readOnly} line={(g) => (g.type === 'computer' && g.serial ? t('gear.inventory.serialLine', { serial: g.serial }) : (g.note ?? ''))} />
    {:else}
      <p class="od-kit-page--none">{t('gear.kit.noGear')}</p>
    {/if}
    <p class="od-kit-page--hint">{t('gear.kit.hint')}</p>
    {#if kitId}<p class="od-kit-page--hint">{t('gear.kit.deleteNote')}</p>{/if}
  {/if}
  <div class="od-kit-page--bottom"></div>
{/snippet}

<Page class="od-kit-page">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="od-sr-only">{t('gear.kit.close')}</span>
      </a>
    {/snippet}
    {#snippet title()}{kitId ? t('gear.kit.editTitle') : t('gear.kit.newTitle')}{/snippet}
    {#snippet right()}
      {#if kitId}
        <a href="#more" class="link icon-only external" role="button" aria-haspopup="menu" onclick={(e) => (e.preventDefault(), more(e))}>
          <Icon name="more" weight={4} /><span class="od-sr-only">{t('gear.kit.more')}</span>
        </a>
      {/if}
      <button type="button" class="od-kit-page--save" disabled={!canSave} onclick={save}>{t('gear.kit.save')}</button>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="gear" list="gear" bar={kitId ? 'main' : 'dialog'} size="m">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

{#if confirmDelete}
  <Md3Dialog title={t('gear.kit.deleteTitle')} text={t('gear.kit.deleteText', { name })} oncancel={() => (confirmDelete = false)}>
    <span></span>
    {#snippet actions()}
      <button type="button" onclick={() => (confirmDelete = false)}>{t('gear.addSheet.cancel')}</button>
      <button type="button" onclick={remove}>{t('gear.piece.delete')}</button>
    {/snippet}
  </Md3Dialog>
{/if}

<style>
  @layer od.components {
    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.od-kit-page .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-kit-page--save {
      height: 40px;
      margin-inline-end: 8px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--od-secondary);
      color: var(--od-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .od-kit-page--save:disabled {
      opacity: 0.38;
    }

    .od-kit-page--field {
      margin: 8px 0 0;
      padding: 0 16px;
    }

    .od-kit-page--head {
      margin: 16px 20px 0;
      display: flex;
      align-items: baseline;
      justify-content: space-between;

      h2 {
        margin: 0;
        font-size: 18px;
        line-height: 24px;
        font-weight: 700;
      }

      span {
        font-size: 14px;
        color: var(--od-text-2);
      }
    }

    .od-kit-page--none,
    .od-kit-page--hint {
      margin: 16px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-kit-page--bottom {
      height: 48px;
    }
  }
</style>
