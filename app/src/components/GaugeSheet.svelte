<script>
  // @ts-check
  // The result of reading a cylinder pressure from a photo, as a modal bottom sheet
  // (docs/mockups/android-manometre-resultat.dc.html and -resultat-deux): one gauge
  // read, "Pression lue", the thumbnail and the prefilled field to check; two gauges,
  // "2 pressions lues", one row each, left to right, with a "Pour" menu of the dive's
  // cylinders. Nothing is stored before "Utiliser"; "Autre photo" reopens the camera.
  // Moved under <body> like CylinderSheet, so that it opens over it; Escape, the scrim
  // and the system Back close it (lib/back-button.js).
  import SelectField from './SelectField.svelte';
  import TextField from './TextField.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   field: 'start'|'end',
   *   readings: { text: string, x: number }[],
   *   thumbnail: string,
   *   cylinders: { value: string, label: string }[],
   *   firstTarget: string,
   *   unit: string,
   *   onuse: (items: { target: string, text: string }[]) => void,
   *   onretry: () => void,
   *   oncancel: () => void,
   * }}
   * readings: the pressures as text in the diver's unit, left to right. cylinders: the
   * dive's cylinders (value: its key); firstTarget: the one the single gauge is for.
   */
  let { field, readings, thumbnail, cylinders, firstTarget, unit, onuse, onretry, oncancel } = $props();

  const id = `bc-gauge-sheet-${Math.random().toString(36).slice(2, 9)}`;
  const two = readings.length > 1;
  const label = t(field === 'start' ? 'edit.start' : 'edit.end');
  let rows = $state(
    readings.map((r, i) => ({
      text: r.text,
      x: r.x,
      target: two ? (cylinders[i]?.value ?? firstTarget) : firstTarget,
    })),
  );
  const single = $derived(cylinders.find((c) => c.value === firstTarget));

  /** @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      oncancel();
    };
    node.addEventListener('bc-cancel', cancel);
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('[role="dialog"]'))?.focus({ preventScroll: true }));
    return {
      destroy() {
        node.removeEventListener('bc-cancel', cancel);
        node.remove();
        previous?.focus?.();
      },
    };
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bc-gauge-sheet modal-in" use:portal onkeydown={keydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="bc-gauge-sheet--scrim" onclick={oncancel}></div>
  <div class="bc-gauge-sheet--surface" role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1">
    <span class="bc-gauge-sheet--handle" aria-hidden="true"></span>
    <div class="bc-gauge-sheet--body" data-bc-scroll>
      <h2 {id} class="bc-gauge-sheet--title">{t(two ? 'gauge.readTwo' : 'gauge.readOne')}</h2>
      <p class="bc-gauge-sheet--note">
        {#if two}
          {t(field === 'start' ? 'gauge.noteTwoStart' : 'gauge.noteTwoEnd')}
        {:else}
          {t(field === 'start' ? 'gauge.noteOneStart' : 'gauge.noteOneEnd', { n: single?.label.replace(/\D+/g, '') ?? '' })}
        {/if}
      </p>
      {#each rows as row, i (i)}
        <div class="bc-gauge-sheet--row">
          <span class="bc-gauge-sheet--thumb">
            <img src={`data:image/jpeg;base64,${thumbnail}`} alt={t('gauge.thumbnail')} style:object-position={`${Math.round(row.x * 100)}% 50%`} />
          </span>
          <div class="bc-gauge-sheet--fields">
            <div class="bc-gauge-sheet--field">
              <TextField label={label} bind:value={row.text} inputmode="decimal" supporting={two ? '' : t('gauge.correct')}>
                {#snippet trailing()}<span class="bc-gauge-sheet--unit">{unit}</span>{/snippet}
              </TextField>
            </div>
            {#if two}
              <div class="bc-gauge-sheet--field bc-gauge-sheet--for">
                <SelectField label={t('gauge.for')} bind:value={row.target} options={cylinders} />
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    <div class="bc-gauge-sheet--actions">
      <button type="button" class="bc-gauge-sheet--again" onclick={onretry}>{t('gauge.again')}</button>
      <button type="button" class="bc-gauge-sheet--use" onclick={() => onuse(rows.map((r) => ({ target: r.target, text: r.text })))}>{t('gauge.use')}</button>
    </div>
  </div>
</div>

<style>
  @layer bc.components {
    .bc-gauge-sheet {
      position: fixed;
      inset: 0;
      z-index: 13500;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      font-family: inherit;
    }

    .bc-gauge-sheet--scrim {
      position: absolute;
      inset: 0;
      background: var(--bc-scrim);
    }

    .bc-gauge-sheet--surface {
      position: relative;
      box-sizing: border-box;
      width: min(640px, 100%);
      max-height: calc(100% - 48px);
      display: flex;
      flex-direction: column;
      padding: 8px 0 calc(24px + var(--f7-safe-area-bottom, 0px));
      border-radius: 28px 28px 0 0;
      background: var(--bc-dialog);
      color: var(--bc-text);
      outline: none;
      --bc-field-margin: 0;
    }

    :global(.md) .bc-gauge-sheet--surface {
      animation: bc-gauge-sheet-rise var(--bc-motion-spatial-default-ms) var(--bc-motion-spatial-default) backwards;
    }

    @keyframes bc-gauge-sheet-rise {
      from {
        transform: translateY(100%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :global(.md) .bc-gauge-sheet--surface {
        animation: none;
      }
    }

    .bc-gauge-sheet--handle {
      flex: none;
      align-self: center;
      width: 32px;
      height: 4px;
      margin: 6px 0 14px;
      border-radius: 2px;
      background: var(--bc-text-2);
      opacity: 0.4;
    }

    .bc-gauge-sheet--body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0 24px;
    }

    .bc-gauge-sheet--title {
      margin: 0 0 4px;
      font-size: 22px;
      line-height: 28px;
      font-weight: 400;
    }

    .bc-gauge-sheet--note {
      margin: 0 0 4px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-gauge-sheet--row {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-top: 12px;
    }

    .bc-gauge-sheet--thumb {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 12px;
      overflow: hidden;
      background: #15181b;
      display: flex;
      & img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .bc-gauge-sheet--fields {
      flex: 1;
      min-width: 0;
      display: flex;
      gap: 8px;
    }

    .bc-gauge-sheet--field {
      flex: 1;
      min-width: 0;
    }

    .bc-gauge-sheet--for {
      flex: 1.15;
    }

    .bc-gauge-sheet--unit {
      color: var(--bc-text-2);
    }

    .bc-gauge-sheet--actions {
      flex: none;
      margin: 24px 24px 0;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      & button {
        height: 40px;
        padding: 0 24px;
        border-radius: 20px;
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.1px;
        cursor: pointer;
      }
    }

    .bc-gauge-sheet--again {
      border: var(--bc-outline-width) solid var(--bc-text-2);
      background: none;
      color: var(--bc-text);
    }

    .bc-gauge-sheet--use {
      border: none;
      background: var(--bc-text);
      color: var(--bc-background);
    }

    :global(.ios) .bc-gauge-sheet--surface {
      border-radius: 14px 14px 0 0;
    }
  }
</style>
