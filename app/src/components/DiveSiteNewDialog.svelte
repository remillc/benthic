<script>
  // @ts-check
  // « Nouveau site » opened from a dive on the desktop (task 2026-11-27-412, mock-up bureau-site-nouveau-plongee): the
  // site form (DesktopSiteNew) in a large dialog over the detail, with the name typed in the chooser and the dive's
  // position. « Ajouter et associer » creates the site; `ondone` gets it so that the caller links the dive. Escape, the
  // scrim and the system Back cancel.
  import DesktopSiteNew from './DesktopSiteNew.svelte';

  /**
   * @type {{
   *   sites: import('benthic-core').SiteSummary[],
   *   name: string,
   *   at: { latUdeg: number, lonUdeg: number }|null,
   *   number: number|string,
   *   ondone: (site: { uuid: number }) => void,
   *   oncancel: () => void,
   * }}
   */
  let { sites, name, at, number, ondone, oncancel } = $props();

  /** Under <body>, above the pages. @param {HTMLElement} node */
  function portal(node) {
    const previous = /** @type {HTMLElement|null} */ (document.activeElement);
    document.body.appendChild(node);
    /** @param {Event} e */
    const cancel = (e) => {
      e.stopPropagation();
      oncancel();
    };
    node.addEventListener('bc-cancel', cancel);
    return {
      destroy() {
        node.removeEventListener('bc-cancel', cancel);
        node.remove();
        previous?.focus?.();
      },
    };
  }
</script>

<div class="bc-dive-site-new modal-in" use:portal>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="bc-dive-site-new--scrim" onclick={oncancel}></div>
  <div class="bc-dive-site-new--surface" role="dialog" aria-modal="true">
    <DesktopSiteNew {sites} {at} {name} dive={{ number }} oncreated={ondone} onuse={(site) => ondone({ uuid: site.uuid })} {oncancel} />
  </div>
</div>

<style>
  @layer bc.components {
    .bc-dive-site-new {
      position: fixed;
      inset: 0;
      z-index: 13400;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .bc-dive-site-new--scrim {
      position: absolute;
      inset: 0;
      background: var(--bc-scrim);
    }
    .bc-dive-site-new--surface {
      position: relative;
      box-sizing: border-box;
      width: min(1040px, calc(100% - 48px));
      height: min(760px, calc(100% - 48px));
      padding: 24px 12px 0 24px;
      border-radius: 28px;
      background: var(--bc-dialog);
      color: var(--bc-text);
      box-shadow: 0 8px 28px rgb(0 0 0 / 0.25);
      overflow: hidden;
    }
  }
</style>
