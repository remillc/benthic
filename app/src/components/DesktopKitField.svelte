<script>
  // @ts-check
  // The kit of a dive in the Équipement tab (task 2026-11-24-382; mock-ups bureau-carnet-onglet-equipement and
  // android-tablette-detail-onglet-equipement-*): a grey field with the kit's name, its piece count and a chevron, which
  // opens a menu (a bottom sheet on a phone) with « Plongée précédente », the diver's kits, a divider and « Gérer les kits ».
  // The caller applies the choice. The Benthic+ card holds it, so there is no « Changer de kit » button.
  import RowMenu from './RowMenu.svelte';
  import DetailSheet from './DetailSheet.svelte';
  import Icon from './Icon.svelte';
  import { layout } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   name: string,
   *   pieces: string,
   *   value: string,
   *   options: { value: string, label: string, example?: string, icon?: string, divider?: boolean }[],
   *   invitation: string,
   *   label: string,
   *   onselect: (value: string) => void,
   * }}
   * `name` and `pieces`: what the field shows (the applied kit's name and « 7 pièces »); `value`: the applied kit's id.
   */
  let { name, pieces, value, options, invitation, label, onselect } = $props();

  /** @type {HTMLElement|undefined} */
  let field = $state();
  let open = $state(false);
</script>

<button
  type="button"
  class="bc-desktop-kit-field"
  class:bc-desktop-kit-field--empty={!name}
  class:bc-desktop-kit-field--open={open}
  data-field="kit"
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={name ? `${label}, ${name}, ${pieces}` : `${label}, ${invitation}`}
  bind:this={field}
  onclick={() => (open = true)}
>
  <span class="bc-desktop-kit-field--texts">
    <span class="bc-desktop-kit-field--name">{name || invitation}</span>
    {#if name && pieces}<span class="bc-desktop-kit-field--pieces">{pieces}</span>{/if}
  </span>
  <Icon name="expand" size={24} />
</button>

{#if open && field}
  {#if layout.phone}
    <DetailSheet title={label} {options} {value} {onselect} onclose={() => (open = false)} />
  {:else}
    <RowMenu anchor={field} {label} {options} {value} width={Math.max(field.getBoundingClientRect().width, 300)} {onselect} onclose={() => (open = false)} />
  {/if}
{/if}

<style>
  @layer bc.components {
    .bc-desktop-kit-field {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px 0 16px;
      border: 0;
      border-radius: 12px;
      background: var(--bc-field-rest);
      color: var(--bc-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      &:hover {
        box-shadow: inset 0 0 0 1px var(--bc-field-hover);
      }
    }

    .bc-desktop-kit-field--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-desktop-kit-field--name {
      font-size: 15px;
      line-height: 22px;
      font-weight: 500;
    }

    .bc-desktop-kit-field--empty .bc-desktop-kit-field--name {
      font-weight: 400;
      color: var(--bc-text-2);
    }

    .bc-desktop-kit-field--pieces {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-desktop-kit-field :global(.bc-icon) {
      flex: none;
      color: var(--bc-text-2);
    }
  }
</style>
