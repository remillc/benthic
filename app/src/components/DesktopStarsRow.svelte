<script>
  // @ts-check
  // « Note » and « Visibilité » of the desktop detail's Appréciation card (task 2026-11-23-376): five stars of 26 px (filled
  // when on, outlined when off) in 36 px targets, then « N sur 5 » (or « Non notée »). A radiogroup; a click on the current
  // star clears the value; the arrow keys move between the stars. `onsave` gets the new number of stars (0 clears).
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   label: string,
   *   value: number,
   *   name?: string,
   *   onsave: (value: number) => Promise<boolean|void>|boolean|void,
   * }}
   */
  let { label, value, name = '', onsave } = $props();

  const uid = $props.id();
  const current = $derived(Math.min(Math.max(Number(value) || 0, 0), 5));
  // The Material Symbols « star » glyph, outlined and filled (viewBox 0 -960 960 960).
  const OUTLINE = 'm354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143Zm126 18L314-169q-11 7-23 6t-21-8q-9-7-14-17.5t-2-23.5l44-189-147-127q-10-9-12.5-20.5T140-571q4-11 12-18t22-9l194-17 75-178q5-12 15.5-18t21.5-6q11 0 21.5 6t15.5 18l75 178 194 17q14 2 22 9t12 18q4 11 1.5 22.5T809-528L662-401l44 189q3 13-2 23.5T690-171q-9 7-21 8t-23-6L480-269Zm0-201Z';
  const FILLED = 'M480-269 314-169q-11 7-23 6t-21-8q-9-7-14-17.5t-2-23.5l44-189-147-127q-10-9-12.5-20.5T140-571q4-11 12-18t22-9l194-17 75-178q5-12 15.5-18t21.5-6q11 0 21.5 6t15.5 18l75 178 194 17q14 2 22 9t12 18q4 11 1.5 22.5T809-528L662-401l44 189q3 13-2 23.5T690-171q-9 7-21 8t-23-6L480-269Z';

  /** @param {number} star */
  const choose = (star) => onsave(current === star ? 0 : star);

  /** @param {KeyboardEvent} e @param {number} star */
  function keydown(e, star) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(Math.max(star + step, 1), 5);
    onsave(next);
    /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.currentTarget).parentElement?.querySelector(`[data-star="${next}"]`))?.focus();
  }
</script>

<div class="bc-desktop-stars-row" data-field={name || undefined}>
  <span class="bc-desktop-stars-row--label" id="bc-stars-{uid}">{label}</span>
  <div class="bc-desktop-stars-row--line">
    <span class="bc-desktop-stars-row--stars" role="radiogroup" aria-labelledby="bc-stars-{uid}">
      {#each [1, 2, 3, 4, 5] as star (star)}
        <button
          type="button"
          role="radio"
          class="bc-desktop-stars-row--star"
          class:bc-desktop-stars-row--on={star <= current}
          data-star={star}
          aria-checked={current === star}
          aria-label={String(star)}
          tabindex={current === star || (current === 0 && star === 1) ? 0 : -1}
          onclick={() => choose(star)}
          onkeydown={(e) => keydown(e, star)}
        >
          <svg width="26" height="26" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false"><path d={star <= current ? FILLED : OUTLINE} /></svg>
        </button>
      {/each}
    </span>
    <span class="bc-desktop-stars-row--value">{current ? t('desktopDetail.starsOf', { n: current }) : t('desktopDetail.notRated')}</span>
  </div>
</div>

<style>
  @layer bc.components {
    .bc-desktop-stars-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .bc-desktop-stars-row--label {
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-desktop-stars-row--line {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-desktop-stars-row--stars {
      display: inline-flex;
    }

    .bc-desktop-stars-row--star {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--bc-star-off);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }

    .bc-desktop-stars-row--on {
      color: var(--bc-star-on);
    }

    .bc-desktop-stars-row--value {
      font-size: 14px;
      color: var(--bc-text-2);
    }
  }
</style>
