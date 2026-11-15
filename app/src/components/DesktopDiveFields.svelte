<script>
  // @ts-check
  // The fields of the desktop detail pane's tabs Informations, Équipement, Gaz and Notes, edited in
  // place (tasks 2026-11-15-172, 184, 191). Each field is a <DesktopField>; a value kept is written
  // at once through the same core edit function as the phone's editor (saveDiveChanges →
  // OpenDivesCore.editDive), one undoable step, so Ctrl/⌘+Z undoes it. What the dive computer
  // recorded is plain text, editable only on a dive logged by hand (lib/desktop-edit.js).
  import { onMount } from 'svelte';
  import { OpenDivesCore } from 'opendives-core';
  import DesktopField from './DesktopField.svelte';
  import ButtonGroup from './ButtonGroup.svelte';
  import Icon from './Icon.svelte';
  import { logbook, saveDiveChanges } from '../lib/logbook.svelte.js';
  import { siteChange } from '../lib/sites.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { offerUndo } from '../lib/undo.js';
  import { cylinderChanges, fieldChanges, fieldValue, parseTyped, pressureMbarOf, siteChoice, weightChanges, weightText } from '../lib/desktop-edit.js';
  import { FEEDBACK_CHOICES, feedbackOf, withFeedback, withoutFeedbackTags } from '../lib/weight-feedback.js';
  import { WATER_TYPES, waterTypeName } from '../lib/tools.js';
  import { computerList } from '../lib/gas-summary.js';
  import { useKey } from '../lib/cylinder-use.js';
  import { formatNumber, formatPressure, formatTemperature } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /**
   * `tab`: 'info', 'equipment', 'gas' or 'notes'. `location` and `trip` are the read-only lines of
   * the Informations tab; `sac` and `gasChanges` those of the Gaz tab.
   * @type {{
   *   dive: import('opendives-core').DiveDetail,
   *   tab: 'info'|'equipment'|'gas'|'notes',
   *   prefs: import('opendives-core').Prefs,
   *   trip?: string,
   *   sac?: string,
   *   gasChanges?: string,
   * }}
   */
  let { dive, tab, prefs, trip = '', sac = '', gasChanges = '' } = $props();

  /** @type {import('opendives-core').SiteSummary[]} */
  let sites = $state([]);
  let known = $state({ buddy: /** @type {{ key: string, dives: number }[]} */ ([]), guide: /** @type {{ key: string, dives: number }[]} */ ([]), tag: /** @type {{ key: string, dives: number }[]} */ ([]) });
  let cylinderTypes = $state(/** @type {{ name: string, ml: number, workingPressureMbar: number }[]} */ ([]));

  /** @param {'buddy'|'guide'|'tag'} field */
  async function loadValues(field) {
    try {
      /** @type {{ key: string, dives: number }[]} */
      const values = await OpenDivesCore.statsQuery({ kind: 'values', field });
      known[field] = withoutFeedbackTags(values.filter((v) => v.key));
    } catch (e) {
      console.error('Logbook values', field, e);
    }
  }
  async function loadSites() {
    try {
      sites = await OpenDivesCore.siteQuery({ kind: 'list' });
    } catch (e) {
      console.error('Sites', e);
    }
  }
  onMount(() => {
    for (const field of /** @type {const} */ (['buddy', 'guide', 'tag'])) loadValues(field);
    loadSites();
    OpenDivesCore.toolQuery({ kind: 'cylinders' })
      .then((/** @type {import('opendives-core').GasCylinderTypes} */ list) => (cylinderTypes = list.types))
      .catch((/** @type {unknown} */ e) => console.error('Cylinder types', e));
  });

  /** @param {unknown} e */
  function failure(e) {
    const code = String(/** @type {any} */ (e)?.message ?? '');
    console.error('Edit in place', code);
    showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : code.startsWith('CYLINDER_IN_USE') ? t('edit.cylinderInUse') : t('desktop.changeFailed'));
  }

  /**
   * Writes changes to this dive (one undoable step) and reads the list again so that the table shows
   * them. Returns false when it failed (the field goes back to its value).
   * @param {Record<string, string|number|string[]>} changes
   */
  async function write(changes) {
    try {
      await saveDiveChanges(dive.id, changes);
      logbook.dives = await OpenDivesCore.listLoadedDives();
      return true;
    } catch (e) {
      failure(e);
      return false;
    }
  }

  /**
   * A field kept: what it changes, then written. Unchanged: nothing is written.
   * @param {string} key
   * @param {string|string[]|number} value
   */
  async function save(key, value) {
    const result = fieldChanges(dive, key, value, prefs);
    if (!result.ok) {
      showSnackbar(t(result.error === 'readonly' ? 'desktopDetail.readOnly' : 'desktopDetail.invalid'));
      return false;
    }
    if (!result.changes) return true;
    const ok = await write(result.changes);
    if (ok && (key === 'buddies' || key === 'guides' || key === 'tags')) loadValues(key === 'buddies' ? 'buddy' : key === 'guides' ? 'guide' : 'tag');
    return ok;
  }

  /** @param {string} name */
  async function saveSite(name) {
    const choice = siteChoice(name, dive.site, sites);
    if (choice.action === 'none') return true;
    let steps = 1;
    try {
      let uuid = 0;
      if (choice.action === 'existing') uuid = choice.uuid;
      else if (choice.action === 'create') {
        const created = await siteChange({ action: 'create', value: choice.name });
        steps++;
        uuid = created.site?.uuid ?? 0;
      }
      const ok = await write({ site: uuid });
      if (ok && steps > 1) offerUndo(t('edit.saved'), undefined, 6000, steps);
      loadSites();
      return ok;
    } catch (e) {
      failure(e);
      return false;
    }
  }

  const waterOptions = $derived(WATER_TYPES.map((w) => ({ value: w.id, label: waterTypeName(w.id) })));
  const waterValue = $derived(/** @type {string} */ (fieldValue(dive, 'waterType', prefs)));
  const computers = $derived(computerList(dive.diveComputers));
  const manual = $derived(!!dive.manual);

  const depthUnitText = $derived(prefs.length === 'ft' ? t('units.feet') : t('units.meters'));
  const temperatureUnitText = $derived(prefs.temperature === 'F' ? t('units.fahrenheit') : t('units.celsius'));

  /** Live check of a number typed in a field. @param {string} key */
  const checker = (key) => (/** @type {string} */ text) => fieldChanges(dive, key, text, prefs).ok;

  // --- Équipement: the weights, « Ce lest était ». -----------------------------------------------
  const weightRows = $derived(
    (dive.weights ?? []).map((w) => ({ description: w.description, text: weightText(w.grams, prefs), grams0: w.grams, text0: weightText(w.grams, prefs) })),
  );
  const weightUnit = $derived(prefs.weight === 'lbs' ? t('units.pounds') : t('units.kilograms'));
  /** @param {{ description: string, text: string, grams0: number, text0: string }[]} rows */
  async function saveWeights(rows) {
    const result = weightChanges(dive, rows, prefs);
    if (!result.ok) {
      showSnackbar(t('desktopDetail.invalid'));
      return false;
    }
    return result.changes ? write(result.changes) : true;
  }
  const weightPlace = (/** @type {string} */ description) => (description ? (tIfExists(`detail.weightPlaces.${description}`) ?? description) : t('detail.weights'));
  const feedback = $derived(feedbackOf(dive.tags));
  const feedbackOptions = $derived(FEEDBACK_CHOICES.map((value) => ({ value, label: t(`weightFeedback.${value === 'too-light' ? 'tooLight' : value === 'ok' ? 'ok' : 'tooHeavy'}`) })));
  /** @param {string} value */
  const saveFeedback = (value) => write({ tags: withFeedback(dive.tags, /** @type {import('../lib/weight-feedback.js').WeightFeedback|''} */ (value)) });

  // --- Gaz: the cylinders. ----------------------------------------------------------------------
  const cylinderRows = $derived(dive.cylinders.map((_, index) => ({ index, patch: /** @type {Record<string, string|number>} */ ({}) })));
  const USES = ['OC-gas', 'diluent', 'oxygen', 'not used'];
  const useOptions = $derived(USES.map((value) => ({ value, label: t(useKey(value, dive.divemode)) })));
  /** @param {{ index: number, patch: Record<string, string|number> }[]} rows */
  async function saveCylinders(rows) {
    const result = cylinderChanges(dive, rows);
    if (!result.ok) {
      showSnackbar(t(result.error === 'readonly' ? 'desktopDetail.readOnly' : 'desktopDetail.invalid'));
      return false;
    }
    return result.changes ? write(result.changes) : true;
  }
  /** One cylinder's field changed. @param {number} index @param {Record<string, string|number>} patch */
  const saveCylinder = (index, patch) => saveCylinders(cylinderRows.map((r) => (r.index === index ? { ...r, patch } : r)));
  const addCylinder = () => saveCylinders([...cylinderRows, { index: -1, patch: {} }]);
  /** @param {number} index */
  const removeCylinder = (index) => saveCylinders(cylinderRows.filter((r) => r.index !== index));
  /** @param {number} from @param {number} step */
  function moveCylinder(from, step) {
    const to = from + step;
    if (to < 0 || to >= cylinderRows.length) return;
    const rows = [...cylinderRows];
    [rows[from], rows[to]] = [rows[to], rows[from]];
    return saveCylinders(rows);
  }
  /** @param {import('opendives-core').Cylinder} c */
  const typeOptions = (c) => {
    const list = cylinderTypes.map((x) => ({ value: x.name, label: x.name }));
    if (c.description && !list.some((o) => o.value === c.description)) list.unshift({ value: c.description, label: c.description });
    return list;
  };
  /** @param {number} index @param {string} name */
  function chooseType(index, name) {
    const type = cylinderTypes.find((x) => x.name === name);
    return saveCylinder(index, type ? { description: name, sizeMl: type.ml, workingPressureMbar: type.workingPressureMbar } : { description: name });
  }
  /** The mix of a cylinder: always both parts, as the phone's editor sends them. @param {number} index @param {import('opendives-core').Cylinder} c @param {{ o2?: string, he?: string }} typed */
  function saveGas(index, c, typed) {
    const o2 = typed.o2 !== undefined ? parseTyped(typed.o2) * 10 : c.o2Permille || 210;
    const he = typed.he !== undefined ? parseTyped(typed.he) * 10 : c.hePermille;
    return saveCylinder(index, { o2Permille: Math.round(o2), hePermille: Math.round(he) });
  }
  /** A percentage as typed back. @param {number} permille */
  const percentText = (permille) => String(Number((permille / 10).toFixed(1))).replace('.', ',');
  /** @param {string} text @param {number} lo @param {number} hi */
  const percentOk = (text, lo, hi) => {
    const v = parseTyped(text);
    return v >= lo && v <= hi;
  };
  /** Pressure as typed back, in the diver's unit. @param {number} mbar */
  const pressureText = (mbar) => (mbar ? String(Number((prefs.pressure === 'psi' ? mbar / 68.9476 : mbar / 1000).toFixed(0))) : '');
  /** @param {number} index @param {'startMbar'|'endMbar'} field @param {string} text */
  function savePressure(index, field, text) {
    const mbar = text.trim() ? pressureMbarOf(text, prefs) : 0;
    if (Number.isNaN(mbar)) return false;
    return saveCylinder(index, { [field]: mbar });
  }
  const pressureUnitText = $derived(prefs.pressure === 'psi' ? t('units.psi') : t('units.bar'));

  /** Ctrl/⌘+E: the first editable field of the tab takes the focus (and starts its edit). */
  let root = $state(/** @type {HTMLElement|undefined} */ (undefined));
  $effect(() => {
    const focusFirst = () => /** @type {HTMLElement|null|undefined} */ (root?.querySelector('.od-desktop-field--rest'))?.focus();
    window.addEventListener('od-detail-focus-first', focusFirst);
    return () => window.removeEventListener('od-detail-focus-first', focusFirst);
  });
</script>

<div class="od-desktop-dive-fields" bind:this={root}>
  <p class="od-desktop-dive-fields--hint">{t('desktopDetail.fieldsHint')}</p>

  {#if tab === 'info'}
    <DesktopField name="site" kind="site" label={t('desktopDetail.label.site')} value={dive.site} invitation={t('desktopDetail.invitation.site')} known={sites.map((s) => ({ key: s.name, dives: s.dives }))} newLabel={t('desktopDetail.newSite')} onsave={(v) => saveSite(/** @type {string} */ (v))} />
    <DesktopField name="buddies" kind="list" label={t('desktopDetail.label.buddies')} value={dive.buddies} invitation={t('desktopDetail.invitation.buddies')} known={known.buddy} newLabel={t('desktopDetail.newBuddy')} onsave={(v) => save('buddies', v)} />
    <DesktopField name="guides" kind="list" label={t('desktopDetail.label.guides')} value={dive.guides} invitation={t('desktopDetail.invitation.guides')} known={known.guide} newLabel={t('desktopDetail.newGuide')} onsave={(v) => save('guides', v)} />
    <DesktopField name="tags" kind="list" label={t('desktopDetail.label.tags')} value={/** @type {string[]} */ (fieldValue(dive, 'tags', prefs))} invitation={t('desktopDetail.invitation.tags')} known={known.tag} newLabel={t('desktopDetail.newTag')} onsave={(v) => save('tags', v)} />
    <DesktopField name="waterType" kind="choice" label={t('desktopDetail.label.waterType')} value={waterValue} options={waterOptions} invitation={t('desktopDetail.invitation.waterType')} onsave={(v) => save('waterType', v)} />
    <DesktopField name="visibility" kind="stars" label={t('desktopDetail.label.visibility')} value={dive.visibility} invitation={t('desktopDetail.invitation.visibility')} onsave={(v) => save('visibility', v)} />
    <DesktopField name="rating" kind="stars" label={t('desktopDetail.label.rating')} value={dive.rating} invitation={t('desktopDetail.invitation.rating')} onsave={(v) => save('rating', v)} />
    <DesktopField name="suit" kind="text" label={t('desktopDetail.label.suit')} value={dive.suit ?? ''} invitation={t('desktopDetail.invitation.suit')} onsave={(v) => save('suit', v)} />
    <DesktopField name="surfacePressure" kind="text" label={t('desktopDetail.label.surfacePressure')} value={fieldValue(dive, 'surfacePressure', prefs)} unit="mbar" invitation={t('desktopDetail.invitation.surfacePressure')} valid={checker('surfacePressure')} onsave={(v) => save('surfacePressure', v)} />

    {#if manual}
      <!-- A dive logged by hand has no recorded values: they are edited like the others. -->
      <DesktopField name="maxDepth" kind="text" label={t('desktopDetail.label.maxDepth')} value={fieldValue(dive, 'maxDepth', prefs)} unit={depthUnitText} invitation={t('desktopDetail.invitation.maxDepth')} valid={checker('maxDepth')} onsave={(v) => save('maxDepth', v)} />
      <DesktopField name="duration" kind="text" label={t('desktopDetail.label.duration')} value={fieldValue(dive, 'duration', prefs)} unit={t('units.minutes')} invitation={t('desktopDetail.invitation.duration')} valid={checker('duration')} onsave={(v) => save('duration', v)} />
      <DesktopField name="waterTemp" kind="text" label={t('desktopDetail.label.waterTemp')} value={fieldValue(dive, 'waterTemp', prefs)} unit={temperatureUnitText} invitation={t('desktopDetail.invitation.waterTemp')} valid={checker('waterTemp')} onsave={(v) => save('waterTemp', v)} />
      <DesktopField name="airTemp" kind="text" label={t('desktopDetail.label.airTemp')} value={fieldValue(dive, 'airTemp', prefs)} unit={temperatureUnitText} invitation={t('desktopDetail.invitation.airTemp')} valid={checker('airTemp')} onsave={(v) => save('airTemp', v)} />
    {:else}
      <!-- What the dive computer recorded: plain text, no field. -->
      {#if dive.airTempMk}<DesktopField kind="text" readonly label={t('desktopDetail.label.airTemp')} value={formatTemperature(dive.airTempMk, prefs)} />{/if}
      {#if dive.waterTempMk}<DesktopField kind="text" readonly label={t('desktopDetail.label.waterTemp')} value={formatTemperature(dive.waterTempMk, prefs)} />{/if}
    {/if}
    {#if computers.length}<DesktopField name="computer" kind="text" readonly label={t('desktopDetail.label.computer')} value={computers.map((c) => c.name).join(', ')} />{/if}
    <DesktopField kind="text" readonly label={t('desktopDetail.label.mode')} value={tIfExists(`detail.modes.${dive.divemode}`) ?? dive.divemode} />
    {#if dive.cns > 0}<DesktopField kind="text" readonly label={t('desktopDetail.label.cns')} value={`${formatNumber(dive.cns, 0)} %`} />{/if}
    {#if dive.otu > 0}<DesktopField kind="text" readonly label={t('desktopDetail.label.otu')} value={formatNumber(dive.otu, 0)} />{/if}
    {#if trip}<DesktopField kind="text" readonly label={t('desktopDetail.label.trip')} value={trip} />{/if}
  {:else if tab === 'notes'}
    <DesktopField name="notes" kind="multiline" label={t('desktopDetail.label.notes')} value={dive.notes} invitation={t('desktopDetail.invitation.notes')} onsave={(v) => save('notes', v)} />
  {:else if tab === 'equipment'}
    <DesktopField name="suit" kind="text" label={t('desktopDetail.label.suit')} value={dive.suit ?? ''} invitation={t('desktopDetail.invitation.suit')} onsave={(v) => save('suit', v)} />
    {#each weightRows as row, i (i)}
      <div class="od-desktop-dive-fields--with-remove">
        <DesktopField
          name="weight"
          kind="text"
          label={weightPlace(row.description)}
          value={row.text}
          unit={weightUnit}
          invitation={t('desktopDetail.invitation.weight')}
          valid={(text) => !text.trim() || (parseTyped(text) >= 0 && parseTyped(text) <= (prefs.weight === 'lbs' ? 400 : 200))}
          onsave={(v) => saveWeights(weightRows.map((r, j) => (j === i ? { ...r, text: /** @type {string} */ (v) } : r)))}
        />
        <button type="button" class="od-desktop-dive-fields--icon" aria-label={t('desktopDetail.removeWeight')} title={t('desktopDetail.removeWeight')} onclick={() => saveWeights(weightRows.filter((_, j) => j !== i))}><Icon name="delete" size={20} /></button>
      </div>
    {/each}
    <div class="od-desktop-dive-fields--actions">
      <button type="button" class="od-desktop-dive-fields--add" onclick={() => saveWeights([...weightRows, { description: '', text: '', grams0: -1, text0: '' }])}><Icon name="plus" size={18} />{t('desktopDetail.addWeight')}</button>
    </div>
    {#if dive.weights?.some((w) => w.grams > 0)}
      <div class="od-desktop-field">
        <span class="od-desktop-dive-fields--label" id="od-df-feedback">{t('weightFeedback.title')}</span>
        <ButtonGroup options={feedbackOptions} value={feedback} onchange={(v) => saveFeedback(v)} ariaLabelledby="od-df-feedback" clearable marked />
      </div>
    {/if}
    {#if computers.length}
      <DesktopField kind="text" readonly label={t('desktopDetail.label.computer')} value={computers.map((c) => c.name).join(', ')} />
    {/if}
  {:else if tab === 'gas'}
    {#each dive.cylinders as c, i (i)}
      <section class="od-desktop-dive-fields--cylinder" aria-label={t('desktopDetail.cylinder', { n: i + 1 })}>
        <header class="od-desktop-dive-fields--cylinder-head">
          <h3>{t('desktopDetail.cylinder', { n: i + 1 })}</h3>
          <button type="button" class="od-desktop-dive-fields--icon" aria-label={t('desktopDetail.moveUp')} title={t('desktopDetail.moveUp')} disabled={i === 0} onclick={() => moveCylinder(i, -1)}><Icon name="arrowUp" size={20} /></button>
          <button type="button" class="od-desktop-dive-fields--icon" aria-label={t('desktopDetail.moveDown')} title={t('desktopDetail.moveDown')} disabled={i === dive.cylinders.length - 1} onclick={() => moveCylinder(i, 1)}><Icon name="arrowDown" size={20} /></button>
          <button type="button" class="od-desktop-dive-fields--icon" aria-label={t('desktopDetail.removeCylinder')} title={c.protected ? t('edit.cylinderInUse') : t('desktopDetail.removeCylinder')} disabled={c.protected} onclick={() => removeCylinder(i)}><Icon name="delete" size={20} /></button>
        </header>
        <DesktopField name="cylinder-type" kind="choice" label={t('desktopDetail.label.cylinderType')} value={c.description} options={typeOptions(c)} invitation={t('desktopDetail.invitation.cylinderType')} onsave={(v) => chooseType(i, /** @type {string} */ (v))} />
        <DesktopField name="cylinder-o2" kind="text" label={t('desktopDetail.label.oxygen')} value={percentText(c.o2Permille || 210)} unit="%" valid={(text) => percentOk(text, 1, 100)} onsave={(v) => saveGas(i, c, { o2: /** @type {string} */ (v) })} />
        <DesktopField name="cylinder-he" kind="text" label={t('desktopDetail.label.helium')} value={percentText(c.hePermille)} unit="%" valid={(text) => percentOk(text, 0, 99)} onsave={(v) => saveGas(i, c, { he: /** @type {string} */ (v) })} />
        <DesktopField name="cylinder-use" kind="choice" label={t('desktopDetail.label.use')} value={c.use} options={useOptions} onsave={(v) => saveCylinder(i, { use: /** @type {string} */ (v) || 'OC-gas' })} />
        {#if manual}
          <DesktopField name="cylinder-start" kind="text" label={t('desktopDetail.label.startPressure')} value={pressureText(c.startMbar)} unit={pressureUnitText} invitation={t('desktopDetail.invitation.pressure')} valid={(text) => !text.trim() || !Number.isNaN(pressureMbarOf(text, prefs))} onsave={(v) => savePressure(i, 'startMbar', /** @type {string} */ (v))} />
          <DesktopField name="cylinder-end" kind="text" label={t('desktopDetail.label.endPressure')} value={pressureText(c.endMbar)} unit={pressureUnitText} invitation={t('desktopDetail.invitation.pressure')} valid={(text) => !text.trim() || !Number.isNaN(pressureMbarOf(text, prefs))} onsave={(v) => savePressure(i, 'endMbar', /** @type {string} */ (v))} />
        {:else}
          {#if c.startMbar > 0}<DesktopField kind="text" readonly label={t('desktopDetail.label.startPressure')} value={formatPressure(c.startMbar, prefs)} />{/if}
          {#if c.endMbar > 0}<DesktopField kind="text" readonly label={t('desktopDetail.label.endPressure')} value={formatPressure(c.endMbar, prefs)} />{/if}
        {/if}
      </section>
    {/each}
    <div class="od-desktop-dive-fields--actions">
      <button type="button" class="od-desktop-dive-fields--add" onclick={addCylinder}><Icon name="plus" size={18} />{t('desktopDetail.addCylinder')}</button>
    </div>
    {#if sac}<DesktopField kind="text" readonly label={t('detail.sacFull')} value={sac} />{/if}
    {#if gasChanges}<DesktopField kind="text" readonly label={t('desktopDetail.label.gasChanges')} value={gasChanges} />{/if}
  {/if}
</div>

<style>
  @layer od.components {
    .od-desktop-dive-fields {
      margin: 0 24px 24px;
    }

    /* One line above the fields: the grey ones can be edited with a click. */
    .od-desktop-dive-fields--hint {
      margin: 16px 0 12px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-desktop-dive-fields--with-remove {
      position: relative;
    }

    .od-desktop-dive-fields--with-remove > .od-desktop-dive-fields--icon {
      position: absolute;
      inset-inline-end: -40px;
      top: 0;
    }

    .od-desktop-dive-fields--label {
      min-height: 40px;
      display: flex;
      align-items: center;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-desktop-dive-fields--cylinder {
      margin-bottom: 20px;
    }

    .od-desktop-dive-fields--cylinder-head {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-bottom: 6px;
    }

    .od-desktop-dive-fields--cylinder-head h3 {
      flex: 1;
      margin: 0;
      font-family: var(--od-title-font);
      font-size: 14px;
      font-weight: 600;
      color: var(--od-text);
    }

    .od-desktop-dive-fields--icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--od-text-2);
      cursor: pointer;
    }

    .od-desktop-dive-fields--icon:hover:not(:disabled) {
      background: color-mix(in srgb, var(--od-text) 8%, transparent);
      color: var(--od-text);
    }

    .od-desktop-dive-fields--icon:disabled {
      opacity: 0.38;
      cursor: default;
    }

    .od-desktop-dive-fields--actions {
      margin: 4px 0 16px;
    }

    .od-desktop-dive-fields--add {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 12px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--od-on-table-selected);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .od-desktop-dive-fields--add:hover {
      background: var(--od-table-selected);
    }
  }
</style>
