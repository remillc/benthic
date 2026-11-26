<script>
  // @ts-check
  // The full-screen dialog of a cylinder of the dive detail's Gaz tab on an Android phone (task 2026-11-26-401; mock-ups
  // detail-bouteille-android and detail-bouteilles-recycleur-android): × closes without saving, « Enregistrer » saves,
  // then one white card per cylinder with the type, O₂ and He side by side, the name of the mix and the two pressures.
  // A cylinder alone also has its role and « Retirer la bouteille »; a rebreather's two cylinders (diluent and oxygen,
  // the oxygen one with O₂ only) share one dialog and a footnote. The pressures of a dive read from a computer are
  // read-only. The dialog edits copies: nothing is written until « Enregistrer » (the page does it). Moved under <body>
  // like the other dialogs; Escape and the system Back close it (lib/back-button.js).
  import Icon from './Icon.svelte';
  import SelectField from './SelectField.svelte';
  import TextField from './TextField.svelte';
  import { t } from '../lib/i18n.js';
  import { draftErrors, hasErrors, mixHelper } from '../lib/cylinder-dialog.js';

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
   *   prefs: { pressure: string },
   *   manual: boolean,
   *   footnote?: string,
   *   onsave: () => void,
   *   onclose: () => void,
   *   onremove?: () => void,
   * }}
   */
  let { title, parts = $bindable(), typeOptions, roles, prefs, manual, footnote = '', onsave, onclose, onremove } = $props();

  const id = `bc-cylinder-dialog-${Math.random().toString(36).slice(2, 9)}`;
  const words = $derived({ air: t('edit.gasName.air'), oxygen: t('edit.gasName.oxygen'), nitrox: t('edit.gasName.nitrox'), trimix: t('edit.gasName.trimix') });
  const errors = $derived(parts.map((p) => draftErrors(p.draft, prefs, { manual, oxygenOnly: p.oxygenOnly })));
  const invalid = $derived(errors.some(hasErrors));
  const unit = $derived(prefs.pressure === 'psi' ? t('units.psi') : t('units.bar'));

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
  <div class="bc-cylinder-dialog--surface" role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1" data-bc-scroll>
    <div class="bc-cylinder-dialog--bar">
      <button type="button" class="bc-cylinder-dialog--close" aria-label={t('desktopDetail.cylinderDialog.closeWithoutSaving')} onclick={onclose}><Icon name="close" size={24} /></button>
      <span class="bc-cylinder-dialog--spacer"></span>
      <button type="button" class="bc-cylinder-dialog--save" disabled={invalid} onclick={onsave}>{t('desktopDetail.cylinderDialog.save')}</button>
    </div>
    <h1 {id} class="bc-cylinder-dialog--title">{title}</h1>
    <div class="bc-cylinder-dialog--cards">
      {#each parts as part, i (part.key)}
        {@const error = errors[i]}
        {@const helper = mixHelper(part.draft, words, part.oxygenOnly)}
        <section class="bc-cylinder-dialog--card" data-cylinder-part={part.key}>
          <div class="bc-cylinder-dialog--head">
            <span class="bc-cylinder-dialog--badge" aria-hidden="true">{#if part.badge}{part.badge}{:else}<Icon name="tune" size={22} />{/if}</span>
            <h2 class="bc-cylinder-dialog--heading">{part.heading}</h2>
          </div>
          {#if roles}
            <div data-field="cylinder-role"><SelectField label={t('desktopDetail.cylinderDialog.role')} bind:value={part.draft.use} options={roles} /></div>
          {/if}
          <div data-field="cylinder-type"><SelectField label={t('desktopDetail.label.cylinderType')} bind:value={part.draft.description} options={typeOptions(part.draft)} /></div>
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
          {#if !part.oxygenOnly || helper}
            <p class="bc-cylinder-dialog--helper" data-field="cylinder-mix-name">{helper}</p>
          {/if}
          <div class="bc-cylinder-dialog--pair">
            <div data-field="cylinder-start">
              <TextField label={t('desktopDetail.cylinderDialog.start')} bind:value={part.draft.start} inputmode="decimal" invalid={error.start} disabled={!manual}>
                {#snippet trailing()}<span class="bc-cylinder-dialog--unit">{unit}</span>{/snippet}
              </TextField>
            </div>
            <div data-field="cylinder-end">
              <TextField label={t('desktopDetail.cylinderDialog.end')} bind:value={part.draft.end} inputmode="decimal" invalid={error.end} disabled={!manual}>
                {#snippet trailing()}<span class="bc-cylinder-dialog--unit">{unit}</span>{/snippet}
              </TextField>
            </div>
          </div>
        </section>
      {/each}
    </div>
    {#if onremove}
      <div class="bc-cylinder-dialog--remove">
        <button type="button" class="bc-cylinder-dialog--remove-button" onclick={onremove}><Icon name="delete" size={20} />{t('desktopDetail.removeCylinder')}</button>
      </div>
    {/if}
    {#if footnote}<p class="bc-cylinder-dialog--footnote">{footnote}</p>{/if}
  </div>
</div>

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

    .bc-cylinder-dialog--close {
      width: 48px;
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
      justify-content: center;
    }

    .bc-cylinder-dialog--remove-button {
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
