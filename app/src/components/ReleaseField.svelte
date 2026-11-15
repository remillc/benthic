<script>
  // @ts-check
  // An outlined text field of the release edition's first launch (task 2026-11-15-218; mock-ups
  // docs/mockups/android-tablette-premier-lancement-production-*.dc.html): 1 dp outline, 2 dp in the blue on
  // focus, the label on the outline, 12 dp corners. 52 dp high (56 dp for the logbook's name).
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
  } = $props();

  const id = `od-release-field-${Math.random().toString(36).slice(2, 8)}-${uid++}`;
</script>

<div class="od-release-field {extra}" class:od-release-field--error={!!error} class:od-release-field--tall={tall}>
  <div class="od-release-field--box">
    <input
      {id}
      class="od-release-field--input"
      class:od-release-field--mono={mono}
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
    />
    <label class="od-release-field--label" for={id}>{label}</label>
  </div>
  {#if error}
    <p class="od-release-field--note od-release-field--note-error" id="{id}-help" role="alert">{error}</p>
  {:else if help}
    <p class="od-release-field--note" id="{id}-help">{help}</p>
  {/if}
</div>

<style>
  @layer od.components {
    .od-release-field {
      margin-top: 14px;
      min-width: 0;
    }

    .od-release-field--box {
      position: relative;
    }

    .od-release-field--input {
      box-sizing: border-box;
      width: 100%;
      height: 52px;
      margin: 0;
      padding: 0 16px;
      border: 1px solid var(--od-release-field-border);
      border-radius: 12px;
      background: var(--od-surface);
      color: var(--od-text);
      font: inherit;
      font-size: 16px;
      outline: none;
      transition: border-color 0.15s;

      @media (hover: hover) {
        &:hover:not(:disabled):not(:focus) {
          border-color: var(--od-text);
        }
      }

      &:focus {
        border: 2px solid var(--od-release-row-main);
        padding: 0 15px;
      }

      &:disabled {
        opacity: 0.6;
      }
    }

    .od-release-field--mono {
      font-family: 'Roboto Mono', ui-monospace, monospace;
      font-size: 15px;
    }

    .od-release-field--tall .od-release-field--input {
      height: 56px;
      font-size: 17px;
    }

    .od-release-field--label {
      position: absolute;
      left: 12px;
      top: -9px;
      padding: 0 4px;
      background: var(--od-background);
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      color: var(--od-text-2);
      pointer-events: none;
    }

    .od-release-field--input:focus + .od-release-field--label {
      color: var(--od-release-row-main);
    }

    .od-release-field--error {
      .od-release-field--input,
      .od-release-field--input:focus {
        border-color: var(--od-alarm);
      }

      .od-release-field--label {
        color: var(--od-alarm);
      }
    }

    .od-release-field--note {
      margin: 4px 0 0 16px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-release-field--note-error {
      color: var(--od-alarm);
    }

    @media (prefers-reduced-motion: reduce) {
      .od-release-field--input {
        transition: none;
      }
    }
  }
</style>
