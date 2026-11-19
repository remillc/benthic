<script>
  // @ts-check
  // « Ordinateurs de cette plongée » (task 2026-11-14-144; detail-ordinateurs-feuille-android.dc.html,
  // detail-ordinateurs-feuille-ios.dc.html): every dive computer of a dive, in the dive's order, the
  // first one « Principal ». Another one becomes the main one through the core (Subsurface's « make
  // first dive computer », edit_dive {"mainComputer": n}): one undoable edit, saved and synced, that
  // Subsurface reads. Its nickname opens « Ordinateurs du carnet » (kept by Subsurface per model and
  // serial number, so it names every dive of that computer). A computer is never removed here.
  // Android: a bottom sheet, a dialog on the tablet. iPhone: a page sheet « Ordinateurs » with OK.
  import { Sheet } from 'framework7-svelte';
  import Icon from './Icon.svelte';
  import DcTile from './DcTile.svelte';
  import { ownComputerPhoto } from '../lib/gear-photos.svelte.js';
  import { layout, ios } from '../lib/layout.svelte.js';
  import { formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   opened: boolean,
   *   title: string,
   *   date: string,
   *   computers: { model: string, nickname: string, serial: string }[],
   *   onclose: () => void,
   *   onmain: (index: number) => void,
   *   onrename: (computer: { model: string, serial: string }) => void,
   *   busy?: boolean,
   * }}
   * computers: get_dive's list, in the dive's order (the first is the main one); `onmain` gets the
   * core's index of the computer to put first.
   */
  let { opened, title, date, computers, onclose, onmain, onrename, busy = false } = $props();

  /** The computers that have a model, with their index in the core's list. */
  const rows = $derived(computers.map((c, index) => ({ ...c, index, name: c.nickname || c.model })).filter((c) => c.model));
  const mainIndex = $derived(rows[0]?.index ?? 0);
  /** A second line: the model when a nickname hides it, and the serial number when known. */
  const detail = (/** @type {{ model: string, nickname: string, serial: string }} */ c) =>
    [c.nickname && c.nickname !== c.model ? c.model : '', c.serial ? t('detail.computerSerial', { serial: c.serial }) : ''].filter(Boolean).join(' · ');
</script>

<Sheet
  class="od-computers-sheet{layout.split ? ' od-computers-sheet--dialog' : ''}"
  {opened}
  onSheetClosed={onclose}
  backdrop
  swipeToClose
  push={false}
  aria-label={t('detail.computersTitle')}
>
  <div class="od-computers-sheet--content">
    {#if ios}
      <div class="od-computers-sheet--ios-bar">
        <span class="od-computers-sheet--ios-title">{t('detail.computersRow')}</span>
        <button type="button" class="od-computers-sheet--ok" onclick={onclose}>{t('dialog.ok')}</button>
      </div>
    {:else}
      <h2 class="od-computers-sheet--title">{t('detail.computersTitle')}</h2>
    {/if}
    <p class="od-computers-sheet--subtitle">{[title, date ? formatLongDate(date) : ''].filter(Boolean).join(' · ')}</p>

    <ul class="od-computers-sheet--list" role="list">
      {#each rows as c (c.index)}
        {@const main = c.index === mainIndex}
        <li class="od-computers-sheet--item">
          <svelte:element
            this={ios && !main ? 'button' : 'div'}
            type={ios && !main ? 'button' : undefined}
            class="od-computers-sheet--row"
            aria-label={ios && !main ? t('detail.makeMainLabel', { name: c.name }) : undefined}
            disabled={ios && !main ? busy : undefined}
            onclick={ios && !main ? () => onmain(c.index) : undefined}
          >
            <DcTile model={c.model} photo={ownComputerPhoto(c.model, c.serial)} />
            <span class="od-computers-sheet--texts">
              <span class="od-computers-sheet--name">{c.name}</span>
              {#if detail(c)}<span class="od-computers-sheet--line">{detail(c)}</span>{/if}
            </span>
            {#if main}
              {#if ios}<Icon name="check" size={22} />{:else}<span class="od-computers-sheet--main">{t('detail.mainBadge')}</span>{/if}
            {/if}
          </svelte:element>
          <button type="button" class="od-computers-sheet--rename" aria-label={t('detail.renameComputer', { name: c.name })} onclick={() => onrename(c)}>
            <Icon name="edit" size={20} />
          </button>
          {#if !ios && !main}
            <button type="button" class="od-outlined-button od-computers-sheet--make-main" disabled={busy} onclick={() => onmain(c.index)}>{t('detail.makeMain')}</button>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="od-computers-sheet--note">{t(ios ? 'detail.computersNoteIos' : 'detail.computersNote')}</p>
  </div>
</Sheet>

<style>
  @layer od.components {
    :global(.sheet-modal.od-computers-sheet) {
      --f7-sheet-bg-color: var(--od-drawer);
      height: auto;
      max-height: 85%;
      border-radius: 28px 28px 0 0;
    }

    /* Tablet: a dialog in the middle of the screen. */
    :global(.sheet-modal.od-computers-sheet.od-computers-sheet--dialog) {
      left: 50%;
      bottom: 50%;
      width: 480px;
      max-width: calc(100% - 48px);
      border-radius: 28px;
      translate: -50% 50%;
    }

    :global(.ios .sheet-modal.od-computers-sheet) {
      --f7-sheet-bg-color: var(--od-background);
      border-radius: 10px 10px 0 0;
    }

    .od-computers-sheet--content {
      padding: 20px 16px calc(16px + var(--od-safe-bottom));
      overflow-y: auto;
    }

    .od-computers-sheet--title {
      margin: 0 8px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
      color: var(--od-text);
    }

    .od-computers-sheet--ios-bar {
      height: 44px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
    }

    .od-computers-sheet--ios-title {
      grid-column: 2;
      font-size: 17px;
      font-weight: 600;
      color: var(--od-text);
    }

    .od-computers-sheet--ok {
      grid-column: 3;
      justify-self: end;
      min-width: 44px;
      height: 44px;
      border: none;
      background: none;
      color: var(--od-secondary);
      font: inherit;
      font-size: 17px;
      font-weight: 600;
    }

    .od-computers-sheet--subtitle {
      margin: 4px 8px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-computers-sheet--list {
      margin: 0;
      padding: 0;
      list-style: none;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .od-computers-sheet--item {
      position: relative;
      padding: 0 8px 0 16px;

      & + .od-computers-sheet--item {
        border-top: 1px solid var(--od-row-divider);
      }
    }

    .od-computers-sheet--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      padding: 8px 48px 8px 0;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 12px;

      :global(.od-icon) {
        flex: none;
        color: var(--od-text-2);
      }

      /* iPhone: 68 pt rows, so the 48 pt photo has room (detail-ordinateurs-feuille-ios). */
      :global(.ios) & {
        min-height: 68px;
      }
    }

    .od-computers-sheet--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-computers-sheet--name {
      font-size: 16px;
      line-height: 24px;
    }

    .od-computers-sheet--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-computers-sheet--main {
      flex: none;
      height: 24px;
      padding: 0 10px;
      border-radius: 12px;
      background: var(--od-secondary-container);
      color: var(--od-secondary);
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
    }

    .od-computers-sheet--rename {
      position: absolute;
      top: 8px;
      right: 4px;
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--od-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-computers-sheet--make-main {
      margin: 0 0 12px 36px;
    }

    .od-computers-sheet--note {
      margin: 12px 8px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }
  }
</style>
