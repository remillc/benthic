<script>
  // @ts-check
  // « Ouvrir ou importer un carnet » (task 2026-11-15-213; mock-up
  // docs/mockups/android-tablette-ouvrir-importer-paysage.dc.html), over the first launch of the release
  // edition: 600 dp wide, 28 dp corners, a scrim, a ✕ to close. Two groups of rows: open from the cloud (a
  // generic cloud or server icon, never a brand logo; they say the cloud comes later) and import a file (the
  // system file picker). Moved under <body>; Escape and the system Back close it, as Md3Dialog does.
  import Icon from './Icon.svelte';
  import { CLOUD_ROWS } from '../lib/release-welcome.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ oncancel: () => void, oncloud: () => void, onfile: (file: File) => void, busy?: boolean }} */
  let { oncancel, oncloud, onfile, busy = false } = $props();

  const id = `od-open-import-${Math.random().toString(36).slice(2, 9)}`;
  /** @type {HTMLInputElement|undefined} */
  let fileInput = $state();

  /** @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      oncancel();
    };
    node.addEventListener('od-cancel', cancel);
    queueMicrotask(() => /** @type {HTMLElement|null} */ (node.querySelector('[role="dialog"]'))?.focus({ preventScroll: true }));
    return {
      destroy() {
        node.removeEventListener('od-cancel', cancel);
        node.remove();
        previous?.focus?.();
      },
    };
  }

  /** @param {KeyboardEvent} e */
  function keydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }

  function chosen() {
    const file = fileInput?.files?.[0];
    if (!file || !fileInput) return;
    fileInput.value = '';
    onfile(file);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="od-open-import modal-in" use:portal onkeydown={keydown}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="od-open-import--scrim" onclick={oncancel}></div>
  <div class="od-open-import--surface" role="dialog" aria-modal="true" aria-labelledby={id} tabindex="-1">
    <div class="od-open-import--head">
      <h2 {id}>{t('welcomeRelease.openTitle')}</h2>
      <button type="button" class="od-open-import--close" aria-label={t('welcomeRelease.close')} onclick={oncancel}>
        <Icon name="close" size={24} weight={2} />
      </button>
    </div>

    <h3 class="od-open-import--label">{t('welcomeRelease.openCloudTitle')}</h3>
    <p class="od-open-import--help">{t('welcomeRelease.openCloudHelp')}</p>
    <div class="od-open-import--card">
      {#each CLOUD_ROWS as row (row.key)}
        <button type="button" class="od-open-import--row od-open-import--cloud-{row.key}" onclick={oncloud}>
          <span class="od-open-import--tile"><Icon name={row.icon} size={22} /></span>
          <span class="od-open-import--text"><span class="od-open-import--title">{t(row.text)}</span></span>
          <span class="od-open-import--chevron"><Icon name="chevron" size={20} weight={2} /></span>
        </button>
      {/each}
    </div>

    <h3 class="od-open-import--label od-open-import--label-second">{t('welcomeRelease.importTitle')}</h3>
    <p class="od-open-import--help">{t('welcomeRelease.importHelp')}</p>
    <div class="od-open-import--card">
      <button type="button" class="od-open-import--row od-open-import--file" disabled={busy} onclick={() => fileInput?.click()}>
        <span class="od-open-import--tile"><Icon name="file" size={22} /></span>
        <span class="od-open-import--text">
          <span class="od-open-import--title">{t('welcomeRelease.chooseFile')}</span>
          <span class="od-open-import--sub">{t('welcomeRelease.chooseFileHelp')}</span>
        </span>
        <span class="od-open-import--chevron"><Icon name="chevron" size={20} weight={2} /></span>
      </button>
    </div>
    <input type="file" class="od-open-import--input" tabindex="-1" aria-hidden="true" bind:this={fileInput} onchange={chosen} />
  </div>
</div>

<style>
  @layer od.components {
    .od-open-import {
      position: fixed;
      inset: 0;
      z-index: 13500;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
    }

    .od-open-import--scrim {
      position: absolute;
      inset: 0;
      background: var(--od-release-scrim);
      animation: od-open-import-fade 0.2s ease-out backwards;
    }

    .od-open-import--surface {
      position: relative;
      box-sizing: border-box;
      width: min(600px, calc(100% - 48px));
      max-height: calc(100% - 48px);
      overflow-y: auto;
      padding: 24px;
      border-radius: 28px;
      background: var(--od-background);
      box-shadow: 0 24px 64px var(--od-release-dialog-shadow);
      color: var(--od-text);
      outline: none;
      animation:
        od-open-import-grow 0.25s cubic-bezier(0.2, 0, 0, 1) backwards,
        od-open-import-fade 0.2s ease-out backwards;
    }

    .od-open-import--head {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;

      h2 {
        flex: 1;
        margin: 0;
        font-size: 24px;
        line-height: 32px;
        font-weight: 500;
      }
    }

    .od-open-import--close {
      flex: none;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      color: var(--od-text);
      cursor: pointer;
      transition: background-color 0.15s;

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
      }

      @media (hover: hover) {
        &:hover {
          background: var(--od-surface-container-highest);
        }
      }
    }

    .od-open-import--label {
      margin: 0 0 2px;
      font-size: 13px;
      line-height: 18px;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: var(--od-release-label);
    }

    .od-open-import--label-second {
      margin-top: 20px;
    }

    .od-open-import--help {
      margin: 0 0 10px;
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-open-import--card {
      overflow: hidden;
      border: 1px solid var(--od-surface-container-highest);
      border-radius: 20px;
      background: var(--od-surface);
    }

    .od-open-import--row {
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      border: none;
      border-bottom: 1px solid var(--od-release-divider);
      background: transparent;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      transition: background-color 0.15s;

      &:last-child {
        border-bottom: none;
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }

      &:focus-visible {
        outline: 2px solid var(--od-release-row-main);
        outline-offset: -2px;
      }

      @media (hover: hover) {
        &:hover:not(:disabled) {
          background: var(--od-surface-2);
        }
      }
    }

    .od-open-import--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
      color: var(--od-release-tile-icon);
    }

    .od-open-import--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .od-open-import--title {
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .od-open-import--sub {
      font-size: 14px;
      line-height: 19px;
      color: var(--od-text-2);
    }

    .od-open-import--chevron {
      flex: none;
      display: flex;
      color: var(--od-chip-outline);
    }

    .od-open-import--input {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
    }

    @keyframes od-open-import-grow {
      from {
        transform: scale(0.94);
      }
    }

    @keyframes od-open-import-fade {
      from {
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .od-open-import--scrim,
      .od-open-import--surface {
        animation: none;
      }

      .od-open-import--row,
      .od-open-import--close {
        transition: none;
      }
    }
  }
</style>
