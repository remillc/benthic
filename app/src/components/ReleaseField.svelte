<script>
  // @ts-check
  // An outlined text field of the release edition's first launch (task 2026-11-15-218; mock-ups
  // docs/mockups/android-tablette-premier-lancement-production-*.dc.html): 1 dp outline, 2 dp in the blue on
  // focus, the label on the outline, 12 dp corners. 52 dp high (56 dp for the logbook's name).
  import Icon from './Icon.svelte';
  import { iosPhone } from '../lib/first-launch-phone.js';
  import { layout, ios } from '../lib/layout.svelte.js';

  let uid = 0;

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   type?: string,
   *   mono?: boolean,
   *   tall?: boolean,
   *   error?: string,
   *   help?: string,
   *   disabled?: boolean,
   *   autocomplete?: string,
   *   class?: string,
   *   oninput?: () => void,
   *   onchange?: () => void,
   *   onenter?: () => void,
   * }}
   */
  let {
    label,
    value = $bindable(),
    type = 'text',
    mono = false,
    tall = false,
    error = '',
    help = '',
    disabled = false,
    autocomplete = 'off',
    class: extra = '',
    oninput,
    onchange,
    onenter,
  } = $props();

  /** On an iPhone the field is a row of a grouped inset list (task 2026-11-16-261; mock-up ios-premier-lancement-production-webdav). */
  const iphone = $derived(iosPhone(ios, layout.phone));

  const id = `od-release-field-${Math.random().toString(36).slice(2, 8)}-${uid++}`;
</script>

<div class="bc-release-field {extra}" class:bc-release-field--error={!!error} class:bc-release-field--tall={tall} class:bc-release-field--ios={iphone} class:bc-release-field--noted={!!error || !!help}>
  <div class="bc-release-field--box">
    <input
      {id}
      class="bc-release-field--input"
      class:bc-release-field--mono={mono}
      {type}
      {disabled}
      {autocomplete}
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error || help ? `${id}-help` : undefined}
      bind:value
      oninput={() => oninput?.()}
      onchange={() => onchange?.()}
      onkeydown={(e) => {
        if (e.key === 'Enter' && onenter) onenter();
      }}
    />
    <label class="bc-release-field--label" for={id}>{label}</label>
    {#if error}<span class="bc-release-field--error-icon" aria-hidden="true"><Icon name="error" size={20} /></span>{/if}
  </div>
  {#if error}
    <p class="bc-release-field--note bc-release-field--note-error" id="{id}-help" role="alert">{error}</p>
  {/if}
  {#if help}
    <p class="bc-release-field--note" id={error ? undefined : `${id}-help`}>{help}</p>
  {/if}
</div>

<style>
  @layer od.components {
    .bc-release-field {
      margin-top: 14px;
      min-width: 0;
    }

    .bc-release-field--box {
      position: relative;
    }

    .bc-release-field--input {
      box-sizing: border-box;
      width: 100%;
      height: 52px;
      margin: 0;
      padding: 0 16px;
      border: 1px solid var(--bc-release-field-border);
      border-radius: 12px;
      background: var(--bc-surface);
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      outline: none;
      transition: border-color 0.15s;

      @media (hover: hover) {
        &:hover:not(:disabled):not(:focus) {
          border-color: var(--bc-text);
        }
      }

      &:focus {
        border: 2px solid var(--bc-release-row-main);
        padding: 0 15px;
      }

      &:disabled {
        opacity: 0.6;
      }
    }

    .bc-release-field--mono {
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 15px;
    }

    .bc-release-field--tall .bc-release-field--input {
      height: 56px;
      font-size: 17px;
    }

    .bc-release-field--label {
      position: absolute;
      left: 12px;
      top: -9px;
      padding: 0 4px;
      background: var(--bc-background);
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      color: var(--bc-text-2);
      pointer-events: none;
    }

    .bc-release-field--input:focus + .bc-release-field--label {
      color: var(--bc-release-row-main);
    }

    /* The error mark at the end of the field (mock-up …-webdav-erreur-paysage). */
    .bc-release-field--error-icon {
      position: absolute;
      top: 0;
      right: 14px;
      bottom: 0;
      display: flex;
      align-items: center;
      color: var(--bc-alarm);
      pointer-events: none;
    }

    .bc-release-field--error {
      .bc-release-field--input,
      .bc-release-field--input:focus {
        border: 2px solid var(--bc-alarm);
        padding: 0 15px;
      }

      .bc-release-field--label {
        color: var(--bc-alarm);
      }
    }

    .bc-release-field--note {
      margin: 4px 0 0 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-release-field--note-error {
      color: var(--bc-alarm);
    }

    /* iPhone (task 2026-11-16-261): a row of a grouped inset list. White card, 12 pt corners, the label at the left
       (148 pt: the longest label on one line) and the value at the right, a hairline between rows, the help line under the card. Rows without a
       note under them join into one card; a field with a note ends its card. */
    .bc-release-field--ios {
      margin-top: 16px;

      .bc-release-field--box {
        min-height: 48px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 16px;
        border-radius: 12px;
        background: var(--bc-surface);
      }

      .bc-release-field--label {
        position: static;
        order: -1;
        width: 148px;
        flex: none;
        padding: 0;
        background: none;
        font-size: 17px;
        line-height: 22px;
        font-weight: 400;
        color: var(--bc-text);
      }

      .bc-release-field--input,
      .bc-release-field--input:focus,
      &.bc-release-field--error .bc-release-field--input {
        flex: 1;
        width: auto;
        min-width: 0;
        height: 48px;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: none;
        font-size: 17px;
        caret-color: var(--bc-release-row-main);
      }

      .bc-release-field--mono {
        font-size: 15px;
      }

      &.bc-release-field--tall .bc-release-field--input {
        height: 48px;
        font-size: 17px;
      }

      .bc-release-field--input:focus + .bc-release-field--label {
        color: var(--bc-text);
      }

      &.bc-release-field--error .bc-release-field--label {
        color: var(--bc-alarm);
      }

      .bc-release-field--error-icon {
        position: static;
        flex: none;
      }

      .bc-release-field--note {
        margin: 6px 16px 0;
        color: var(--bc-release-ios-help);
      }

      .bc-release-field--note-error {
        color: var(--bc-alarm);
      }

    }

    /* Joined rows: no gap, square inner corners and a hairline inset 16 pt from the left. The neighbours are other
       instances of this component, which Svelte cannot see: the sibling selectors are global. */
    :global(.bc-release-field--ios:not(.bc-release-field--noted):has(+ .bc-release-field--ios) .bc-release-field--box) {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    :global(.bc-release-field--ios:not(.bc-release-field--noted) + .bc-release-field--ios) {
      margin-top: 0;

      :global(.bc-release-field--box) {
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        background-image: linear-gradient(var(--bc-release-line-soft), var(--bc-release-line-soft));
        background-size: calc(100% - 16px) 1px;
        background-position: 16px 0;
        background-repeat: no-repeat;
        background-color: var(--bc-surface);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bc-release-field--input {
        transition: none;
      }
    }
  }
</style>
