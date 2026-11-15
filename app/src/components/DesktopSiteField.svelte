<script>
  // @ts-check
  // A site value edited in place (tasks 2026-11-15-172 and 177): at rest a #ECEAE4 field, 8 dp
  // corners, 40 dp high (an empty one shows its invitation); on hover a 1 dp outline and a
  // pencil; edited, white with a 2 dp blue border and « Entrée pour garder · Échap pour annuler »
  // under it. Entrée or leaving the field keeps the value (the parent saves it); Échap restores
  // it. Tab goes to the next field. With `complete`, the most likely completion shows in grey
  // inside the field, with a list under it; Tab or Entrée accepts it, Échap cancels.
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { inlineCompletion } from '../lib/desktop-sites.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   id: string,
   *   value: string,
   *   placeholder?: string,
   *   multiline?: boolean,
   *   note?: string,
   *   hint?: string,
   *   updating?: boolean,
   *   readonly?: boolean,
   *   form?: boolean,
   *   complete?: (text: string) => { value: string, count: number }[],
   *   countText?: (n: number) => string,
   *   error?: (text: string) => string,
   *   onkeep: (value: string) => void,
   *   oninput?: (text: string) => void,
   *   oncancel?: () => void,
   *   field?: HTMLInputElement|HTMLTextAreaElement|undefined,
   * }}
   * form: a field of a creation form (white at rest, nothing to keep: the form saves).
   * hint: more under the field while it is edited (« ou déplacez la carte »).
   * updating: the value is being refilled from the position: #D4E2F2 with a refresh icon.
   * complete: the proposals for the typed text; countText says what the count of a logbook value means.
   * error: a message for a value that cannot be kept (the field stays open).
   * oninput: the text as it is typed (the parent may show it elsewhere, as the crosshair does).
   */
  let { id, value, placeholder = '', multiline = false, note = '', hint = '', updating = false, readonly = false, form = false, complete, countText, error, onkeep, oninput, oncancel, field = $bindable() } = $props();

  let editing = $state(false);
  let draft = $state('');
  let active = $state(0);
  /** Set when Échap or a click away must not keep the draft. */
  let cancelled = false;

  const proposals = $derived(editing && complete ? complete(draft) : []);
  const ghost = $derived(editing && complete ? inlineCompletion(draft, proposals) : '');
  const problem = $derived(editing && error ? error(draft) : '');

  /** The value shown: what is typed while editing. */
  const shown = $derived(editing ? draft : value);

  function begin() {
    if (readonly || editing) return;
    editing = true;
    cancelled = false;
    draft = value;
    active = 0;
  }

  /** @param {string} text */
  function accept(text) {
    draft = text;
    oninput?.(text);
  }

  /** Keeps the draft when it is valid and different, and closes. */
  function keep() {
    if (!editing) return;
    if (cancelled) {
      editing = false;
      return;
    }
    if (problem) return cancel();
    editing = false;
    if (draft !== value) onkeep(draft);
  }

  function cancel() {
    cancelled = true;
    editing = false;
    draft = value;
    oncancel?.();
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      // The first Échap closes the list or the field; the page's own Échap (back to the map) does not see it.
      e.stopPropagation();
      e.preventDefault();
      cancel();
      field?.blur();
    } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (proposals.length && ghost) accept(proposals[Math.min(active, proposals.length - 1)].value);
      else if (proposals.length && active > 0) accept(proposals[active].value);
      keep();
      field?.blur();
    } else if (e.key === 'Tab' && ghost && !e.shiftKey) {
      accept(proposals[Math.min(active, proposals.length - 1)].value);
    } else if (e.key === 'ArrowDown' && proposals.length) {
      e.preventDefault();
      active = (active + 1) % proposals.length;
    } else if (e.key === 'ArrowUp' && proposals.length) {
      e.preventDefault();
      active = (active - 1 + proposals.length) % proposals.length;
    }
  }

  /** @param {Event} e */
  function input(e) {
    draft = /** @type {HTMLInputElement} */ (e.currentTarget).value;
    active = 0;
    oninput?.(draft);
  }

  // A value that changes outside (undo, a new position) shows at once when not being edited.
  $effect(() => {
    value;
    if (!editing) draft = value;
  });

  /** Shows a value proposed from outside (the crosshair moved) as being edited: kept on Entrée or on leaving. @param {string} text */
  export function propose(text) {
    if (readonly) return;
    editing = true;
    cancelled = false;
    draft = text;
    field?.focus();
  }

  /** Puts the field into editing from outside (Ctrl/⌘+E, « Nouveau site »). */
  export async function edit() {
    await tick();
    field?.focus();
    field?.select?.();
  }
</script>

<div class="od-site-field" class:od-site-field--editing={editing} class:od-site-field--updating={updating} class:od-site-field--readonly={readonly} class:od-site-field--form={form} class:od-site-field--invalid={!!problem}>
  <div class="od-site-field--control">
    {#if ghost}
      <span class="od-site-field--ghost" aria-hidden="true"><span class="od-site-field--typed">{draft}</span>{ghost}</span>
    {/if}
    {#if multiline}
      <textarea {id} rows="1" class="od-site-field--input" {placeholder} {readonly} value={shown} bind:this={field} onfocus={begin} oninput={input} onkeydown={keydown} onblur={keep}></textarea>
    {:else}
      <input {id} type="text" class="od-site-field--input" {placeholder} {readonly} value={shown} autocomplete="off" spellcheck="false" bind:this={field} onfocus={begin} oninput={input} onkeydown={keydown} onblur={keep} />
    {/if}
    {#if updating}
      <span class="od-site-field--icon" aria-hidden="true"><Icon name="refresh" size={20} /></span>
    {:else if !editing && !readonly && !form}
      <span class="od-site-field--pencil" aria-hidden="true"><Icon name="edit" size={18} /></span>
    {/if}
    {#if proposals.length}
      <ul class="od-site-field--list" role="listbox">
        {#each proposals as p, i (p.value)}
          <!-- A press, not a click: the field would lose the focus first and keep what is typed. -->
          <li role="option" aria-selected={i === active} class:od-site-field--active={i === active} onmousedown={(e) => (e.preventDefault(), accept(p.value), keep(), field?.blur())}>
            <span class="od-site-field--option">{p.value}</span>
            {#if p.count && countText}<span class="od-site-field--count">{countText(p.count)}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  {#if editing && (!form || problem || hint)}
    <p class="od-site-field--note" class:od-site-field--error={!!problem}>{problem || [form ? '' : t('desktopSites.keepHint'), hint].filter(Boolean).join(' · ')}</p>
  {:else if note}
    <p class="od-site-field--note">{note}</p>
  {/if}
</div>

<style>
  @layer od.components {
    .od-site-field {
      min-width: 0;
    }
    .od-site-field--control {
      position: relative;
    }
    .od-site-field--input {
      display: block;
      box-sizing: border-box;
      width: 100%;
      min-height: 40px;
      padding: 9px 40px 9px 12px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: var(--od-surface-container-high);
      font: inherit;
      font-size: 15px;
      line-height: 20px;
      color: var(--od-text);
      outline: none;
      resize: none;
      overflow: hidden;
      field-sizing: content;
      transition: background 120ms linear;
    }
    /* A form field: white with a 1 dp outline at rest. */
    .od-site-field--form .od-site-field--input {
      background: var(--od-surface);
      border-color: var(--od-outline);
    }
    .od-site-field--input::placeholder {
      color: var(--od-text-2);
      opacity: 1;
    }
    .od-site-field:not(.od-site-field--readonly) .od-site-field--input:hover {
      border-color: var(--od-outline);
    }
    /* Editing: white, a 2 dp blue border (the border grows inward, the field does not move). */
    .od-site-field--editing .od-site-field--input,
    .od-site-field--editing .od-site-field--input:hover {
      padding: 8px 40px 8px 11px;
      border: 2px solid var(--od-secondary);
      background: var(--od-surface);
    }
    .od-site-field--invalid .od-site-field--input,
    .od-site-field--invalid .od-site-field--input:hover {
      border-color: var(--od-error);
    }
    .od-site-field--updating .od-site-field--input {
      background: var(--od-table-selected);
      color: var(--od-on-table-selected);
    }
    .od-site-field--icon,
    .od-site-field--pencil {
      position: absolute;
      right: 10px;
      top: 10px;
      display: flex;
      color: var(--od-on-table-selected);
      pointer-events: none;
    }
    .od-site-field--pencil {
      display: none;
      color: var(--od-text-2);
    }
    .od-site-field:hover .od-site-field--pencil {
      display: flex;
    }
    /* The grey completion, behind the typed text (which it repeats, invisible). */
    .od-site-field--ghost {
      position: absolute;
      inset: 0;
      z-index: 1;
      padding: 8px 40px 8px 11px;
      border: 2px solid transparent;
      font-size: 15px;
      line-height: 20px;
      white-space: pre;
      color: var(--od-text-2);
      pointer-events: none;
      overflow: hidden;
    }
    .od-site-field--typed {
      color: transparent;
    }
    .od-site-field--list {
      position: absolute;
      z-index: 20;
      left: 0;
      right: 0;
      top: 44px;
      margin: 0;
      padding: 4px 0;
      list-style: none;
      border-radius: 12px;
      background: var(--od-surface);
      box-shadow:
        0 2px 6px 2px rgb(0 0 0 / 0.15),
        0 1px 2px rgb(0 0 0 / 0.3);
    }
    .od-site-field--list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 40px;
      padding: 4px 12px;
      font-size: 15px;
      cursor: pointer;
    }
    .od-site-field--list li:hover,
    .od-site-field--active {
      background: var(--od-surface-container-high);
    }
    .od-site-field--count {
      flex: none;
      font-size: 13px;
      color: var(--od-text-2);
    }
    .od-site-field--note {
      margin: 4px 0 0;
      font-size: 12px;
      line-height: 16px;
      color: var(--od-text-2);
    }
    .od-site-field--error {
      color: var(--od-alarm-on-field);
    }
  }
</style>
