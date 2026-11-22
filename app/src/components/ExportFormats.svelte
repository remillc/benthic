<script>
  // @ts-check
  // The formats of the export dialog (task 2026-11-22-324; mock-ups android-tablette-carnet-exporter-paysage,
  // carnet-export-android, bureau-carnet-exporter): one plain row per format with its icon, its name, its extension and
  // one line of description. The same content sits in the phone's sheet, the tablet's dialog and the desktop's dialog,
  // each in its own frame. « Fichier Benthic » carries, inside its own row only, the switch « Inclure les photos et
  // vidéos » (on by default); no other row is highlighted more than the others.
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   formats: string[],
   *   format: string,
   *   withMedia: boolean,
   *   onselect: (format: string) => void,
   *   label?: string,
   * }}
   */
  let { formats, format, withMedia = $bindable(), onselect, label = '' } = $props();

  /** The extension shown after the name; the upload writes no file. @type {Record<string, string>} */
  const EXTENSIONS = { benthic: '.benthic', uddf: '.uddf', ssrf: '.ssrf', csv: '.csv', csvProfiles: '.csv', pdf: '.pdf', divelogs: '' };

  /** The format icons of the mock-ups (24 grid, round caps and joins, no fill). @type {Record<string, string[]>} */
  const ICONS = {
    uddf: ['M4 8h13l-3-3M20 16H7l3 3'],
    ssrf: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
    csv: ['M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M4 10h16M4 15h16M10 4v16'],
    csvProfiles: ['M3 17c3-8 5-8 7-3s4 5 7-2 3-3 4-2'],
    pdf: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6M9 17h4'],
    divelogs: ['M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18z', 'M12 15v-5M9.5 12.5L12 10l2.5 2.5'],
  };

  /** @param {KeyboardEvent} event */
  function keydown(event) {
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    if (!forward && !backward) return;
    const row = /** @type {HTMLElement} */ (event.currentTarget);
    const rows = /** @type {HTMLElement[]} */ ([...(row.closest('[role="radiogroup"]')?.querySelectorAll('[role="radio"]') ?? [])]);
    const at = rows.indexOf(row);
    if (at < 0 || rows.length < 2) return;
    event.preventDefault();
    const next = rows[(at + (forward ? 1 : rows.length - 1)) % rows.length];
    next.focus();
    next.click();
  }
</script>

<div class="bc-export-formats" role="radiogroup" aria-label={label}>
  {#each formats as f (f)}
    {@const on = format === f}
    <div class="bc-export-formats--item" class:bc-export-formats--item-on={on} data-format={f}>
      <button type="button" role="radio" aria-checked={on} tabindex={on ? 0 : -1} class="bc-export-formats--row" onclick={() => onselect(f)} onkeydown={keydown}>
        <span class="bc-export-formats--icon" aria-hidden="true">
          {#if f === 'benthic'}
            <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" class="bc-export-formats--mark" /><path d="M5 13q3.5-3 7 0t7 0" class="bc-export-formats--wave" /></svg>
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24" class="bc-export-formats--glyph">{#each ICONS[f] as d (d)}<path {d} />{/each}</svg>
          {/if}
        </span>
        <span class="bc-export-formats--texts">
          <span class="bc-export-formats--name">{t(`export.formats.${f}`)}{#if EXTENSIONS[f]}<span class="bc-export-formats--ext">{EXTENSIONS[f]}</span>{/if}</span>
          <span class="bc-export-formats--line">{t(`export.formatTexts.${f}`)}</span>
        </span>
        <span class="bc-export-formats--check" aria-hidden="true">{#if on}<Icon name="check" size={20} weight={2.4} />{/if}</span>
      </button>
      {#if f === 'benthic'}
        <label class="bc-export-formats--media">
          <span class="bc-export-formats--texts">
            <span class="bc-export-formats--name">{t('export.withMedia')}</span>
            <span class="bc-export-formats--line">{t('export.withMediaText')}</span>
          </span>
          <span class="toggle">
            <input type="checkbox" role="switch" bind:checked={withMedia} />
            <span class="toggle-icon"></span>
          </span>
        </label>
      {/if}
    </div>
  {/each}
</div>

<style>
  @layer bc.components {
    .bc-export-formats {
      display: flex;
      flex-direction: column;
      border-radius: 16px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-export-formats--item + .bc-export-formats--item {
      border-top: 1px solid var(--bc-row-divider);
    }

    .bc-export-formats--item-on {
      background: var(--bc-selected-container);
    }

    .bc-export-formats--row {
      width: 100%;
      min-height: 56px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 8px 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: -2px;
      }
    }

    .bc-export-formats--icon {
      flex: none;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: var(--bc-surface-container);
    }

    .bc-export-formats--item-on .bc-export-formats--icon {
      background: var(--bc-surface);
    }

    .bc-export-formats--glyph {
      fill: none;
      stroke: var(--bc-text-2);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .bc-export-formats--mark {
      fill: var(--bc-selected);
    }

    .bc-export-formats--wave {
      fill: none;
      stroke: var(--bc-surface);
      stroke-width: 2.2;
      stroke-linecap: round;
    }

    .bc-export-formats--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-export-formats--name {
      font-size: 16px;
      line-height: 21px;
    }

    .bc-export-formats--ext {
      margin-inline-start: 0.3em;
      color: var(--bc-text-2);
    }

    .bc-export-formats--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-export-formats--check {
      flex: none;
      width: 20px;
      height: 20px;
      color: var(--bc-selected);
    }

    /* The switch of « Fichier Benthic »: under its row, aligned with the texts, inside the same tinted item. */
    .bc-export-formats--media {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 16px 10px 66px;
      cursor: pointer;
    }

    .toggle {
      flex: none;
    }

    @media (hover: hover) and (pointer: fine) {
      .bc-export-formats--row {
        transition: box-shadow 120ms linear;
        &:hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-export-formats--row {
        transition: none;
      }
    }
  }
</style>
