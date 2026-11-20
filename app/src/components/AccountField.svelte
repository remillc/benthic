<script>
  // @ts-check
  // A field of the sign-in and new account screens (spec, section 4, "Sign
  // in and new account"). Android: the MD3 filled TextField, with a show/hide
  // button for a password. iOS: a row of an inset group, label on the left,
  // value on the right; the group's footer (helper text, or the error in
  // --bc-alarm) under its last row. Errors: the value and an icon in
  // --bc-alarm on iOS.
  import { f7 } from 'framework7-svelte';
  import TextField from './TextField.svelte';
  import Icon from './Icon.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   label: string,
   *   rowLabel: string,
   *   value: string,
   *   type?: 'text'|'email'|'password',
   *   autocomplete?: import('svelte/elements').FullAutoFill,
   *   supporting?: string,
   *   error?: string,
   *   footer?: string,
   *   footerError?: boolean,
   *   disabled?: boolean,
   *   required?: boolean,
   *   position?: 'single'|'first'|'last',
   *   outlined?: boolean,
   *   mono?: boolean,
   *   onchange?: () => void,
   * }}
   * footer / footerError: the iOS footer of the group, when it is not this
   * field's own (helper text, or error). outlined: the outlined field of the alpha first launch on a phone
   * (task 2026-11-16-233), the label sitting on the border. mono: the text in a monospace face (an address).
   */
  let {
    label,
    rowLabel,
    value = $bindable(),
    type = 'text',
    autocomplete,
    supporting = '',
    error = '',
    footer,
    footerError,
    disabled = false,
    required = false,
    position = 'single',
    outlined = false,
    mono = false,
    onchange,
  } = $props();

  const ios = f7.theme === 'ios';
  let shown = $state(false);
  const id = `od-account-${Math.random().toString(36).slice(2, 9)}`;
  const footerText = $derived(footer ?? (error || supporting));
  const footerIsError = $derived(footerError ?? !!error);
</script>

{#if ios}
  <div class="bc-account-field bc-account-field--ios-row bc-account-field--{position}" class:bc-account-field--invalid={!!error} class:disabled>
    <label for={id}>{rowLabel}</label>
    <input
      {id}
      {type}
      {autocomplete}
      {disabled}
      bind:value
      {onchange}
      placeholder={required && !value ? t('accountStep.required') : ''}
      aria-invalid={!!error}
      autocapitalize="off"
      spellcheck="false"
    />
    {#if error}<span class="bc-account-field--icon"><Icon name="error" size={20} /></span>{/if}
  </div>
  {#if position !== 'first' && footerText}
    <p class="bc-account-field bc-account-field--ios-footer" class:bc-account-field--error={footerIsError}>{footerText}</p>
  {/if}
{:else if outlined}
  <div class="bc-account-field bc-account-field--outlined" class:bc-account-field--mono={mono} class:bc-account-field--invalid={!!error} class:disabled>
    <div class="bc-account-field--box">
      <input
        {id}
        type={type === 'password' && shown ? 'text' : type}
        {autocomplete}
        {disabled}
        bind:value
        {onchange}
        aria-invalid={!!error}
        aria-describedby={error || supporting ? `${id}-supporting` : undefined}
        autocapitalize="off"
        spellcheck="false"
      />
      {#if type === 'password'}
        <button
          type="button"
          class="bc-icon-button bc-account-field--toggle"
          aria-label={shown ? t('accountStep.hidePassword') : t('accountStep.showPassword')}
          {disabled}
          onclick={() => (shown = !shown)}
        >
          <Icon name={shown ? 'visibilityOff' : 'visibility'} />
        </button>
      {/if}
    </div>
    <label class="bc-account-field--label" for={id}>{label}</label>
    {#if error || supporting}
      <p class="bc-account-field--supporting" id="{id}-supporting">{error || supporting}</p>
    {/if}
  </div>
{:else}
  <TextField
    {label}
    type={type === 'password' && shown ? 'text' : type}
    {autocomplete}
    {disabled}
    bind:value
    {onchange}
    invalid={!!error}
    supporting={error || supporting}
  >
    {#snippet trailing()}
      {#if type === 'password'}
        <button
          type="button"
          class="bc-icon-button"
          aria-label={shown ? t('accountStep.hidePassword') : t('accountStep.showPassword')}
          {disabled}
          onclick={(e) => {
            e.stopPropagation();
            shown = !shown;
          }}
        >
          <Icon name={shown ? 'visibilityOff' : 'visibility'} />
        </button>
      {/if}
    {/snippet}
  </TextField>
{/if}

<style>
  @layer od.components {
    /* Outlined field (docs/mockups/android-premier-lancement-*.dc.html): 52 dp, 12 dp corners, the label on the border. */
    .bc-account-field--outlined {
      position: relative;
      margin-top: var(--bc-outlined-gap, 14px);

      .bc-account-field--box {
        box-sizing: border-box;
        height: 52px;
        padding: 0 16px;
        border: var(--bc-outline-width) solid var(--bc-outlined-field-border);
        border-radius: 12px;
        background: var(--bc-surface);
        display: flex;
        align-items: center;
        gap: 8px;

        &:focus-within {
          border: 2px solid var(--bc-outlined-field-active);
          padding: 0 15px;
        }
      }

      input {
        flex: 1;
        min-width: 0;
        height: 100%;
        padding: 0;
        border: none;
        outline: none;
        background: none;
        font: inherit;
        font-size: 16px;
        color: var(--bc-text);
      }

      &.bc-account-field--mono input {
        font-family: 'Roboto Mono', ui-monospace, monospace;
        font-size: 15px;
      }

      .bc-account-field--toggle {
        flex: none;
        margin-right: -12px;
      }

      .bc-account-field--label {
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

      &:focus-within .bc-account-field--label {
        color: var(--bc-outlined-field-active);
      }

      .bc-account-field--supporting {
        margin: 4px 0 0 16px;
        font-size: 13px;
        line-height: 18px;
        color: var(--bc-text-2);
      }

      &.bc-account-field--invalid {
        .bc-account-field--box,
        .bc-account-field--box:focus-within {
          border: 2px solid var(--bc-outlined-field-error);
          padding: 0 15px;
        }

        .bc-account-field--label,
        &:focus-within .bc-account-field--label,
        .bc-account-field--supporting {
          color: var(--bc-outlined-field-error);
        }
      }

      &.disabled {
        opacity: 0.6;
      }
    }

    /* iOS: a row of an inset group (44 pt, label column of 112 pt). */
    .bc-account-field--ios-row {
      margin: 0 16px;
      min-height: 44px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bc-surface);

      &.bc-account-field--single {
        margin-top: 20px;
        border-radius: 20px;
      }

      &.bc-account-field--first {
        margin-top: 20px;
        border-radius: 20px 20px 0 0;
      }

      &.bc-account-field--last {
        border-radius: 0 0 20px 20px;
        box-shadow: inset 0 0.5px 0 var(--bc-separator);
      }

      &.disabled {
        opacity: 0.5;
      }

      label {
        width: 112px;
        flex: none;
        font-size: 17px;
        color: var(--bc-text);
      }

      input {
        flex: 1;
        min-width: 0;
        height: 44px;
        padding: 0;
        border: none;
        outline: none;
        background: none;
        font: inherit;
        font-size: 17px;
        color: var(--bc-text);
      }

      &.bc-account-field--invalid input {
        color: var(--bc-alarm);
        -webkit-text-fill-color: var(--bc-alarm);
      }

      .bc-account-field--icon {
        flex: none;
        display: flex;
        color: var(--bc-alarm);
      }
    }

    .bc-account-field--ios-footer {
      margin: 6px 32px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);

      &.bc-account-field--error {
        color: var(--bc-alarm);
      }
    }
  }
</style>
