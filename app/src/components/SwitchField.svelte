<script>
  // @ts-check
  // A yes or no in a form (task 2026-11-19-309, « Propre O₂ », « Compatible nitrox »): the label, a line under it that says
  // what the switch does, and the switch at the end of the row. Same switch as Réglages (Framework7's toggle).

  /** @type {{ label: string, checked: boolean, supporting?: string, disabled?: boolean, id?: string, onchange?: (checked: boolean) => void }} */
  let { label, checked = $bindable(), supporting = '', disabled = false, id = `od-switch-${Math.random().toString(36).slice(2, 8)}`, onchange } = $props();
</script>

<div class="od-switch-field">
  <span class="od-switch-field--texts">
    <span class="od-switch-field--label" id={id}>{label}</span>
    {#if supporting}<span class="od-switch-field--supporting">{supporting}</span>{/if}
  </span>
  <label class="toggle"><input type="checkbox" role="switch" aria-labelledby={id} bind:checked {disabled} onchange={() => onchange?.(checked)} /><span class="toggle-icon"></span></label>
</div>

<style>
  @layer od.components {
    .od-switch-field {
      min-height: 56px;
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-switch-field--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-switch-field--label {
      font-size: 16px;
      line-height: 22px;
      font-weight: 500;
    }

    .od-switch-field--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }
  }
</style>
