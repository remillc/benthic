<script>
  // @ts-check
  // The tabs of « Modifier ensemble… » (task 2026-11-24-384): Informations, Équipement, Gaz and Notes, as in a single dive's
  // detail without « Carte ». Material 3 primary tabs (a 3 px indicator under the selected one); a segmented control on
  // the iPhone. Arrow keys, Home and End move between the tabs. The panels are drawn by the caller: each has the id
  // `${idBase}-panel-${tab}` and is labelled by the tab `${idBase}-tab-${tab}`.
  import { ios } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ tabs: readonly string[], tab: string, idBase: string, onchange: (tab: string) => void }} */
  let { tabs, tab, idBase, onchange } = $props();

  /** @param {KeyboardEvent} e @param {number} index */
  function key(e, index) {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onchange(tabs[next]);
    document.getElementById(`${idBase}-tab-${tabs[next]}`)?.focus();
  }
</script>

<div class="bc-multi-edit-tabs" class:bc-multi-edit-tabs--ios={ios} role="tablist" aria-label={t('multiDive.tabs')}>
  {#each tabs as name, i (name)}
    <button
      type="button"
      role="tab"
      id="{idBase}-tab-{name}"
      aria-selected={tab === name}
      aria-controls="{idBase}-panel-{name}"
      tabindex={tab === name ? 0 : -1}
      onclick={() => onchange(name)}
      onkeydown={(e) => key(e, i)}>{t(`desktop.tab.${name}`)}</button
    >
  {/each}
</div>

<style>
  @layer bc.components {
    .bc-multi-edit-tabs {
      display: flex;
      flex: none;
      border-bottom: 1px solid var(--bc-separator);

      & button {
        position: relative;
        flex: 1;
        height: 48px;
        padding: 0 12px;
        border: 0;
        background: none;
        color: var(--bc-text-2);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;

        &[aria-selected='true'] {
          color: var(--bc-action);
        }

        &[aria-selected='true']::after {
          content: '';
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 0;
          height: 3px;
          border-radius: 3px 3px 0 0;
          background: var(--bc-action);
        }

        &:focus-visible {
          outline: 2px solid var(--bc-action);
          outline-offset: -2px;
        }
      }
    }

    /* iPhone: a segmented control. */
    .bc-multi-edit-tabs--ios {
      margin: 8px 16px;
      padding: 2px;
      border: 0;
      border-radius: 9px;
      background: var(--bc-surface-container);

      & button {
        height: 32px;
        padding: 0 4px;
        border-radius: 7px;
        color: var(--bc-text);
        font-weight: 400;

        &[aria-selected='true'] {
          background: var(--bc-surface);
          color: var(--bc-text);
          font-weight: 600;
          box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
        }

        &[aria-selected='true']::after {
          content: none;
        }
      }
    }
  }
</style>
