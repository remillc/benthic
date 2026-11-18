<script>
  // @ts-check
  // A date chosen in the Material 3 date picker (task 2026-11-18-272): the field shows the date written out, « 14 mars
  // 1979 », and keeps it as YYYY-MM-DD. Empty until chosen.
  import ButtonField from './ButtonField.svelte';
  import DatePickerDialog from './DatePickerDialog.svelte';
  import { formatLongDate, partsOf, isoOf } from '../lib/profile-format.js';

  /** @type {{ label: string, value: string, placeholder?: string, supporting?: string, minYear?: number, maxYear?: number }} */
  let { label, value = $bindable(), placeholder = '', supporting = '', minYear = 1920, maxYear = new Date().getFullYear() } = $props();

  let open = $state(false);
  const parts = $derived(partsOf(value, maxYear));
</script>

<ButtonField {label} value={value ? formatLongDate(value) : placeholder} icon="calendar" {supporting} onclick={() => (open = true)} />

{#if open}
  <DatePickerDialog
    year={parts.year}
    month={parts.month}
    day={parts.day}
    {minYear}
    {maxYear}
    oncancel={() => (open = false)}
    onconfirm={(d) => {
      value = isoOf(d);
      open = false;
    }}
  />
{/if}
