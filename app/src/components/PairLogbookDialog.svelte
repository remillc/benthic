<script>
  // @ts-check
  // « Associer aux plongées du carnet » (task 2026-11-26-405, docs/mockups/profil-piece-associer-android.dc.html and the tablet
  // and desktop files): from a piece's ⋮ menu, the values of the logbook of the piece's type that resemble it and are tied to
  // no other piece. A computer: one choice, and the piece takes its serial number. A suit: several texts. A sheet on a phone,
  // a dialog on a tablet and on the desktop. The button says what it does: « Associer 212 plongées ».
  import { Sheet } from 'framework7-svelte';
  import { onMount } from 'svelte';
  import Md3Dialog from './Md3Dialog.svelte';
  import LogbookPairList from './LogbookPairList.svelte';
  import { logbookPairing, pairWithLogbook, moveSuitNames, gearMap } from '../lib/inventory.svelte.js';
  import { pairRows, computerKey, candidatesFor, computerResembles, suitResembles, totalDives } from '../lib/logbook-pairing.js';
  import { profileWide } from '../lib/profile-frame.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ piece: import('../lib/inventory.js').Gear, onclose: () => void }} */
  let { piece, onclose } = $props();

  const computer = $derived(piece.type === 'computer');
  /** @type {(import('../lib/logbook-pairing.js').LogbookComputerItem|import('../lib/logbook-pairing.js').LogbookSuitItem)[]} */
  let items = $state([]);
  let loaded = $state(false);
  /** @type {string[]} */
  let chosen = $state([]);
  let saving = $state(false);
  let opened = $state(false);

  onMount(async () => {
    const found = await logbookPairing(piece.id);
    const all = /** @type {any[]} */ (computer ? found.computers : found.suits);
    // A suit text already paired with another piece is listed too, with that piece's name: choosing it moves it here.
    items = computer ? candidatesFor(all, (i) => computerResembles(piece, i)) : [...candidatesFor(all, (i) => suitResembles(piece, i.name)), ...all.filter((i) => i.linkedTo)];
    loaded = true;
    opened = true;
  });

  const rows = $derived(
    pairRows(computer ? 'computer' : 'suit', items, {
      serial: (serial) => t('gear.pair.serial', { serial }),
      dives: (n) => t('gear.pair.dives', { n }),
      range: (first, last) => t('gear.pair.years', { first: String(first), last: String(last) }),
      owner: (id) => t('gear.pair.alreadyIn', { name: gearMap().get(id)?.name ?? '' }),
    }),
  );
  const picked = $derived(items.filter((i) => chosen.includes(computer ? computerKey(/** @type {any} */ (i)) : /** @type {any} */ (i).name)));
  const count = $derived(totalDives(picked));

  async function confirm() {
    if (!picked.length || saving) return;
    saving = true;
    try {
      if (computer) await pairWithLogbook(piece.id, { computer: { model: /** @type {any} */ (picked[0]).model, serial: /** @type {any} */ (picked[0]).serial } });
      else await moveSuitNames(piece.id, picked.map((i) => /** @type {any} */ (i).name));
      showSnackbar(t('gear.pair.done'));
      onclose();
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : String(/** @type {any} */ (e)?.message).startsWith('LINKED_ELSEWHERE') ? 'gear.pair.taken' : 'gear.inventory.saveFailed'));
    } finally {
      saving = false;
    }
  }
</script>

{#snippet body()}
  <p class="bc-pair-dialog--lead">{t(computer ? 'gear.pair.leadPieceComputer' : 'gear.pair.leadPieceSuit')}</p>
  {#if loaded && !rows.length}
    <p class="bc-pair-dialog--none">{t(computer ? 'gear.pair.noneComputer' : 'gear.pair.noneSuit')}</p>
  {:else}
    <LogbookPairList items={rows} multiple={!computer} selected={chosen} label={t('gear.pair.menu')} onchange={(keys) => (chosen = keys)} />
  {/if}
  {#if computer && rows.length}<p class="bc-pair-dialog--note">{t('gear.pair.serialNote')}</p>{/if}
{/snippet}

{#if loaded}
  {#if profileWide()}
    <Md3Dialog class="bc-pair-dialog" title={t('gear.pair.menu')} oncancel={onclose}>
      <div class="bc-pair-dialog--body">{@render body()}</div>
      {#snippet actions()}
        <button type="button" onclick={onclose}>{t('gear.pair.cancel')}</button>
        <button type="button" disabled={!picked.length || saving} onclick={confirm}>{t('gear.pair.confirm', { n: count })}</button>
      {/snippet}
    </Md3Dialog>
  {:else}
    <Sheet class="bc-pair-sheet" {opened} onSheetClosed={onclose} backdrop swipeToClose push={false} aria-label={t('gear.pair.menu')}>
      <div class="bc-pair-dialog--content">
        <h2 class="bc-pair-dialog--title">{t('gear.pair.menu')}</h2>
        <div class="bc-pair-dialog--scroll bc-pair-dialog--body" data-bc-scroll>{@render body()}</div>
        <div class="bc-pair-dialog--actions">
          <button type="button" class="bc-pair-dialog--text" onclick={() => (opened = false)}>{t('gear.pair.cancel')}</button>
          <button type="button" class="bc-pair-dialog--main" disabled={!picked.length || saving} onclick={confirm}>{t('gear.pair.confirm', { n: count })}</button>
        </div>
      </div>
    </Sheet>
  {/if}
{/if}

<style>
  @layer bc.components {
    :global(.sheet-modal.bc-pair-sheet) {
      --f7-sheet-bg-color: var(--bc-drawer);
      height: auto;
      max-height: 92%;
      border-radius: 28px 28px 0 0;
    }

    .bc-pair-dialog--content {
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      padding: 20px 0 calc(12px + var(--bc-safe-bottom));
    }

    .bc-pair-dialog--title {
      margin: 0 24px 8px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .bc-pair-dialog--scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .bc-pair-dialog--body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 0 24px;
    }

    .bc-pair-dialog--lead,
    .bc-pair-dialog--note,
    .bc-pair-dialog--none {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-pair-dialog--actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 24px 0;
    }

    .bc-pair-dialog--text,
    .bc-pair-dialog--main {
      width: auto;
      height: 40px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-pair-dialog--text {
      background: none;
      color: var(--bc-action);
    }

    .bc-pair-dialog--main {
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      &:disabled {
        opacity: 0.38;
      }
    }
  }
</style>
