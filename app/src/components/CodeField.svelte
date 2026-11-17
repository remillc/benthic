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
   *   onsubmit?: () => void,
   *   oninput?: () => void,
   * }}
   * label: the visible label above the boxes; accessibleLabel: the name read
   * for the field; error: the message under the boxes (all six turn red).
   */
  let { label, accessibleLabel, value = $bindable(''), error = '', disabled = false, onsubmit, oninput } = $props();

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

<div class="od-code-field" class:od-code-field--error={!!error} class:od-code-field--disabled={disabled}>
  <label class="od-code-field--label" for={id}>{label}</label>
  <div class="od-code-field--boxes">
    {#each digits as digit, i (i)}
      <span
        class="od-code-field--box"
        class:od-code-field--active={focused && !disabled && i === active}
        class:od-code-field--filled={!!digit}
        aria-hidden="true"
      >{digit}{#if focused && !disabled && i === active && !digit}<i class="od-code-field--caret"></i>{/if}</span>
    {/each}
    <input
      bind:this={input}
      {id}
      class="od-code-field--input"
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
  {#if error}<p class="od-code-field--error-text" id={errorId} role="alert">{error}</p>{/if}
</div>

<style>
  @layer od.components {
    .od-code-field {
      /* In the editorial card (margin 0) or, on iOS, on the page (--od-field-margin 16). */
      margin: 8px var(--od-field-margin, 0) 0;
    }

    .od-code-field--label {
      display: block;
      margin: 0 0 8px;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      color: var(--od-text-2);
    }

    .od-code-field--boxes {
      position: relative;
      display: flex;
      gap: 8px;
      justify-content: flex-start;
    }

    /* 48 x 56 dp; under 328 dp of room the boxes shrink in proportion (the gap stays 8 dp). */
    .od-code-field--box {
      flex: 0 1 48px;
      min-width: 0;
      height: 56px;
      box-sizing: border-box;
      border: 1px solid var(--od-code-border);
      border-radius: 12px;
      background: var(--od-surface);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 24px;
      font-weight: 500;
      color: var(--od-text);

      &.od-code-field--active {
        border-width: 2px;
        border-color: var(--od-code-active);
      }

      :global(.ios) & {
        border-radius: 10px;
      }
    }

    .od-code-field--caret {
      width: 2px;
      height: 28px;
      background: var(--od-code-active);
      animation: od-code-caret 1s steps(1) infinite;
    }

    @keyframes od-code-caret {
      50% {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-code-field--caret {
        animation: none;
      }
    }

    /* The one real field lies over the boxes: transparent, it takes the taps and the paste. */
    .od-code-field--input {
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

    .od-code-field--error .od-code-field--box {
      border-width: 2px;
      border-color: var(--od-code-error);
    }

    .od-code-field--error .od-code-field--label {
      color: var(--od-code-error);
    }

    .od-code-field--error-text {
      margin: 6px 0 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-code-error);
    }

    .od-code-field--disabled {
      opacity: 0.6;
    }
  }
</style>
