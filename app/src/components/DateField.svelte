<script>
  // @ts-check
  // A date chosen in the Material 3 date picker (task 2026-11-18-272): the field shows the date in the format of Settings
  // (« 1979-03-14 », its hint when empty), and keeps it as YYYY-MM-DD. Empty until chosen.
  import ButtonField from './ButtonField.svelte';
  import DatePickerDialog from './DatePickerDialog.svelte';
  import { formatDate, partsOf, isoOf } from '../lib/profile-format.js';
  import { dateHint } from '../lib/format.js';

  /** @type {{ label: string, value: string, placeholder?: string, supporting?: string, minYear?: number, maxYear?: number }} */
  let { label, value = $bindable(), placeholder = dateHint(), supporting = '', minYear = 1920, maxYear = new Date().getFullYear() } = $props();

  let open = $state(false);
  const parts = $derived(partsOf(value, maxYear));
</script>

<ButtonField {label} value={value ? formatDate(value) : placeholder} icon="calendar" {supporting} onclick={() => (open = true)} />

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
