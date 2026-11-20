<script>
  // @ts-check
  // The confirmation code, six digits (task 2026-11-16-232): one <input>, drawn
  // as six boxes. One field for the system (numeric keyboard, code suggested
  // from the message, paste fills all six) and for a screen reader (one field,
  // "Code de confirmation, 6 chiffres"); the boxes are only its picture.
  // The caret is kept after the last digit, so Backspace goes back one box.
  import { CODE_LENGTH, activeBox, boxDigits, codeComplete, deleteLastDigit, sanitizeCode } from '../lib/code-input.js';

  /**
   * @type {{
   *   label: string,
   *   accessibleLabel: string,
   *   value: string,
   *   error?: string,
   *   disabled?: boolean,
   *   gap?: number,
   *   spread?: boolean,
   *   onsubmit?: () => void,
   *   oninput?: () => void,
   * }}
   * label: the visible label above the boxes; accessibleLabel: the name read
   * for the field; error: the message under the boxes (all six turn red); gap: the space between the boxes in dp
   * (8 by default, 12 on the wide server screens); spread: the boxes share the width of the column (the phone's
   * server screens) instead of staying together at the start of the line.
   */
  let { label, accessibleLabel, value = $bindable(''), error = '', disabled = false, gap = 8, spread = false, onsubmit, oninput } = $props();

  const uid = Math.random().toString(36).slice(2, 9);
  const id = `od-code-${uid}`;
  const errorId = `od-code-error-${uid}`;
  /** @type {HTMLInputElement | undefined} */
  let input = $state();
  let focused = $state(false);

  const digits = $derived(boxDigits(value));
  const active = $derived(activeBox(value));

  function toEnd() {
    if (input) input.setSelectionRange(value.length, value.length);
  }

  function handleInput() {
    if (!input) return;
    value = sanitizeCode(input.value);
    input.value = value;
    toEnd();
    oninput?.();
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Backspace') {
      // Whatever the selection, the last digit goes.
      e.preventDefault();
      value = deleteLastDigit(value);
      if (input) input.value = value;
      oninput?.();
    } else if (e.key === 'Enter' && codeComplete(value)) {
      e.preventDefault();
      onsubmit?.();
    }
  }

  /** @param {ClipboardEvent} e */
  function handlePaste(e) {
    e.preventDefault();
    value = sanitizeCode(e.clipboardData?.getData('text') ?? '');
    if (input) input.value = value;
    toEnd();
    oninput?.();
  }
</script>

<div class="bc-code-field" class:bc-code-field--error={!!error} class:bc-code-field--disabled={disabled}>
  <label class="bc-code-field--label" for={id}>{label}</label>
  <div class="bc-code-field--boxes" class:bc-code-field--spread={spread} style:gap="{gap}px">
    {#each digits as digit, i (i)}
      <span
        class="bc-code-field--box"
        class:bc-code-field--active={focused && !disabled && i === active}
        class:bc-code-field--filled={!!digit}
        aria-hidden="true"
      >{digit}{#if focused && !disabled && i === active && !digit}<i class="bc-code-field--caret"></i>{/if}</span>
    {/each}
    <input
      bind:this={input}
      {id}
      class="bc-code-field--input"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength={CODE_LENGTH}
      pattern="[0-9]*"
      autocapitalize="off"
      spellcheck="false"
      aria-label={accessibleLabel}
      aria-invalid={!!error}
      aria-describedby={error ? errorId : undefined}
      {disabled}
      {value}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
      onfocus={() => {
        focused = true;
        toEnd();
      }}
      onblur={() => (focused = false)}
      onselect={toEnd}
      onclick={toEnd}
    />
  </div>
  {#if error}<p class="bc-code-field--error-text" id={errorId} role="alert">{error}</p>{/if}
</div>

<style>
  @layer od.components {
    .bc-code-field {
      /* In the editorial card (margin 0) or, on iOS, on the page (--bc-field-margin 16). */
      margin: 8px var(--bc-field-margin, 0) 0;
    }

    .bc-code-field--label {
      display: block;
      margin: 0 0 8px;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-code-field--boxes {
      position: relative;
      display: flex;
      gap: 8px;
      justify-content: flex-start;

      &.bc-code-field--spread {
        justify-content: space-between;
      }
    }

    /* 48 x 56 dp; under 328 dp of room the boxes shrink in proportion (the gap stays 8 dp). */
    .bc-code-field--box {
      flex: 0 1 48px;
      min-width: 0;
      height: 56px;
      box-sizing: border-box;
      border: 1px solid var(--bc-code-border);
      border-radius: 12px;
      background: var(--bc-surface);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 24px;
      font-weight: 500;
      color: var(--bc-text);

      &.bc-code-field--active {
        border-width: 2px;
        border-color: var(--bc-code-active);
      }

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .bc-code-field--caret {
      width: 2px;
      height: 28px;
      background: var(--bc-code-active);
      animation: od-code-caret 1s steps(1) infinite;
    }

    @keyframes od-code-caret {
      50% {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-code-field--caret {
        animation: none;
      }
    }

    /* The one real field lies over the boxes: transparent, it takes the taps and the paste. */
    .bc-code-field--input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      border: none;
      outline: none;
      background: transparent;
      color: transparent;
      caret-color: transparent;
      -webkit-text-fill-color: transparent;
      font-size: 24px;
      cursor: text;

      &::selection {
        background: transparent;
      }
    }

    .bc-code-field--error .bc-code-field--box {
      border-width: 2px;
      border-color: var(--bc-code-error);
    }

    .bc-code-field--error .bc-code-field--label {
      color: var(--bc-code-error);
    }

    .bc-code-field--error-text {
      margin: 6px 0 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-code-error);
    }

    .bc-code-field--disabled {
      opacity: 0.6;
    }
  }
</style>
