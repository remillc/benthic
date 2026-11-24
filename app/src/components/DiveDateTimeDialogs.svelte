<script>
  // @ts-check
  // The pickers of the dive detail's « Date et heure » card (tasks 2026-11-24-386 and 387): the MD3 date picker and
  // time picker everywhere but on iPhone and iPad, where the wheels are used, as in « Modifier la plongée »
  // (pages/EditDive.svelte). It gives back the dive's new start as `YYYY-MM-DDTHH:MM:SS`; the caller saves it.
  import DatePickerDialog from './DatePickerDialog.svelte';
  import TimePickerDialog from './TimePickerDialog.svelte';
  import WheelDialog from './WheelDialog.svelte';
  import { ios } from '../lib/layout.svelte.js';
  import { locale } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  /**
   * `date`: the dive's start now (`YYYY-MM-DDTHH:MM:SS`). `kind`: which picker is open.
   * @type {{ date: string, kind: 'date'|'time', onconfirm: (iso: string) => void, onclose: () => void }}
   */
  let { date, kind, onconfirm, onclose } = $props();

  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const daysIn = (/** @type {number} */ y, /** @type {number} */ m) => new Date(y, m + 1, 0).getDate();
  // svelte-ignore state_referenced_locally
  const [year, month, day, hour, minute, second] = date.split(/[-T:]/).map(Number);
  const current = { year, month: month - 1, day, hour, minute, second: second || 0 };
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear + 2 - 1950 }, (_, i) => 1950 + i);
  const monthNames = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(locale, { month: 'short' }));

  /** @param {{ year: number, month: number, day: number, hour: number, minute: number, second: number }} d */
  const iso = (d) => `${d.year}-${two(d.month + 1)}-${two(Math.min(d.day, daysIn(d.year, d.month)))}T${two(d.hour)}:${two(d.minute)}:${two(d.second)}`;

  const dateWheels = [
    { label: t('newDive.day'), values: Array.from({ length: 31 }, (_, i) => String(i + 1)), index: current.day - 1, defaultIndex: current.day - 1 },
    { label: t('newDive.month'), values: monthNames, index: current.month, defaultIndex: current.month },
    { label: t('newDive.year'), values: years.map(String), index: Math.max(0, years.indexOf(current.year)), defaultIndex: Math.max(0, years.indexOf(current.year)) },
  ];
  const timeWheels = [
    { label: t('newDive.hour'), values: Array.from({ length: 24 }, (_, i) => two(i)), index: current.hour, defaultIndex: current.hour },
    { label: t('newDive.minute'), values: Array.from({ length: 60 }, (_, i) => two(i)), index: current.minute, defaultIndex: current.minute },
  ];
</script>

{#if kind === 'date' && !ios}
  <DatePickerDialog
    year={current.year}
    month={current.month}
    day={current.day}
    maxYear={thisYear + 1}
    oncancel={onclose}
    onconfirm={(d) => {
      onconfirm(iso({ ...current, year: d.year, month: d.month, day: d.day }));
      onclose();
    }}
  />
{:else if kind === 'time' && !ios}
  <TimePickerDialog
    hour={current.hour}
    minute={current.minute}
    oncancel={onclose}
    onconfirm={(time) => {
      onconfirm(iso({ ...current, hour: time.hour, minute: time.minute }));
      onclose();
    }}
  />
{:else if kind === 'date'}
  <WheelDialog
    title={t('edit.date')}
    wheels={dateWheels}
    oncancel={onclose}
    onconfirm={([d, m, y]) => {
      onconfirm(iso({ ...current, year: years[y], month: m, day: Math.min(d + 1, daysIn(years[y], m)) }));
      onclose();
    }}
  />
{:else}
  <WheelDialog
    title={t('edit.time')}
    wheels={timeWheels}
    oncancel={onclose}
    onconfirm={([h, m]) => {
      onconfirm(iso({ ...current, hour: h, minute: m }));
      onclose();
    }}
  />
{/if}
