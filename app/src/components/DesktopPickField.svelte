<script>
  // @ts-check
  // A grey field that opens a picker instead of a text input: the date and the entry time of the « Date et heure » card
  // (tasks 2026-11-24-386 and 387; mock-ups bureau-carnet-profil-droite, detail-onglets-android). Same look as
  // DesktopEditField at rest (label above, 40 dp field), a trailing icon says what opens.
  import Icon from './Icon.svelte';

  /** @type {{ label: string, value: string, icon: 'calendar'|'clock', name?: string, disabled?: boolean, onclick: () => void }} */
  let { label, value, icon, name = '', disabled = false, onclick } = $props();
  const uid = $props.id();
</script>

<div class="bc-desktop-pick-field" data-field={name || undefined}>
  <span class="bc-desktop-pick-field--label" id="bc-pf-{uid}">{label}</span>
  <button type="button" class="bc-desktop-pick-field--rest" aria-labelledby="bc-pf-{uid} bc-pf-v-{uid}" {disabled} {onclick}>
    <span class="bc-desktop-pick-field--value bc-value" id="bc-pf-v-{uid}">{value}</span>
    <Icon name={icon} size={20} />
  </button>
</div>

<style>
  @layer bc.components {
    .bc-desktop-pick-field {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bc-desktop-pick-field--label {
      font-size: 13px;
      color: var(--bc-text-2);
    }

    .bc-desktop-pick-field--rest {
      box-sizing: border-box;
      width: 100%;
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px;
      border: 0;
      border-radius: 8px;
      background: var(--bc-field-rest);
      color: var(--bc-text);
      font: inherit;
      font-size: 15px;
      text-align: start;
      cursor: pointer;
      &:hover:not(:disabled),
      &:focus-visible {
        box-shadow: inset 0 0 0 1px var(--bc-field-hover);
        outline: 0;
      }
      &:disabled {
        opacity: 0.55;
        cursor: default;
      }
    }

    .bc-desktop-pick-field--value {
      flex: 1;
      min-width: 0;
    }

    .bc-desktop-pick-field--rest :global(.bc-icon) {
      flex: none;
      color: var(--bc-text-2);
    }
  }
</style>
