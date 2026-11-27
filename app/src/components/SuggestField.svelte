<script>
  // @ts-check
  // A text field with suggestions under it while it has the focus (task 2026-11-27-412: Country and Region of a site on a
  // phone and a tablet). Any value can be typed; a suggestion only fills the field. `suggest` gives the proposals for the
  // typed text, the values already in the logbook first (their count shown), then the others (lib/desktop-sites.js, completions).
  import TextField from './TextField.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   label: string,
   *   value: string,
   *   supporting?: string,
   *   suggest: (text: string) => { value: string, count: number }[],
   * }}
   */
  let { label, value = $bindable(), supporting = '', suggest } = $props();

  let focused = $state(false);
  const proposals = $derived(focused && value ? suggest(value).filter((p) => p.value !== value) : []);
</script>

<div class="bc-suggest-field" onfocusin={() => (focused = true)} onfocusout={() => (focused = false)}>
  <TextField {label} bind:value {supporting} />
  {#if proposals.length}
    <ul class="bc-suggest-field--list" aria-label={t('diveSite.suggestions')}>
      {#each proposals as p (p.value)}
        <li>
          <button type="button" onpointerdown={(e) => e.preventDefault()} onclick={() => (value = p.value)}>
            <span>{p.value}</span>
            {#if p.count}<span class="bc-suggest-field--count bc-value">{p.count}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  @layer bc.components {
    .bc-suggest-field--list {
      margin: 0 var(--bc-field-margin, 16px);
      padding: 4px 0;
      list-style: none;
      border-radius: 0 0 12px 12px;
      background: var(--bc-surface);
      box-shadow: 0 2px 6px rgb(0 0 0 / 0.15);
      & button {
        box-sizing: border-box;
        width: 100%;
        min-height: 48px;
        padding: 8px 16px;
        border: 0;
        background: none;
        color: var(--bc-text);
        font: inherit;
        font-size: 16px;
        text-align: start;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
      }
    }
    .bc-suggest-field--count {
      font-size: 14px;
      color: var(--bc-text-2);
    }
  }
</style>
