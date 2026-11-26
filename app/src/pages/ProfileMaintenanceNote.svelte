<script>
  // @ts-check
  // « Noter un entretien » (task 2026-11-18-274, docs/mockups-release/ent-noter-android.dc.html): the type (a connected
  // group Entretien / Inspection / Autre, with one sentence on the chosen type), the date, « Fait par » with the
  // shops already used as suggestions, the cost (optional), the notes, a photo of the invoice, and a note of the next
  // due date. The reminder is told by the query `item` (its id); without it the entry goes to the piece's first
  // reminder of the type, or to a new one without a rule.
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import ButtonGroup from '../components/ButtonGroup.svelte';
  import DateField from '../components/DateField.svelte';
  import TextField from '../components/TextField.svelte';
  import ComboField from '../components/ComboField.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import { gear, loadInventory, change } from '../lib/inventory.svelte.js';
  import { entryProblems } from '../lib/inventory.js';
  import { todayIso, nextDueAfter, parseStamp } from '../lib/maintenance.js';
  import { taskLabel } from '../lib/maintenance-text.js';
  import { photoToDataUrl } from '../lib/photo.js';
  import { dateHint, formatDate, readTypedDate, typedDate } from '../lib/format.js';
  import { liveError } from '../lib/live-validation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { t } from '../lib/i18n.js';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { profileWide } from '../lib/profile-frame.js';

  /** @type {{ f7route: { params: Record<string, string>, query?: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();

  const gearId = f7route.params.id;
  const itemId = f7route.query?.item ?? '';

  /** @type {'service'|'inspection'|'other'} */
  let kind = $state('service');
  let doneOn = $state(typedDate(todayIso()));
  /** The day, chosen in the calendar (every note but a hydrostatic test, which also takes a stamp typed by hand). */
  let doneDay = $state(todayIso());
  let doneBy = $state('');
  let cost = $state('');
  let notes = $state('');
  let invoiceUrl = $state('');
  let saving = $state(false);
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();

  onMount(loadInventory);

  const piece = $derived(gear.pieces.find((g) => g.id === gearId));
  const item = $derived(gear.maintenance.find((m) => m.id === itemId));
  /** The shops already used, most recent first. */
  const shops = $derived(
    [...new Set(gear.maintenance.flatMap((m) => m.history ?? []).sort((a, b) => (a.doneOn < b.doneOn ? 1 : -1)).map((h) => h.doneBy ?? '').filter(Boolean))],
  );
  /** A hydrostatic test is dated by the stamp on the bottle (« 03/22 »: the first of March 2022), or by a full date. */
  const hydro = $derived(item?.task === 'hydrostatic');
  const effectiveDate = $derived(hydro ? (parseStamp(doneOn) ?? readTypedDate(doneOn) ?? doneOn) : doneDay);
  const problems = $derived(entryProblems({ doneOn: effectiveDate, cost }));
  const dateLive = liveError(
    () => doneOn,
    () => (problems.doneOn ? t('maintenance.note.dateInvalid', { example: typedDate('2026-11-17') }) : ''),
  );
  const costLive = liveError(
    () => cost,
    () => (problems.cost ? t('maintenance.note.costInvalid') : ''),
  );
  const canSave = $derived(!problems.doneOn && !problems.cost && !saving && !gear.readOnly);

  /** The note under the form: the next due date once this one is saved. */
  const nextLine = $derived.by(() => {
    if (!item || (item.intervalMonths == null && item.intervalDives == null)) return t('maintenance.note.nextNone');
    const date = problems.doneOn ? null : nextDueAfter(item, effectiveDate);
    const n = item.intervalDives;
    if (date && n != null) return t('maintenance.note.nextBoth', { date: formatDate(date), n });
    if (date) return t('maintenance.note.nextDate', { date: formatDate(date) });
    return t('maintenance.note.nextDives', { n: n ?? 0 });
  });

  /** @param {Event} e */
  async function pickInvoice(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      invoiceUrl = await photoToDataUrl(file);
    } catch {
      showSnackbar(t('gear.pieceNew.photoFailed'));
    }
  }

  async function save() {
    if (!canSave) return;
    saving = true;
    try {
      const amount = cost.trim() ? Number(cost.trim().replace(',', '.')) : null;
      await change(async (inv) => {
        const invoicePhotoId = invoiceUrl ? await inv.savePhoto(invoiceUrl) : undefined;
        await inv.noteMaintenance({ id: item?.id, gearId, task: item?.task ?? 'service', label: item?.label }, { kind, doneOn: effectiveDate, doneBy, cost: amount, notes, invoicePhotoId });
      });
      showSnackbar(t('maintenance.note.saved'));
      f7router.back();
    } catch (e) {
      showSnackbar(t(/** @type {any} */ (e)?.name === 'ReadOnlyError' ? 'gear.inventory.readOnlyRefused' : 'maintenance.note.failed'));
    } finally {
      saving = false;
    }
  }
</script>

{#snippet body()}

  <ReadOnlyNotice />

  <p class="bc-maintenance-note--what">{[piece?.name ?? '', item ? taskLabel(item).toLocaleLowerCase() : ''].filter(Boolean).join(' · ')}</p>

  <div class="bc-maintenance-note--fields">
    <h2 class="bc-maintenance-note--group" id="bc-note-kind">{t('maintenance.note.type')}</h2>
    <ButtonGroup
      ariaLabelledby="bc-note-kind"
      marked
      value={kind}
      onchange={(v) => (kind = /** @type {any} */ (v))}
      options={[
        { value: 'service', label: t('maintenance.kind.service') },
        { value: 'inspection', label: t('maintenance.kind.inspection') },
        { value: 'other', label: t('maintenance.kind.other') },
      ]}
    />
    <p class="bc-maintenance-note--help">{t(`maintenance.kindHelp.${kind}`)}</p>

    {#if hydro}
      <TextField label={t('maintenance.note.date')} bind:value={doneOn} inputmode="numeric" invalid={!!dateLive.error} supporting={dateLive.error || t('maintenance.note.stampHint', { format: dateHint() })} />
    {:else}
      <DateField label={t('maintenance.note.date')} bind:value={doneDay} maxYear={new Date().getFullYear()} supporting={dateLive.error} />
    {/if}
    <ComboField label={t('maintenance.note.doneBy')} bind:value={doneBy} options={shops} supporting={t('maintenance.note.doneByHint')} />
    <TextField label={t('maintenance.note.cost')} bind:value={cost} inputmode="decimal" invalid={!!costLive.error} supporting={costLive.error} />
    <TextField label={t('maintenance.note.notes')} bind:value={notes} multiline />

    <div class="bc-maintenance-note--invoice">
      {#if invoiceUrl}
        <img src={invoiceUrl} alt={t('maintenance.note.invoiceAlt')} class="bc-maintenance-note--invoice-image" />
      {/if}
      <button type="button" class="bc-maintenance-note--tonal" onclick={() => fileInput?.click()}>
        <Icon name="camera" size={20} />{invoiceUrl ? t('maintenance.note.invoiceChange') : t('maintenance.note.invoiceAdd')}
      </button>
      {#if invoiceUrl}
        <button type="button" class="bc-maintenance-note--text" onclick={() => (invoiceUrl = '')}>{t('maintenance.note.invoiceRemove')}</button>
      {/if}
      <input bind:this={fileInput} class="bc-maintenance-note--file" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={pickInvoice} />
    </div>

    <p class="bc-maintenance-note--next"><Icon name="info" size={18} /><span>{nextLine}</span></p>
  </div>
  <div class="bc-maintenance-note--bottom"></div>
{/snippet}

<Page class="bc-maintenance-note">
  <Navbar>
    {#snippet left()}
      <a href="#close" class="link icon-only external" role="button" onclick={(e) => (e.preventDefault(), f7router.back())}>
        <Icon name="close" /><span class="bc-sr-only">{t('maintenance.note.close')}</span>
      </a>
    {/snippet}
    {#snippet title()}{t('maintenance.note.title')}{/snippet}
    {#snippet right()}
      <button type="button" class="bc-maintenance-note--save" disabled={!canSave} onclick={save}>{t('maintenance.note.save')}</button>
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="maintenance" list="maintenance" selected={gearId} bar="dialog" size="s">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

<style>
  @layer bc.components {
    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.bc-maintenance-note .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .bc-maintenance-note--save {
      height: 40px;
      margin-inline-end: 8px;
      padding: 0 20px;
      border: none;
      border-radius: 20px;
      background: var(--bc-secondary);
      color: var(--bc-on-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      &:disabled {
        opacity: 0.38;
      }
    }

    .bc-maintenance-note--what {
      margin: 12px 20px 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-maintenance-note--fields {
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-maintenance-note--group {
      margin: 8px 4px 0;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: var(--bc-text-2);
    }

    .bc-maintenance-note--help {
      margin: -4px 4px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-maintenance-note--invoice {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .bc-maintenance-note--invoice-image {
      width: 72px;
      height: 72px;
      border-radius: 16px;
      object-fit: cover;
    }

    .bc-maintenance-note--tonal,
    .bc-maintenance-note--text {
      width: auto;
      height: 40px;
      padding: 0 16px 0 12px;
      border: none;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--bc-tonal);
      color: var(--bc-on-secondary-container);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-maintenance-note--text {
      padding: 0 12px;
      background: none;
      color: var(--bc-secondary);
    }

    .bc-maintenance-note--file {
      display: none;
    }

    .bc-maintenance-note--next {
      margin: 4px 4px 0;
      display: flex;
      gap: 8px;
      font-size: 14px;
      line-height: 20px;
    }

    .bc-maintenance-note--bottom {
      height: 48px;
    }
  }
</style>
