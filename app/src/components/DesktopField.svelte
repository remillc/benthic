<script>
  // @ts-check
  import Icon from './Icon.svelte';
  // A grey filled field of the desktop tools (task 2026-11-15-196, mock-ups bureau-outils*):
  // 44 dp, 8 dp corners, the label above, the unit at the end, a helper or an error under it.
  // `warning`: the helper is a warning in the alarm colour with an icon (the value is still used).
  // With `options` it is a dropdown (a native list, so the keyboard and the system menu work).
  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   unit?: string,
   *   helper?: string,
   *   invalid?: boolean,
   *   warning?: boolean,
   *   options?: { value: string, label: string }[],
   *   inputmode?: 'decimal'|'numeric'|'text',
   *   ariaLabel?: string,
   *   oninput?: () => void,
   *   onchange?: (value: string) => void,
   * }}
   */
  let { label, value = $bindable(), unit = '', helper = '', invalid = false, warning = false, options, inputmode = 'decimal', ariaLabel, oninput, onchange } = $props();
  const uid = $props.id();
  const helperId = `od-desktop-field-${uid}-help`;
</script>

<div class="od-desktop-field">
  <label class="od-desktop-field--label" for="od-desktop-field-{uid}">{label}</label>
  <div class="od-desktop-field--box" class:od-desktop-field--invalid={invalid}>
    {#if options}
      <select id="od-desktop-field-{uid}" class="od-desktop-field--input" bind:value aria-label={ariaLabel} aria-invalid={invalid} aria-describedby={helper ? helperId : undefined} onchange={() => onchange?.(value)}>
        {#each options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
      </select>
      <svg class="od-desktop-field--arrow" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    {:else}
      <input id="od-desktop-field-{uid}" class="od-desktop-field--input" type="text" {inputmode} autocomplete="off" spellcheck="false" bind:value aria-label={ariaLabel} aria-invalid={invalid} aria-describedby={helper ? helperId : undefined} oninput={() => oninput?.()} />
      {#if unit}<span class="od-desktop-field--unit" aria-hidden="true">{unit}</span>{/if}
    {/if}
  </div>
  {#if helper}
    <p id={helperId} class="od-desktop-field--helper" class:od-desktop-field--error={invalid} class:od-desktop-field--warning={warning}>
      {#if warning}<Icon name="warning" size={16} />{/if}{helper}
    </p>
  {/if}
</div>

<style>
  @layer od.components {
    .od-desktop-field {
      min-width: 0;
    }
    .od-desktop-field--label {
      display: block;
      margin: 0 0 6px;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-desktop-field--box {
      position: relative;
      display: flex;
      align-items: center;
      height: 44px;
      border-radius: 8px;
      background: var(--od-desktop-field);
      box-shadow: inset 0 -2px 0 transparent;
    }
    .od-desktop-field--box:focus-within {
      box-shadow: inset 0 -2px 0 var(--od-text);
    }
    .od-desktop-field--invalid,
    .od-desktop-field--invalid:focus-within {
      box-shadow: inset 0 -2px 0 var(--od-alarm);
    }
    .od-desktop-field--input {
      flex: 1;
      min-width: 0;
      height: 100%;
      padding: 0 12px;
      border: 0;
      border-radius: 8px;
      background: none;
      font: inherit;
      font-size: 16px;
      color: var(--od-text);
      outline: none;
      appearance: none;
    }
    select.od-desktop-field--input {
      padding-right: 40px;
      cursor: pointer;
    }
    .od-desktop-field--unit {
      padding: 0 12px 0 0;
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-desktop-field--arrow {
      position: absolute;
      right: 12px;
      pointer-events: none;
      color: var(--od-text);
    }
    .od-desktop-field--helper {
      margin: 6px 0 0;
      font-size: 12px;
      color: var(--od-text-2);
    }
    .od-desktop-field--warning {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      color: var(--od-alarm);
    }
    .od-desktop-field--error {
      color: var(--od-alarm-on-field);
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      select.od-desktop-field--input {
        transition: background-color 120ms linear;
      }
      select.od-desktop-field--input:hover {
        background: color-mix(in srgb, var(--od-text) 8%, transparent);
      }
    }
  }
</style>
