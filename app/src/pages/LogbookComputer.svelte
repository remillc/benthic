<script>
  // @ts-check
  // "Modifier l'ordinateur" (reglages-ordinateur-modifier-android.dc.html and
  // reglages-ordinateur-fusion-android.dc.html; spec, "Settings, logbook dive
  // computers"). Only the name can be changed here; a computer's data stays.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import { showSnackbar } from '../lib/snackbar.js';
  import { BenthicCore } from 'benthic-core';
  import Icon from '../components/Icon.svelte';
  import DcTile from '../components/DcTile.svelte';
  import LogbookComputersList from '../components/LogbookComputersList.svelte';
  import { layout, ios } from '../lib/layout.svelte.js';
  import { gear, loadInventory, change as changeInventory } from '../lib/inventory.svelte.js';
  import { ownComputerPhoto, forgetPhoto } from '../lib/gear-photos.svelte.js';
  import { isSubscriber } from '../lib/logbook.svelte.js';
  import { sameComputer } from '../lib/dc-model.js';
  import { photoToDataUrl } from '../lib/photo.js';
  import TextField from '../components/TextField.svelte';
  import LeaveGuard from '../components/LeaveGuard.svelte';
  import { isDirty } from '../lib/leave-guard.js';
  import ChoiceDialog from '../components/ChoiceDialog.svelte';
  import { computerName, computerChange, duplicatesOf, mergeTargets, sameRecordings } from '../lib/dive-computers.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { offerUndo } from '../lib/undo.js';
  import { formatNumber } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /** @typedef {import('benthic-core').LogbookComputer} LogbookComputer */

  /** @type {{ f7route: { query: { model?: string, serial?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  // svelte-ignore state_referenced_locally
  const model = f7route.query?.model ?? '';
  // svelte-ignore state_referenced_locally
  const serial = f7route.query?.serial ?? '';

  /** @type {LogbookComputer[]} */
  let all = $state([]);
  const computer = $derived(all.find((c) => c.model === model && c.serial === serial) ?? null);
  const candidates = $derived(computer ? mergeTargets(computer, all) : []);
  /** This entry is the one to keep: the duplicates are merged from their own sheet. */
  const duplicates = $derived(computer ? duplicatesOf(computer, all) : []);
  let name = $state('');
  let busy = $state(false);
  let choosing = $state(false);

  // The computer's image (task 2026-11-19-306): the catalog photo of the model, or the diver's own, which belongs to the
  // equipment piece with the same brand, model and serial number (Benthic+ inventory, account data, never the shared
  // catalog). The button shows only where that inventory exists.
  const piece = $derived(computer ? gear.pieces.find((g) => g.type === 'computer' && sameComputer(g, computer)) : undefined);
  const canChangeImage = $derived(isSubscriber() && !gear.readOnly);
  /** The photo picked here, not saved yet; '' to show the kept one. */
  let pickedPhoto = $state('');
  const photoUrl = $derived(pickedPhoto || ownComputerPhoto(computer?.model, computer?.serial));
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();

  /** @param {Event} e */
  async function pickPhoto(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      pickedPhoto = await photoToDataUrl(file);
    } catch {
      showSnackbar(t('gear.pieceNew.photoFailed'));
    }
  }

  /** Keeps the picked photo on the equipment piece; the piece is created (brand, model, serial number) when there is none yet. */
  async function savePhoto() {
    if (!pickedPhoto || !computer) return;
    const photo = pickedPhoto;
    await changeInventory(async (inv) => {
      const photoId = await inv.savePhoto(photo);
      let target = piece;
      if (!target) target = (await inv.recordDownloadedComputer({ model: computer.model, serial: computer.serial, firmware: computer.firmware })).gear ?? undefined;
      if (target) await inv.saveGear({ id: target.id, type: 'computer', name: target.name, photoId });
    });
    forgetPhoto(piece?.photoId);
    pickedPhoto = '';
  }

  /** The text of the sand card: the model that may be the same computer. */
  const explanation = $derived.by(() => {
    if (!computer || !candidates.length) return '';
    if (candidates.length > 1) return t('settings.logbookComputers.possibleMany', { n: candidates.length });
    const other = candidates[0];
    const details = other.serial ? t('settings.logbookComputers.serialShort', { serial: other.serial }) : t('settings.logbookComputers.noSerial').toLowerCase();
    return t(computer.serial ? 'settings.logbookComputers.possibleSame' : 'settings.logbookComputers.possibleNoSerial', { name: computerName(other), details, n: computer.dives });
  });
  const mergeHint = $derived(
    !computer || !candidates.length
      ? ''
      : candidates.length === 1
        ? t('settings.logbookComputers.mergeHelp', { n: computer.dives, name: computerName(candidates[0]) })
        : t('settings.logbookComputers.mergeHelpMany', { n: computer.dives }),
  );
  const mergeNow = () => (candidates.length === 1 ? confirmMerge(candidates[0]) : (choosing = true));
  const removeNow = () => change({ action: 'remove', model, serial }, t('settings.logbookComputers.removed'));

  // Leaving with changes asks first (components/LeaveGuard.svelte): the name as
  // it was when the computer was read, against the name now.
  let opened = $state(/** @type {string|null} */ (null));
  const dirty = () => opened !== null && (isDirty(opened, name) || !!pickedPhoto);
  let guard = /** @type {LeaveGuard|undefined} */ (undefined);

  onMount(async () => {
    try {
      if (isSubscriber()) loadInventory().catch(() => {});
      all = await BenthicCore.diveComputers();
      name = computer?.nickname || model;
      opened = name;
    } catch (e) {
      console.error('Logbook computer', e);
    }
  });

  /** @param {Parameters<typeof computerChange>[0]} options @param {string} text */
  async function change(options, text) {
    if (busy) return;
    busy = true;
    try {
      await computerChange(options);
      f7router.back();
      offerUndo(text);
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Logbook computer', code);
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
    } finally {
      busy = false;
    }
  }

  async function save() {
    if (!computer) return;
    try {
      await savePhoto();
    } catch (e) {
      console.error('Computer image', e);
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'gear.inventory.saveFailed'));
      return;
    }
    const typed = name.trim();
    const nickname = typed === computer.model ? '' : typed;
    if (!serial || nickname === computer.nickname) {
      f7router.back();
      return;
    }
    change({ action: 'rename', model, serial, value: nickname }, t('edit.saved'));
  }

  /** @param {LogbookComputer} c */
  const describe = (c) => (c.serial ? `${c.model}, ${t('settings.logbookComputers.serialShort', { serial: c.serial })}` : c.model);

  /** @param {LogbookComputer} other */
  function confirmMerge(other) {
    if (!computer) return;
    const target = computerName(other);
    const common = sameRecordings(computer, other);
    const text = [
      t('settings.logbookComputers.mergeText', { n: computer.dives, name: computerName(computer), target, details: describe(other) }),
      common ? t('settings.logbookComputers.mergeCommon', { n: common }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    confirmAction({
      title: t('settings.logbookComputers.mergeTitle', { name: target }),
      text,
      action: t('settings.logbookComputers.mergeAction'),
      onConfirm: () =>
        change({ action: 'merge', model, serial, intoModel: other.model, intoSerial: other.serial }, t('settings.logbookComputers.merged', { name: target })),
    });
  }
</script>

<!-- The image: the diver's own photo (Benthic+ inventory) wins over the catalog photo of the model; a model without a
     photo keeps the generic drawing. Android phone: a white 160 box around the 136 photo; iPhone 160; a sheet 96. -->
{#snippet generic()}
  <span class="bc-logbook-computer--generic" aria-hidden="true"><Icon name="wristComputer" size={64} weight={1.4} /></span>
{/snippet}

{#snippet picture(/** @type {number} */ px, /** @type {number} */ radius)}
  <span class="bc-logbook-computer--picture" style:width="{px}px" style:height="{px}px" style:border-radius="{radius}px" role="img" aria-label={t('settings.logbookComputers.imageLabel', { name: computer?.model ?? '' })}>
    <DcTile model={computer?.model ?? ''} size={px} {radius} photo={photoUrl} fallback={generic} />
  </span>
{/snippet}

{#snippet changeImage(/** @type {boolean} */ plain)}
  {#if canChangeImage}
    <button type="button" class="bc-logbook-computer--change" class:bc-logbook-computer--change-plain={plain} onclick={() => fileInput?.click()}>
      {#if !plain}<Icon name="camera" size={20} />{/if}{t('gear.computerEdit.changeImage')}
    </button>
    <input bind:this={fileInput} class="bc-logbook-computer--file" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={pickPhoto} />
  {/if}
{/snippet}

{#snippet nameField()}
  <!-- Subsurface keeps a nickname by serial number: without one there is nothing to attach it to. -->
  <TextField
    label={t('settings.logbookComputers.name')}
    bind:value={name}
    disabled={!serial}
    supporting={serial ? t('settings.logbookComputers.nameHelp') : t('settings.logbookComputers.nameNoSerial')}
  />
{/snippet}

{#snippet facts()}
  <div class="bc-logbook-computer--facts" role="list">
    <div class="bc-logbook-computer--fact" role="listitem"><span>{t('settings.logbookComputers.model')}</span><span class="bc-logbook-computer--value bc-value">{computer?.model}</span></div>
    <div class="bc-logbook-computer--fact" role="listitem"><span>{ios ? t('gear.computerEdit.serialShort') : t('settings.logbookComputers.serial')}</span><span class="bc-logbook-computer--value bc-value">{computer?.serial || t('settings.logbookComputers.unknown')}</span></div>
    <div class="bc-logbook-computer--fact" role="listitem"><span>{t('settings.logbookComputers.firmware')}</span><span class="bc-logbook-computer--value bc-value">{computer?.firmware || t('settings.logbookComputers.unknown')}</span></div>
    <div class="bc-logbook-computer--fact" role="listitem"><span>{t('settings.logbookComputers.divesLabel')}</span><span class="bc-logbook-computer--value bc-value">{formatNumber(computer?.dives ?? 0, 0)}</span></div>
  </div>
{/snippet}

{#snippet mergeLabel()}{candidates.length === 1 ? t('settings.logbookComputers.mergeWith', { name: computerName(candidates[0]) }) : t('settings.logbookComputers.mergeWithMany')}{/snippet}

<!-- « Doublon possible » (Android and the wide sheets): a sand card with the full-width filled « Fusionner avec … » and
     its hint; then a white card « Pas un doublon, ou plus utilisé ? » with the full-width outlined « Retirer de la liste ». -->
{#snippet duplicateCards()}
  {#if candidates.length}
    <div class="bc-logbook-computer--card bc-logbook-computer--card-sand">
      <div class="bc-logbook-computer--card-head">
        <span class="bc-logbook-computer--card-icon"><Icon name="copy" size={22} weight={1.8} /></span>
        <span class="bc-logbook-computer--card-texts">
          <span class="bc-logbook-computer--card-title">{t('settings.logbookComputers.duplicate')}</span>
          <span class="bc-logbook-computer--card-text">{explanation}</span>
        </span>
      </div>
      <button type="button" class="bc-logbook-computer--filled" disabled={busy} onclick={mergeNow}>{@render mergeLabel()}</button>
      <p class="bc-logbook-computer--hint">{mergeHint}</p>
    </div>
  {:else if duplicates.length}
    <p class="bc-logbook-computer--about">
      {t('settings.logbookComputers.hasDuplicateText')}
      {#each duplicates as other, i (`${other.model}\n${other.serial}`)}{i ? ', ' : ' '}<a href="/settings/computers/edit?model={encodeURIComponent(other.model)}&serial={encodeURIComponent(other.serial)}">{computerName(other)}</a>{/each}
    </p>
  {/if}
  {#if computer?.listed}
    <div class="bc-logbook-computer--card bc-logbook-computer--card-white">
      {#if candidates.length}<span class="bc-logbook-computer--card-text">{t('settings.logbookComputers.notDuplicate')}</span>{/if}
      <button type="button" class="bc-logbook-computer--outlined" disabled={busy} onclick={removeNow}>{t('settings.logbookComputers.remove')}</button>
      <p class="bc-logbook-computer--hint">{t('settings.logbookComputers.removeHelp')}</p>
    </div>
  {/if}
{/snippet}

<!-- iPhone and iPad: a footer-led grouped list (docs/mockups/ios-reglages-ordinateur-modifier.dc.html). -->
{#snippet iosGroups()}
  {#if candidates.length}
    <p class="bc-logbook-computer--ios-header">{t('settings.logbookComputers.duplicate')}</p>
    <div class="bc-logbook-computer--group">
      <p class="bc-logbook-computer--ios-text">{explanation}</p>
      <button type="button" class="bc-logbook-computer--ios-action" disabled={busy} onclick={mergeNow}>{@render mergeLabel()}</button>
    </div>
    <p class="bc-logbook-computer--ios-footer">{mergeHint}</p>
  {:else if duplicates.length}
    <p class="bc-logbook-computer--about">
      {t('settings.logbookComputers.hasDuplicateText')}
      {#each duplicates as other, i (`${other.model}\n${other.serial}`)}{i ? ', ' : ' '}<a href="/settings/computers/edit?model={encodeURIComponent(other.model)}&serial={encodeURIComponent(other.serial)}">{computerName(other)}</a>{/each}
    </p>
  {/if}
  {#if computer?.listed}
    <div class="bc-logbook-computer--group bc-logbook-computer--group-remove">
      <button type="button" class="bc-logbook-computer--ios-action bc-logbook-computer--ios-danger" disabled={busy} onclick={removeNow}>{t('settings.logbookComputers.remove')}</button>
    </div>
    <p class="bc-logbook-computer--ios-footer">{t('settings.logbookComputers.removeHelp')}</p>
  {/if}
{/snippet}

{#snippet iosName()}
  <div class="bc-logbook-computer--group">
    <label class="bc-logbook-computer--ios-row"><span>{t('settings.logbookComputers.name')}</span><input bind:value={name} disabled={!serial} /></label>
  </div>
  <p class="bc-logbook-computer--ios-footer">{serial ? t('settings.logbookComputers.nameHelp') : t('settings.logbookComputers.nameNoSerial')}</p>
{/snippet}

{#snippet body()}
  {#if computer}
    <h1 class="bc-logbook-computer--title">{t('settings.logbookComputers.editTitle')}</h1>
    {#if ios}
      <div class="bc-logbook-computer--image">{@render picture(160, 16)}{@render changeImage(true)}</div>
      <div class="bc-logbook-computer--column">
        {@render iosName()}
        {@render facts()}
        {@render iosGroups()}
      </div>
    {:else}
      <div class="bc-logbook-computer--image"><span class="bc-logbook-computer--box" style:--box="160px" style:--box-radius="28px">{@render picture(136, 16)}</span>{@render changeImage(false)}</div>
      <div class="bc-logbook-computer--column">
        {@render nameField()}
        {@render facts()}
        {@render duplicateCards()}
      </div>
    {/if}
  {/if}
{/snippet}

<!-- A tablet: the sheet from the right (440 dp), the list of computers dimmed behind it; the desktop: a dialog over the list.
     The image sits beside the name (96 dp tile), the two cards stack under the facts. -->
{#snippet sheet()}
  {#if computer}
    <div class="bc-logbook-computer--sheet-head">
      <h2>{t('settings.logbookComputers.editTitle')}</h2>
      {#if ios}
        <button type="button" class="bc-logbook-computer--ios-ok" disabled={busy} onclick={save}>{t('gear.computerEdit.ok')}</button>
      {:else if !layout.desktop}
        <button type="button" class="bc-logbook-computer--save" disabled={busy} onclick={save}>{t('edit.save')}</button>
      {/if}
      {#if !layout.desktop}
        <button type="button" class="bc-logbook-computer--sheet-close" onclick={() => guard?.attempt()} aria-label={t('dialog.cancel')}><Icon name="close" size={22} /></button>
      {/if}
    </div>
    <div class="bc-logbook-computer--sheet-top">
      <div class="bc-logbook-computer--sheet-image">
        {#if layout.desktop || ios}
          {@render picture(layout.desktop ? 160 : 96, 16)}
        {:else}
          <span class="bc-logbook-computer--box" style:--box="96px" style:--box-radius="20px">{@render picture(80, 12)}</span>
        {/if}
        {@render changeImage(ios)}
      </div>
      <div class="bc-logbook-computer--sheet-fields">
        {#if ios}
          {@render iosName()}
          {@render facts()}
        {:else}
          {@render nameField()}
          {@render facts()}
        {/if}
      </div>
    </div>
    {#if ios}
      {@render iosGroups()}
    {:else if layout.desktop}
      <div class="bc-logbook-computer--cards-row">{@render duplicateCards()}</div>
    {:else}
      {@render duplicateCards()}
    {/if}
    {#if layout.desktop}
      <div class="bc-logbook-computer--dialog-actions">
        <button type="button" class="bc-logbook-computer--text" onclick={() => guard?.attempt()}>{t('dialog.cancel')}</button>
        <button type="button" class="bc-logbook-computer--filled bc-logbook-computer--filled-compact" disabled={busy} onclick={save}>{t('edit.save')}</button>
      </div>
    {/if}
  {/if}
{/snippet}

<Page class="bc-logbook-computer{ios ? ' bc-logbook-computer--ios' : ''}{layout.split ? ' bc-logbook-computer--wide' : ''}">
  <Navbar title={ios ? '' : undefined}>
    {#snippet left()}
      {#if ios}
        <a href="#close" class="link external" role="button" onclick={(e) => (e.preventDefault(), guard?.attempt())}>{t('dialog.cancel')}</a>
      {:else}
        <Link iconOnly onClick={() => guard?.attempt()}><Icon name="close" /><span class="bc-sr-only">{t('dialog.cancel')}</span></Link>
      {/if}
    {/snippet}
    {#snippet right()}
      {#if ios}
        <button type="button" class="bc-logbook-computer--ios-ok" disabled={busy} onclick={save}>{t('gear.computerEdit.ok')}</button>
      {:else}
        <button type="button" class="bc-logbook-computer--save" disabled={busy} onclick={save}>{t('edit.save')}</button>
      {/if}
    {/snippet}
  </Navbar>
  <LeaveGuard bind:this={guard} noun="computer" {dirty} {save} leave={() => f7router.back()} />

  {#if layout.split}
    <div class="bc-logbook-computer--behind" inert>
      <h1 class="bc-logbook-computer--behind-title">{t('settings.logbookComputers.title')}</h1>
      <LogbookComputersList selected={{ model, serial }} />
    </div>
    <div class="bc-logbook-computer--scrim"></div>
    <div class="bc-logbook-computer--sheet" class:bc-logbook-computer--sheet-dialog={layout.desktop} role="dialog" aria-modal="true" aria-label={t('settings.logbookComputers.editTitle')}>
      {@render sheet()}
    </div>
  {:else}
    {@render body()}
  {/if}
</Page>

{#if choosing}
  <ChoiceDialog
    title={t('settings.logbookComputers.mergeWithMany')}
    options={candidates.map((c, i) => ({ value: String(i), label: computerName(c), example: c.serial }))}
    value="0"
    onselect={(v) => {
      choosing = false;
      confirmMerge(candidates[Number(v)]);
    }}
    oncancel={() => (choosing = false)}
  />
{/if}

<style>
  @layer od.components {
    .bc-logbook-computer--save {
      width: auto;
      height: 40px;
      margin-inline-end: 8px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-logbook-computer--ios-ok {
      width: auto;
      height: 44px;
      padding: 0 8px;
      border: none;
      background: none;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
    }

    :is(.bc-logbook-computer--save, .bc-logbook-computer--ios-ok):disabled {
      opacity: 0.38;
    }

    .bc-logbook-computer--title {
      margin: 4px 20px 0;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      text-wrap: balance;
      color: var(--bc-text);

      :global(.ios) & {
        margin-top: 12px;
        line-height: 34px;
        font-weight: 700;
        letter-spacing: 0.3px;
      }
    }

    /* The image: a white 160 box with 28 dp corners around the 136 photo (Android phone); iPhone, the 160 photo alone. */
    .bc-logbook-computer--image {
      margin: 16px 16px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;

      :global(.ios) & {
        gap: 4px;
      }
    }

    .bc-logbook-computer--picture {
      display: block;
      overflow: hidden;
      border-radius: 16px;
    }

    .bc-logbook-computer--box {
      flex: none;
      width: var(--box);
      height: var(--box);
      border-radius: var(--box-radius);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-photo-ground);
    }

    .bc-logbook-computer--generic {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-selected-container);
      color: var(--bc-secondary);
    }

    .bc-logbook-computer--change {
      width: auto;
      height: 48px;
      padding: 0 20px;
      border: 1px solid var(--bc-outline);
      border-radius: 24px;
      background: transparent;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .bc-logbook-computer--change-plain {
      height: 44px;
      padding: 0 12px;
      border: none;
      font-size: 17px;
      font-weight: 400;
    }

    .bc-logbook-computer--file {
      display: none;
    }

    .bc-logbook-computer--column {
      margin: 24px 16px 0;
      display: flex;
      flex-direction: column;

      :global(.ios) & {
        margin-top: 4px;
      }
    }

    .bc-logbook-computer--facts {
      margin: 20px 0 0;
      padding: 4px 0;
      border-radius: 20px;
      background: var(--bc-surface);

      :global(.ios) & {
        margin-top: 16px;
        padding: 0;
        border-radius: 10px;
        overflow: hidden;
      }
    }

    .bc-logbook-computer--fact {
      min-height: 48px;
      padding: 6px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 16px;
      color: var(--bc-text);

      .bc-logbook-computer--value {
        color: var(--bc-text-2);
        text-align: right;
        overflow-wrap: anywhere;
      }

      :global(.ios) & {
        min-height: 44px;
        font-size: 17px;

        + .bc-logbook-computer--fact {
          border-top: 0.5px solid var(--bc-row-divider);
          margin-inline-start: 16px;
          padding-inline-start: 0;
        }
      }
    }

    .bc-logbook-computer--about {
      --f7-theme-color: var(--bc-text);
      margin: 16px 4px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);

      a {
        font-weight: 600;
      }
    }

    /* « Doublon possible » (sand) and « Pas un doublon, ou plus utilisé ? » (white): full-width buttons, centred hints. */
    .bc-logbook-computer--card {
      margin-top: 16px;
      padding: 16px;
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-logbook-computer--card-sand {
      background: var(--bc-sand-container, #FBEFD9);
    }

    .bc-logbook-computer--card-white {
      margin-top: 12px;
      background: var(--bc-surface);
    }

    .bc-logbook-computer--card-head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .bc-logbook-computer--card-icon {
      flex: none;
      display: flex;
      color: var(--bc-text);
    }

    .bc-logbook-computer--card-texts {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-logbook-computer--card-title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
      color: var(--bc-text);
    }

    .bc-logbook-computer--card-text {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-logbook-computer--hint {
      margin: 0;
      font-size: 12px;
      line-height: 16px;
      text-align: center;
      color: var(--bc-text-2);
    }

    .bc-logbook-computer--filled,
    .bc-logbook-computer--outlined {
      width: 100%;
      height: 48px;
      padding: 0 24px;
      border-radius: 24px;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.1px;
      white-space: nowrap;
    }

    .bc-logbook-computer--filled {
      border: none;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }

    .bc-logbook-computer--outlined {
      border: 1px solid var(--bc-outline);
      background: none;
      color: var(--bc-text);
    }

    :is(.bc-logbook-computer--filled, .bc-logbook-computer--outlined):disabled {
      opacity: 0.38;
    }

    /* iPhone and iPad: sections of a grouped list. */
    .bc-logbook-computer--group {
      margin-top: 16px;
      border-radius: 10px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-logbook-computer--column > .bc-logbook-computer--group:first-child {
      margin-top: 0;
    }

    .bc-logbook-computer--ios-row {
      min-height: 44px;
      padding: 6px 16px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 17px;
      color: var(--bc-text);

      > span {
        flex: none;
        width: 72px;
      }

      > input {
        flex: 1;
        min-width: 0;
        width: auto;
        height: 32px;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--bc-text);
        font: inherit;

        &:disabled {
          color: var(--bc-text-2);
        }
      }
    }

    .bc-logbook-computer--ios-header {
      margin: 22px 16px 6px;
      font-size: 13px;
      text-transform: uppercase;
      color: var(--bc-text-2);
    }

    .bc-logbook-computer--ios-text {
      margin: 0;
      padding: 12px 16px;
      font-size: 15px;
      line-height: 20px;
      color: var(--bc-text);
    }

    .bc-logbook-computer--ios-footer {
      margin: 6px 16px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-logbook-computer--ios-action {
      width: 100%;
      min-height: 44px;
      border: none;
      border-top: 0.5px solid var(--bc-row-divider);
      background: transparent;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
    }

    .bc-logbook-computer--group-remove {
      margin-top: 24px;

      .bc-logbook-computer--ios-action {
        border-top: none;
        font-weight: 400;
      }
    }

    .bc-logbook-computer--ios-danger {
      color: var(--bc-alarm);
    }

    /* A tablet and the desktop: the list stays behind a scrim; the edit is a 440 dp sheet from the right, or on the desktop a
       dialog (760 dp) with the two cards side by side and « Annuler » / « Enregistrer » at the foot. */
    :global(.bc-logbook-computer--wide > .navbar) {
      display: none;
    }

    :global(.bc-logbook-computer--wide .page-content) {
      overflow: hidden;
      padding: 0 !important;
    }

    .bc-logbook-computer--behind {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .bc-logbook-computer--behind-title {
      margin: 16px 20px 0;
      font-size: 22px;
      line-height: 28px;
      font-weight: 500;
    }

    .bc-logbook-computer--scrim {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 0.32);
    }

    .bc-logbook-computer--sheet {
      position: absolute;
      right: 0;
      top: 24px;
      bottom: 0;
      width: 440px;
      max-width: 100%;
      box-sizing: border-box;
      padding: 16px 24px;
      overflow-y: auto;
      border-radius: 16px 0 0 16px;
      background: var(--bc-background);
      box-shadow: -4px 0 20px rgb(0 0 0 / 0.2);
      display: flex;
      flex-direction: column;
      gap: 14px;

      .bc-logbook-computer--facts,
      .bc-logbook-computer--group {
        margin: 0;
      }

      .bc-logbook-computer--card {
        margin-top: 0;
      }
    }

    .bc-logbook-computer--sheet-dialog {
      left: 50%;
      right: auto;
      top: 50%;
      bottom: auto;
      transform: translate(-50%, -50%);
      width: min(760px, calc(100% - 32px));
      max-height: 94%;
      border-radius: 28px;
      padding: 24px;
      background: var(--bc-surface-container, #F0F0EE);
      box-shadow: 0 8px 28px rgb(0 0 0 / 0.25);
      gap: 16px;
    }

    .bc-logbook-computer--sheet-head {
      display: flex;
      align-items: center;
      gap: 8px;

      h2 {
        flex: 1;
        margin: 0;
        font-size: 22px;
        line-height: 28px;
        font-weight: 500;
      }
    }

    .bc-logbook-computer--sheet-dialog .bc-logbook-computer--sheet-head h2 {
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;
    }

    .bc-logbook-computer--sheet-close {
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Tablet: the 96 dp tile with « Changer d’image » beside it. Desktop: the 160 photo above its button, left of the fields. */
    .bc-logbook-computer--sheet-top {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .bc-logbook-computer--sheet-dialog .bc-logbook-computer--sheet-top {
      flex-direction: row;
      align-items: flex-start;
      gap: 20px;
    }

    .bc-logbook-computer--sheet-fields {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-logbook-computer--sheet-image {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .bc-logbook-computer--sheet-dialog .bc-logbook-computer--sheet-image {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;

      .bc-logbook-computer--change {
        height: 40px;
        padding: 0 16px;
        font-weight: 600;
      }
    }

    .bc-logbook-computer--cards-row {
      display: flex;
      gap: 12px;
      align-items: stretch;

      > .bc-logbook-computer--card-sand {
        flex: 1.3;
      }

      > .bc-logbook-computer--card-white {
        flex: 1;
      }

      .bc-logbook-computer--filled,
      .bc-logbook-computer--outlined {
        height: 40px;
      }

      .bc-logbook-computer--card-white .bc-logbook-computer--outlined {
        margin-top: auto;
      }
    }

    .bc-logbook-computer--dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .bc-logbook-computer--text,
    .bc-logbook-computer--filled-compact {
      width: auto;
      height: 40px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
    }

    .bc-logbook-computer--filled-compact {
      padding: 0 20px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
    }
  }
</style>
