<script>
  // @ts-check
  // The full-screen dialog of a cylinder of the dive detail's Gaz tab on an Android phone (task 2026-11-26-401; mock-ups
  // detail-bouteille-android and detail-bouteilles-recycleur-android): × closes without saving, « Enregistrer » saves,
  // then one white card per cylinder with the type, O₂ and He side by side, the name of the mix and the two pressures, each
  // with the camera that reads a gauge (« Photo du manomètre », Android) and, under them, the pressure used.
  // A cylinder alone also has its role, « Changement de gaz à » with its MOD and « Retirer la bouteille »; a rebreather's two
  // cylinders (oxygen first, then diluent; the oxygen one with O₂ only) share one dialog and a footnote (task 2026-11-26-403).
  // The pressures of a dive read from a computer are read-only (no camera then).
  // On an iPhone the same dialog is a sheet drawn as the iOS mock-ups do (ios-detail-bouteille and ios-detail-bouteilles-recycleur):
  // « Annuler », the title and « OK » in a bar, grouped lists with the label at the left and the value at the right, no camera. The dialog edits copies: nothing is written until « Enregistrer » (the page does it). Moved under <body>
  // like the other dialogs; Escape and the system Back close it (lib/back-button.js).
  // `desktop` (task 2026-11-26-410; mock-ups bureau-detail-bouteille and bureau-detail-bouteilles-recycleur): a centred dialog
  // over a scrim, 560 px for one cylinder and 760 px for a rebreather's two side by side (oxygen on the left), the title, the
  // fields, then « Retirer la bouteille » at the left and « Annuler » / « Enregistrer » at the right; no camera, no move.
  import Icon from './Icon.svelte';
  import SelectField from './SelectField.svelte';
  import TextField from './TextField.svelte';
  import GaugeSheet from './GaugeSheet.svelte';
  import { t } from '../lib/i18n.js';
  import { chooseType, consumption, draftErrors, hasErrors, mixHelper, modMm, pressureText } from '../lib/cylinder-dialog.js';
  import { OTHER_TYPE } from '../lib/cylinder-card.js';
  import { gaugeCameraAvailable, runGaugeCamera } from '../lib/gauge-photo.js';
  import { readGauges } from '../lib/gauge-reading.js';
  import { formatDepth, formatPressure } from '../lib/format.js';
  import DetailSheet from './DetailSheet.svelte';
  import { ios } from '../lib/layout.svelte.js';

  /**
   * `parts`: one per cylinder (`badge`: « DIL » or « O₂ » for a rebreather's, none for a single cylinder, which gets the
   * cylinder icon; `oxygenOnly`: no He field); `draft` is the cylinder's texts, edited in place.
   * `roles`: the role options of a single cylinder (none for a rebreather). `onremove`: given only for a cylinder that can
   * be removed.
   * @type {{
   *   title: string,
   *   parts: { key: string, heading: string, badge?: string, oxygenOnly?: boolean, draft: import('../lib/cylinder-dialog.js').CylinderDraft }[],
   *   typeOptions: (draft: import('../lib/cylinder-dialog.js').CylinderDraft) => { value: string, label: string }[],
   *   roles?: { value: string, label: string }[],
   *   prefs: { pressure: string, length?: string, volume?: string },
   *   types?: { name: string, ml: number, workingPressureMbar: number }[],
   *   mod?: { surfaceMbar: number, salinity: number },
   *   footnote?: string,
   *   onsave: () => void,
   *   onclose: () => void,
   *   onremove?: () => void,
   *   onmove?: (step: -1|1) => void,
   *   canMove?: { up: boolean, down: boolean },
   *   desktop?: boolean,
   * }}
   */
  let { title, parts = $bindable(), typeOptions, roles, prefs, types = [], mod = { surfaceMbar: 1013, salinity: 10300 }, footnote = '', onsave, onclose, onremove, onmove, canMove = { up: true, down: true }, desktop = false } = $props();

  const id = `bc-cylinder-dialog-${Math.random().toString(36).slice(2, 9)}`;
  const words = $derived({ air: t('edit.gasName.air'), oxygen: t('edit.gasName.oxygen'), nitrox: t('edit.gasName.nitrox'), trimix: t('edit.gasName.trimix') });
  const errors = $derived(parts.map((p) => draftErrors(p.draft, prefs, { oxygenOnly: p.oxygenOnly })));
  const invalid = $derived(errors.some(hasErrors));
  const unit = $derived(prefs.pressure === 'psi' ? t('units.psi') : t('units.bar'));
  const depthUnit = $derived(prefs.length === 'ft' ? t('units.feet') : t('units.meters'));
  /** The camera of Début and Fin: every dive, on a device that has the gauge camera (not on an iPhone). */
  /** Android phones and tablets (the tablet's dialog is the desktop's, task 2026-11-27-411); never the desktop app. */
  const camera = $derived(!ios && gaugeCameraAvailable());
  /** The menu of a grey row of the iOS sheet: the cylinder type or the role of a part. @type {{ key: string, field: 'description'|'use' }|null} */
  let picking = $state(null);
  const pickingPart = $derived(picking ? parts.find((p) => p.key === picking?.key) : undefined);
  /** The types of the table, then « Autre… » (a cylinder outside it, with its own size and working pressure). @param {import('../lib/cylinder-dialog.js').CylinderDraft} draft */
  const typeList = (draft) => [...typeOptions(draft), { value: OTHER_TYPE, label: t('edit.otherType') }];
  /** @param {import('../lib/cylinder-dialog.js').CylinderDraft} draft */
  const typeValue = (draft) => (draft.custom ? OTHER_TYPE : draft.description);
  const volumeUnit = $derived(prefs.volume === 'cuft' ? t('units.cubicFeet') : t('units.liters'));
  const pickingOptions = $derived(pickingPart && picking ? (picking.field === 'use' ? (roles ?? []) : typeList(pickingPart.draft)) : []);
  /** The shown label of a menu row. @param {typeof parts[number]} part @param {'description'|'use'} field */
  const menuLabel = (part, field) => (field === 'use' ? roles : typeList(part.draft))?.find((o) => o.value === (field === 'use' ? part.draft.use : typeValue(part.draft)))?.label ?? part.draft[field];

  /** « MOD 132 pi à ppO₂ 1,6 » for a typed O₂, empty while it is not a mix. @param {{ o2: string }} draft */
  function modLine(draft) {
    const mm = modMm(Number(draft.o2.trim().replace(',', '.')), mod.surfaceMbar, mod.salinity);
    return mm ? t('edit.mod', { depth: formatDepth(mm, /** @type {any} */ ({ length: prefs.length ?? 'm' })), po2: '1,6' }) : '';
  }
  /** What sits under Début and Fin. @param {import('../lib/cylinder-dialog.js').CylinderDraft} draft */
  function usedLine(draft) {
    const c = consumption(draft, prefs);
    return c ? (c.kind === 'used' ? t('edit.consumed', { amount: formatPressure(c.mbar, /** @type {any} */ (prefs)) }) : t('desktopDetail.cylinderDialog.notBreathed')) : '';
  }

  // --- Reading a pressure from a photo (lib/gauge-photo.js, components/GaugeSheet.svelte), as the old editor did. ---
  /** @type {{ field: 'start'|'end', key: string, readings: { text: string, x: number }[], thumbnail: string }|null} */
  let gauge = $state(null);
  let gaugeOpen = false;
  /** @param {string} key @param {'start'|'end'} field */
  function focusPressure(key, field) {
    queueMicrotask(() => /** @type {HTMLInputElement|null} */ (document.querySelector(`[data-cylinder-part="${key}"] [data-field="cylinder-${field}"] input`))?.focus());
  }
  /** @param {typeof parts[number]} part @param {'start'|'end'} field */
  async function readGauge(part, field) {
    if (gaugeOpen) return;
    gaugeOpen = true;
    try {
      const result = await runGaugeCamera({
        field,
        cylinder: part.heading,
        gas: mixHelper(part.draft, words, part.oxygenOnly),
        userUnit: prefs.pressure === 'psi' ? 'psi' : 'bar',
        decide: (blocks, userUnit) => readGauges(blocks, { userUnit }),
      });
      if (result.action === 'manual') focusPressure(part.key, field);
      else if (result.action === 'photo') gauge = { field, key: part.key, thumbnail: result.thumbnail, readings: result.readings.map((r) => ({ text: pressureText(r.mbar, prefs), x: r.x })) };
    } catch (e) {
      console.error('Gauge camera', e);
      focusPressure(part.key, field);
    } finally {
      gaugeOpen = false;
    }
  }
  /** @param {{ target: string, text: string }[]} items */
  function useReadings(items) {
    const g = gauge;
    gauge = null;
    if (!g) return;
    for (const item of items) {
      const target = parts.find((p) => p.key === item.target);
      if (target) target.draft[g.field] = item.text;
    }
  }
  function retryGauge() {
    const g = gauge;
    gauge = null;
    const part = g && parts.find((p) => p.key === g.key);
    if (g && part) readGauge(part, g.field);
  }

  /** @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      onclose();
    };
    node.addEventListener('bc-cancel', cancel);
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('[role="dialog"]'))?.focus({ preventScroll: true }));
    return {
      destroy() {
        node.removeEventListener('bc-cancel', cancel);
        node.remove();
        previous?.focus?.();
      },
    };
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bc-cylinder-dialog" use:portal onkeydown={keydown}>
  {#if ios}
    <div class="bc-cylinder-dialog--surface bc-cylinder-dialog--ios" role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1" data-bc-scroll>
      <div class="bc-cylinder-dialog--ios-bar">
        <button type="button" class="bc-cylinder-dialog--ios-cancel" onclick={onclose}>{t('dialog.cancel')}</button>
        <h1 {id} class="bc-cylinder-dialog--ios-title">{title}</h1>
        <button type="button" class="bc-cylinder-dialog--ios-ok" disabled={invalid} onclick={onsave}>{t('dialog.ok')}</button>
      </div>
      {#each parts as part, i (part.key)}
        {@const error = errors[i]}
        {@const helper = mixHelper(part.draft, words, part.oxygenOnly)}
        {@const several = parts.length > 1}
        <section data-cylinder-part={part.key}>
          {#if several}<p class="bc-cylinder-dialog--ios-caption">{part.heading}</p>{:else}<div class="bc-cylinder-dialog--ios-gap"></div>{/if}
          <div class="bc-cylinder-dialog--ios-list">
            {#if roles}
              <button type="button" class="bc-cylinder-dialog--ios-row" data-field="cylinder-role" onclick={() => (picking = { key: part.key, field: 'use' })}>
                <span class="bc-cylinder-dialog--ios-label">{t('desktopDetail.cylinderDialog.role')}</span>
                <span class="bc-cylinder-dialog--ios-value">{menuLabel(part, 'use')}</span>
                <Icon name="expand" size={18} />
              </button>
            {/if}
            <button type="button" class="bc-cylinder-dialog--ios-row" data-field="cylinder-type" onclick={() => (picking = { key: part.key, field: 'description' })}>
              <span class="bc-cylinder-dialog--ios-label">{several ? t('desktopDetail.cylinderDialog.cylinder') : t('desktopDetail.label.cylinderType')}</span>
              <span class="bc-cylinder-dialog--ios-value">{menuLabel(part, 'description')}</span>
              <Icon name="expand" size={18} />
            </button>
            {#if part.draft.custom}{@render iosCustom(part, error)}{/if}
            {#if several}
              {@render iosGas(part, error)}
              {@render iosPressures(part, error, true)}
            {/if}
          </div>
          {#if several}
            {#if !part.oxygenOnly}<p class="bc-cylinder-dialog--ios-helper" data-field="cylinder-mix-name">{helper}</p>{/if}
          {:else}
            <p class="bc-cylinder-dialog--ios-caption">{t('desktopDetail.cylinderDialog.gas')}</p>
            <div class="bc-cylinder-dialog--ios-list">
              {@render iosGas(part, error)}
              {#if roles && part.draft.use !== 'diluent' && part.draft.use !== 'oxygen'}
                <label class="bc-cylinder-dialog--ios-row" data-field="cylinder-depth">
                  <span class="bc-cylinder-dialog--ios-label">{t('edit.switchDepth')}</span>
                  <input class="bc-cylinder-dialog--ios-input" inputmode="decimal" aria-invalid={error.depth} bind:value={part.draft.depth} />
                  <span class="bc-cylinder-dialog--ios-unit">{depthUnit}</span>
                </label>
              {/if}
            </div>
            <p class="bc-cylinder-dialog--ios-helper" data-field="cylinder-mix-name">{helper}</p>
            {#if roles && part.draft.use !== 'diluent' && part.draft.use !== 'oxygen' && modLine(part.draft)}<p class="bc-cylinder-dialog--ios-helper" data-field="cylinder-mod">{modLine(part.draft)}</p>{/if}
            <p class="bc-cylinder-dialog--ios-caption">{t('desktopDetail.cylinderDialog.pressure')}</p>
            <div class="bc-cylinder-dialog--ios-list">{@render iosPressures(part, error, false)}</div>
          {/if}
          {#if usedLine(part.draft)}<p class="bc-cylinder-dialog--ios-helper" data-field="cylinder-consumed">{usedLine(part.draft)}</p>{/if}
        </section>
      {/each}
      {#if onmove}
        <div class="bc-cylinder-dialog--ios-list bc-cylinder-dialog--ios-remove" data-field="cylinder-move">
          <button type="button" class="bc-cylinder-dialog--ios-row" disabled={!canMove.up} onclick={() => onmove(-1)}>{t('desktopDetail.moveUp')}</button>
          <button type="button" class="bc-cylinder-dialog--ios-row" disabled={!canMove.down} onclick={() => onmove(1)}>{t('desktopDetail.moveDown')}</button>
        </div>
      {/if}
      {#if onremove}
        <div class="bc-cylinder-dialog--ios-list bc-cylinder-dialog--ios-remove">
          <button type="button" class="bc-cylinder-dialog--ios-row bc-cylinder-dialog--ios-destructive" onclick={onremove}>{t('desktopDetail.removeCylinder')}</button>
        </div>
      {/if}
      {#if footnote}<p class="bc-cylinder-dialog--ios-helper">{footnote}</p>{/if}
    </div>
    {#if picking && pickingPart}
      <DetailSheet
        title={picking.field === 'use' ? t('desktopDetail.cylinderDialog.role') : t('desktopDetail.label.cylinderType')}
        options={pickingOptions}
        value={picking.field === 'description' ? typeValue(pickingPart.draft) : pickingPart.draft[picking.field]}
        onselect={(v) => {
          if (picking?.field === 'description') chooseType(pickingPart.draft, v, types, prefs);
          else if (picking) pickingPart.draft[picking.field] = v;
          picking = null;
        }}
        onclose={() => (picking = null)}
      />
    {/if}
  {:else}
  {#if desktop}<div class="bc-cylinder-dialog--scrim" aria-hidden="true" onclick={onclose}></div>{/if}
  <div class="bc-cylinder-dialog--surface" class:bc-cylinder-dialog--desktop={desktop} class:bc-cylinder-dialog--wide={desktop && parts.length > 1} role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1" data-bc-scroll>
    {#if !desktop}
    <div class="bc-cylinder-dialog--bar">
      <button type="button" class="bc-cylinder-dialog--close" aria-label={t('desktopDetail.cylinderDialog.closeWithoutSaving')} onclick={onclose}><Icon name="close" size={24} /></button>
      <span class="bc-cylinder-dialog--spacer"></span>
      <button type="button" class="bc-cylinder-dialog--save" disabled={invalid} onclick={onsave}>{t('desktopDetail.cylinderDialog.save')}</button>
    </div>
    {/if}
    <h1 {id} class="bc-cylinder-dialog--title">{title}</h1>
    <div class="bc-cylinder-dialog--cards">
      {#each parts as part, i (part.key)}
        {@const error = errors[i]}
        {@const helper = mixHelper(part.draft, words, part.oxygenOnly)}
        <section class="bc-cylinder-dialog--card" data-cylinder-part={part.key}>
          {#if !desktop || parts.length > 1}
          <div class="bc-cylinder-dialog--head">
            <span class="bc-cylinder-dialog--badge" aria-hidden="true">{#if part.badge}{part.badge}{:else}<svg class="bc-cylinder-dialog--badge-icon" width="22" height="22" viewBox="0 0 24 24"><path d="M10 3h4v3h-4z M8 9a4 4 0 0 1 8 0v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" /></svg>{/if}</span>
            <h2 class="bc-cylinder-dialog--heading">{part.heading}</h2>
          </div>
          {/if}
          {#if roles}
            <div data-field="cylinder-role"><SelectField label={t('desktopDetail.cylinderDialog.role')} bind:value={part.draft.use} options={roles} /></div>
          {/if}
          <div data-field="cylinder-type"><SelectField label={t('desktopDetail.label.cylinderType')} value={typeValue(part.draft)} options={typeList(part.draft)} onchange={(v) => chooseType(part.draft, v, types, prefs)} /></div>
          {#if part.draft.custom}
            <div class="bc-cylinder-dialog--pair">
              <div data-field="cylinder-size">
                <TextField label={t('edit.size')} bind:value={part.draft.size} inputmode="decimal" invalid={error.size}>
                  {#snippet trailing()}<span class="bc-cylinder-dialog--unit">{volumeUnit}</span>{/snippet}
                </TextField>
              </div>
              <div data-field="cylinder-working-pressure">
                <TextField label={t('edit.workingPressure')} bind:value={part.draft.workingPressure} inputmode="decimal" invalid={error.workingPressure}>
                  {#snippet trailing()}<span class="bc-cylinder-dialog--unit">{unit}</span>{/snippet}
                </TextField>
              </div>
            </div>
          {/if}
          <div class="bc-cylinder-dialog--pair">
            <div data-field="cylinder-o2">
              <TextField label={t('desktopDetail.cylinderDialog.o2')} bind:value={part.draft.o2} inputmode="decimal" invalid={error.o2}>
                {#snippet trailing()}<span class="bc-cylinder-dialog--unit">%</span>{/snippet}
              </TextField>
            </div>
            {#if part.oxygenOnly}
              <div></div>
            {:else}
              <div data-field="cylinder-he">
                <TextField label={t('desktopDetail.cylinderDialog.he')} bind:value={part.draft.he} inputmode="decimal" invalid={error.he}>
                  {#snippet trailing()}<span class="bc-cylinder-dialog--unit">%</span>{/snippet}
                </TextField>
              </div>
            {/if}
          </div>
          {#if !part.oxygenOnly}
            <p class="bc-cylinder-dialog--helper" data-field="cylinder-mix-name">{helper}</p>
          {/if}
          {#if roles && part.draft.use !== 'diluent' && part.draft.use !== 'oxygen'}
            <div data-field="cylinder-depth">
              <TextField label={t('edit.switchDepth')} bind:value={part.draft.depth} inputmode="decimal" invalid={error.depth}>
                {#snippet trailing()}<span class="bc-cylinder-dialog--unit">{depthUnit}</span>{/snippet}
              </TextField>
            </div>
            <p class="bc-cylinder-dialog--helper" data-field="cylinder-mod">{modLine(part.draft)}</p>
          {/if}
          <div class="bc-cylinder-dialog--pair">
            <div data-field="cylinder-start">
              <TextField label={t('edit.start')} bind:value={part.draft.start} inputmode="decimal" invalid={error.start}>
                {#snippet trailing()}{@render pressureEnd(part, 'start')}{/snippet}
              </TextField>
            </div>
            <div data-field="cylinder-end">
              <TextField label={t('edit.end')} bind:value={part.draft.end} inputmode="decimal" invalid={error.end}>
                {#snippet trailing()}{@render pressureEnd(part, 'end')}{/snippet}
              </TextField>
            </div>
          </div>
          {#if usedLine(part.draft)}<p class="bc-cylinder-dialog--helper" data-field="cylinder-consumed">{usedLine(part.draft)}</p>{/if}
        </section>
      {/each}
    </div>
    {#if desktop}
      {#if footnote}<p class="bc-cylinder-dialog--footnote">{footnote}</p>{/if}
      <div class="bc-cylinder-dialog--desktop-actions">
        {#if onremove}<button type="button" class="bc-cylinder-dialog--remove-button" onclick={onremove}><Icon name="delete" size={18} />{t('desktopDetail.removeCylinder')}</button>{/if}
        <span class="bc-cylinder-dialog--spacer"></span>
        <button type="button" class="bc-cylinder-dialog--desktop-cancel" onclick={onclose}>{t('dialog.cancel')}</button>
        <button type="button" class="bc-cylinder-dialog--desktop-save" disabled={invalid} onclick={onsave}>{t('desktopDetail.cylinderDialog.save')}</button>
      </div>
    {:else}
    {#if onmove}
      <div class="bc-cylinder-dialog--remove" data-field="cylinder-move">
        <button type="button" class="bc-cylinder-dialog--remove-button" disabled={!canMove.up} onclick={() => onmove(-1)}><Icon name="arrowUp" size={20} />{t('desktopDetail.moveUp')}</button>
        <button type="button" class="bc-cylinder-dialog--remove-button" disabled={!canMove.down} onclick={() => onmove(1)}><Icon name="arrowDown" size={20} />{t('desktopDetail.moveDown')}</button>
      </div>
    {/if}
    {#if onremove}
      <div class="bc-cylinder-dialog--remove">
        <button type="button" class="bc-cylinder-dialog--remove-button" onclick={onremove}><Icon name="delete" size={20} />{t('desktopDetail.removeCylinder')}</button>
      </div>
    {/if}
    {#if footnote}<p class="bc-cylinder-dialog--footnote">{footnote}</p>{/if}
    {/if}
  </div>
  {/if}
</div>

{#snippet iosCustom(/** @type {typeof parts[number]} */ part, /** @type {ReturnType<typeof draftErrors>} */ error)}
  <label class="bc-cylinder-dialog--ios-row" data-field="cylinder-size">
    <span class="bc-cylinder-dialog--ios-label">{t('edit.size')}</span>
    <input class="bc-cylinder-dialog--ios-input" inputmode="decimal" aria-invalid={error.size} bind:value={part.draft.size} />
    <span class="bc-cylinder-dialog--ios-unit">{volumeUnit}</span>
  </label>
  <label class="bc-cylinder-dialog--ios-row" data-field="cylinder-working-pressure">
    <span class="bc-cylinder-dialog--ios-label">{t('edit.workingPressure')}</span>
    <input class="bc-cylinder-dialog--ios-input" inputmode="decimal" aria-invalid={error.workingPressure} bind:value={part.draft.workingPressure} />
    <span class="bc-cylinder-dialog--ios-unit">{unit}</span>
  </label>
{/snippet}

{#snippet iosGas(/** @type {typeof parts[number]} */ part, /** @type {ReturnType<typeof draftErrors>} */ error)}
  <label class="bc-cylinder-dialog--ios-row" data-field="cylinder-o2">
    <span class="bc-cylinder-dialog--ios-label">{t('desktopDetail.cylinderDialog.o2')}</span>
    <input class="bc-cylinder-dialog--ios-input" inputmode="decimal" aria-invalid={error.o2} bind:value={part.draft.o2} />
    <span class="bc-cylinder-dialog--ios-unit">%</span>
  </label>
  {#if !part.oxygenOnly}
    <label class="bc-cylinder-dialog--ios-row" data-field="cylinder-he">
      <span class="bc-cylinder-dialog--ios-label">{t('desktopDetail.cylinderDialog.he')}</span>
      <input class="bc-cylinder-dialog--ios-input" inputmode="decimal" aria-invalid={error.he} bind:value={part.draft.he} />
      <span class="bc-cylinder-dialog--ios-unit">%</span>
    </label>
  {/if}
{/snippet}

{#snippet iosPressures(/** @type {typeof parts[number]} */ part, /** @type {ReturnType<typeof draftErrors>} */ error, /** @type {boolean} */ long)}
  <label class="bc-cylinder-dialog--ios-row" data-field="cylinder-start">
    <span class="bc-cylinder-dialog--ios-label">{t(long ? 'desktopDetail.cylinderDialog.start' : 'desktopDetail.cylinderDialog.startShort')}</span>
    <input class="bc-cylinder-dialog--ios-input" inputmode="decimal" aria-invalid={error.start} bind:value={part.draft.start} />
    <span class="bc-cylinder-dialog--ios-unit">{unit}</span>
  </label>
  <label class="bc-cylinder-dialog--ios-row" data-field="cylinder-end">
    <span class="bc-cylinder-dialog--ios-label">{t(long ? 'desktopDetail.cylinderDialog.end' : 'desktopDetail.cylinderDialog.endShort')}</span>
    <input class="bc-cylinder-dialog--ios-input" inputmode="decimal" aria-invalid={error.end} bind:value={part.draft.end} />
    <span class="bc-cylinder-dialog--ios-unit">{unit}</span>
  </label>
{/snippet}

{#snippet pressureEnd(/** @type {typeof parts[number]} */ part, /** @type {'start'|'end'} */ field)}
  <span class="bc-cylinder-dialog--unit">{unit}</span>
  {#if camera}
    <button type="button" class="bc-cylinder-dialog--gauge" aria-label={t(field === 'start' ? 'gauge.readStart' : 'gauge.readEnd')} onclick={() => readGauge(part, field)}><Icon name="camera" size={24} /></button>
  {/if}
{/snippet}

{#if gauge}
  <GaugeSheet
    field={gauge.field}
    readings={gauge.readings}
    thumbnail={gauge.thumbnail}
    cylinders={parts.map((p) => ({ value: p.key, label: p.heading }))}
    firstTarget={gauge.key}
    {unit}
    onuse={useReadings}
    onretry={retryGauge}
    oncancel={() => (gauge = null)}
  />
{/if}

<style>
  @layer bc.components {
    .bc-cylinder-dialog {
      position: fixed;
      inset: 0;
      z-index: 13400;
      font-family: inherit;
    }

    .bc-cylinder-dialog--surface {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      overflow-y: auto;
      padding-bottom: calc(24px + var(--f7-safe-area-bottom, 0px));
      background: var(--bc-background);
      color: var(--bc-text);
      outline: none;
      --bc-field-margin: 0;
    }

    .bc-cylinder-dialog--bar {
      box-sizing: content-box;
      height: 64px;
      padding: var(--f7-safe-area-top, 0px) 4px 0;
      display: flex;
      align-items: center;
    }

    /* Framework7 stretches every button to the full width (an unlayered rule): the sizes are set here. */
    .bc-cylinder-dialog--close {
      width: 48px;
      flex: none;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: transparent;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-cylinder-dialog--spacer {
      flex: 1;
    }

    .bc-cylinder-dialog--save {
      width: auto;
      flex: none;
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

    .bc-cylinder-dialog--title {
      margin: 4px 20px 0;
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
    }

    /* The desktop (task 2026-11-26-410): a centred dialog over a scrim. */
    .bc-cylinder-dialog:has(.bc-cylinder-dialog--desktop) {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bc-cylinder-dialog--scrim {
      position: absolute;
      inset: 0;
      background: var(--bc-scrim);
    }
    .bc-cylinder-dialog--surface.bc-cylinder-dialog--desktop {
      position: relative;
      width: min(560px, calc(100% - 48px));
      height: auto;
      max-height: calc(100% - 96px);
      padding: 24px;
      border-radius: 28px;
      background: var(--bc-dialog);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25);
    }
    .bc-cylinder-dialog--surface.bc-cylinder-dialog--wide {
      width: min(760px, calc(100% - 48px));
    }
    .bc-cylinder-dialog--desktop .bc-cylinder-dialog--title {
      margin: 0 0 20px;
      padding: 0;
      font-size: 24px;
      line-height: 32px;
      font-weight: 400;
    }
    .bc-cylinder-dialog--desktop .bc-cylinder-dialog--cards {
      margin: 0;
    }
    .bc-cylinder-dialog--wide .bc-cylinder-dialog--cards {
      flex-direction: row;
      align-items: flex-start;
      gap: 16px;
      & > * {
        flex: 1;
        min-width: 0;
      }
    }
    .bc-cylinder-dialog--desktop .bc-cylinder-dialog--footnote {
      margin: 16px 0 0;
      padding: 0;
    }
    .bc-cylinder-dialog--desktop-actions {
      margin-top: 24px;
      display: flex;
      align-items: center;
      gap: 8px;
      .bc-cylinder-dialog--remove-button {
        width: auto;
        height: 40px;
        font-size: 14px;
      }
    }
    .bc-cylinder-dialog--desktop-cancel,
    .bc-cylinder-dialog--desktop-save {
      width: auto;
      height: 40px;
      padding: 0 12px;
      border: none;
      border-radius: 20px;
      background: none;
      color: var(--bc-primary);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .bc-cylinder-dialog--desktop-save {
      padding: 0 24px;
      background: var(--bc-primary);
      color: var(--bc-on-primary);
      &:disabled {
        opacity: 0.38;
        cursor: default;
      }
    }

    .bc-cylinder-dialog--cards {
      margin: 16px 12px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-cylinder-dialog--card {
      padding: 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;

      :global(.bc-text-field--field),
      :global(.bc-select-field--field) {
        margin: 0;
      }
    }

    .bc-cylinder-dialog--head {
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-cylinder-dialog--badge {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 20px;
      background: var(--bc-secondary-container);
      color: var(--bc-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }

    /* The iPhone sheet (mock-ups ios-detail-bouteille and ios-detail-bouteilles-recycleur): a bar, then grouped lists. */
    .bc-cylinder-dialog--ios-bar {
      box-sizing: content-box;
      height: 44px;
      padding: var(--f7-safe-area-top, 0px) 16px 0;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      background: var(--bc-surface);
      border-bottom: 0.5px solid var(--bc-separator);
    }

    .bc-cylinder-dialog--ios-title {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }

    .bc-cylinder-dialog--ios-cancel,
    .bc-cylinder-dialog--ios-ok {
      width: auto;
      justify-self: start;
      padding: 0;
      border: none;
      background: none;
      color: var(--bc-secondary);
      font: inherit;
      font-size: 17px;
    }

    .bc-cylinder-dialog--ios-ok {
      justify-self: end;
      font-weight: 600;

      &:disabled {
        opacity: 0.38;
      }
    }

    .bc-cylinder-dialog--ios-gap {
      height: 20px;
    }

    .bc-cylinder-dialog--ios-caption {
      margin: 20px 32px 6px;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
      text-transform: uppercase;
    }

    .bc-cylinder-dialog--ios-helper {
      margin: 6px 32px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);

      &:empty {
        display: none;
      }
    }

    .bc-cylinder-dialog--ios-list {
      margin: 0 16px;
      border-radius: 10px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-cylinder-dialog--ios-remove {
      margin-top: 28px;
    }

    .bc-cylinder-dialog--ios-row {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      margin: 0;
      padding: 0 16px;
      border: 0;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 17px;
      display: flex;
      align-items: center;
      gap: 8px;
      text-align: start;
    }

    .bc-cylinder-dialog--ios-row + .bc-cylinder-dialog--ios-row {
      box-shadow: inset 0 0.5px 0 var(--bc-separator);
    }

    .bc-cylinder-dialog--ios-label {
      flex: 1;
      min-width: 0;
    }

    .bc-cylinder-dialog--ios-value {
      color: var(--bc-text-2);
      font-variant-numeric: tabular-nums;
    }

    .bc-cylinder-dialog--ios-input {
      width: 96px;
      height: 44px;
      margin: 0;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      text-align: end;
      font-variant-numeric: tabular-nums;

      &[aria-invalid='true'] {
        color: var(--bc-alarm);
      }

      &:disabled {
        color: var(--bc-text-2);
      }
    }

    .bc-cylinder-dialog--ios-unit {
      color: var(--bc-text-2);
    }

    .bc-cylinder-dialog--ios-destructive {
      justify-content: center;
      color: var(--bc-alarm);
    }

    .bc-cylinder-dialog--badge-icon {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* The camera of Début and Fin: 40 dp, pulled into the field's padding (mock-up detail-bouteille-android). */
    .bc-cylinder-dialog--gauge {
      flex: none;
      width: 40px;
      height: 40px;
      margin: -8px -8px -8px 0;
      padding: 0;
      border: none;
      border-radius: 20px;
      background: transparent;
      color: var(--bc-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-cylinder-dialog--heading {
      margin: 0;
      flex: 1;
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-cylinder-dialog--pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .bc-cylinder-dialog--unit {
      align-self: flex-end;
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text-2);
    }

    /* The name of the mix sits under O₂ and He, closer to them than the other fields. */
    .bc-cylinder-dialog--helper {
      margin: -8px 16px 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);

      &:empty {
        display: none;
      }
    }

    .bc-cylinder-dialog--remove {
      margin: 24px 16px 0;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
    }

    .bc-cylinder-dialog--remove-button {
      width: auto;
      height: 48px;
      padding: 0 20px;
      border: 1px solid var(--bc-outline);
      border-radius: 24px;
      background: transparent;
      color: var(--bc-text);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .bc-cylinder-dialog--footnote {
      margin: 16px 20px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }
  }
</style>
