<script>
  // @ts-check
  // The values of the logbook a piece can be paired with (task 2026-11-26-405, docs/mockups/profil-piece-associer-*.dc.html):
  // one row each, with a radio (one computer) or a checkbox (several suit texts). A value already tied to a piece is greyed,
  // with « Déjà dans votre équipement », and cannot be chosen.
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   items: { key: string, title: string, detail: string, linked?: boolean, tag?: string }[],
   *   multiple?: boolean,
   *   selected: string[],
   *   label: string,
   *   onchange: (keys: string[]) => void,
   * }}
   */
  let { items, multiple = false, selected, label, onchange } = $props();

  /** @param {string} key */
  function toggle(key) {
    if (!multiple) return onchange([key]);
    onchange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }
</script>

<ul class="bc-logbook-pair-list" role={multiple ? 'group' : 'radiogroup'} aria-label={label}>
  {#each items as item (item.key)}
    {@const on = selected.includes(item.key)}
    <li class="bc-logbook-pair-list--item" class:bc-logbook-pair-list--on={on} class:bc-logbook-pair-list--linked={item.linked}>
      <label class="bc-logbook-pair-list--row">
        <input class="bc-logbook-pair-list--input" type={multiple ? 'checkbox' : 'radio'} name="bc-logbook-pair" checked={on} disabled={item.linked} onchange={() => toggle(item.key)} />
        <span class="bc-logbook-pair-list--texts">
          <span class="bc-logbook-pair-list--title">{item.title}</span>
          <span class="bc-logbook-pair-list--detail">{item.detail}</span>
        </span>
        {#if item.tag}<span class="bc-logbook-pair-list--tag">{item.tag}</span>{:else if item.linked}<span class="bc-logbook-pair-list--tag">{t('gear.pair.linked')}</span>{/if}
      </label>
    </li>
  {/each}
</ul>

<style>
  @layer bc.components {
    .bc-logbook-pair-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-logbook-pair-list--item {
      border: var(--bc-outline-width) solid var(--bc-outline);
      border-radius: 12px;
    }

    .bc-logbook-pair-list--on {
      border-color: transparent;
      background: var(--bc-selected-container);
    }

    .bc-logbook-pair-list--row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 8px 16px;
      cursor: pointer;
    }

    .bc-logbook-pair-list--linked .bc-logbook-pair-list--row {
      cursor: default;
      opacity: 0.55;
    }

    .bc-logbook-pair-list--input {
      flex: none;
      width: 20px;
      height: 20px;
      margin: 0;
      accent-color: var(--bc-action);
    }

    .bc-logbook-pair-list--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-logbook-pair-list--title {
      font-size: 16px;
      line-height: 24px;
      color: var(--bc-text);
    }

    .bc-logbook-pair-list--detail {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-logbook-pair-list--tag {
      flex: none;
      font-size: 12px;
      line-height: 16px;
      color: var(--bc-text-2);
    }
  }
</style>
