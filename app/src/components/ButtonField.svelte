<script>
  // @ts-check
  import Icon from './Icon.svelte';
  import { ios } from '../lib/layout.svelte.js';
  // A value chosen in a dialog (date, time, site): drawn as the MD3 filled
  // field of SelectField, the label small above the value, a button that
  // opens the dialog. Without `onclick`, a read-only field (no arrow). A date field
  // ends with a calendar icon and a time field with a clock icon (Android, spec section 8),
  // never a chevron.

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   onclick?: () => void,
   *   supporting?: string,
   *   icon?: 'calendar'|'clock',
   * }}
   * icon: the trailing icon of a date or a time field (24 dp).
   */
  let { label, value, onclick, supporting = '', icon } = $props();
</script>

<div class="bc-button-field bc-button-field--field">
  {#if onclick}
    <button type="button" class="bc-button-field--box" {onclick}>
      <span class="bc-button-field--label">{label}</span>
      <span class="bc-button-field--value">{value}</span>
      <span class="bc-button-field--arrow"><Icon name={icon && !ios ? icon : ios ? 'expand' : 'chevron'} /></span>
    </button>
  {:else}
    <div class="bc-button-field--box bc-button-field--readonly">
      <span class="bc-button-field--label">{label}</span>
      <span class="bc-button-field--value">{value}</span>
    </div>
  {/if}
  {#if supporting}<p class="bc-button-field--supporting">{supporting}</p>{/if}
</div>

<style>
  @layer od.components {
    .bc-button-field--field {
      margin: 18px var(--bc-field-margin, 16px) 0;
      min-width: 0;
    }

    .bc-button-field--box {
      position: relative;
      display: block;
      width: 100%;
      height: 56px;
      box-sizing: border-box;
      padding: 24px var(--bc-button-field-end, 48px) 6px 16px;
      border: none;
      border-radius: 4px 4px 0 0;
      background: var(--bc-surface-2);
      color: var(--bc-text);
      font: inherit;
      text-align: start;

      &::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: var(--bc-outline-width);
        background: var(--bc-text-2);
      }

      &:focus-visible::after {
        height: 2px;
        background: var(--bc-primary-action);
      }

      &.bc-button-field--readonly {
        padding-right: 16px;
        color: var(--bc-text-2);
      }

      :global(.ios) & {
        border-radius: 10px;
        background: var(--bc-surface);

        &::after {
          display: none;
        }
      }
    }

    .bc-button-field--label {
      position: absolute;
      left: 16px;
      top: 8px;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }

    .bc-button-field--value {
      display: block;
      font-size: 16px;
      line-height: 24px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* A compact field sets --bc-button-field-arrow: none and a smaller --bc-button-field-end. */
    .bc-button-field--arrow {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: var(--bc-button-field-arrow, flex);
      color: var(--bc-text-2);
    }

    .bc-button-field--supporting {
      margin: 4px 16px 0;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0.4px;
      color: var(--bc-text-2);
    }
  }
</style>
