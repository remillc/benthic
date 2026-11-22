<script>
  // @ts-check
  // The panes of « Mon profil de plongeur » on a wide screen (tasks 2026-11-18-275 and 277): the profile, a list (the
  // equipment or the maintenance) and the chosen sheet, or a form as a centred dialog over them. Each profile page
  // puts its content in this frame when `profileWide()` is true and keeps its single column otherwise; changing the
  // window size only swaps the layout, the page and its state stay.
  //
  // `bar`: where the page's own top bar goes. `main`: over the right pane (its title and buttons; the Back arrow goes,
  // the navigation rail leads out); `none`: no bar (the panes draw their own titles); `dialog`: the dialog's header; `steps`: a dialog that draws its own header and footer (a new piece's two steps), no page bar.
  // `size`: the dialog's height, `s`, `m` or `l`.
  import ProfileNav from './ProfileNav.svelte';
  import ProfileGearList from './ProfileGearList.svelte';
  import ProfileMaintenanceList from './ProfileMaintenanceList.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   section: 'gear'|'maintenance'|'certs'|'info', list?: 'gear'|'maintenance'|null, selected?: string|null,
   *   bar?: 'main'|'none'|'dialog'|'steps', size?: 's'|'m'|'l', children?: import('svelte').Snippet
   * }}
   */
  let { section, list = null, selected = null, bar = 'main', size = 'm', children } = $props();
</script>

<div class="bc-pf bc-pf--bar-{bar} bc-pf--size-{size}" class:bc-pf--three={!!list}>
  <ProfileNav {section} />
  {#if list === 'gear'}<ProfileGearList {selected} />{:else if list === 'maintenance'}<ProfileMaintenanceList {selected} />{/if}
  {#if bar === 'steps'}
    <div class="bc-pf--main"></div>
    <div class="bc-pf--scrim"></div>
    <div class="bc-pf--box bc-pf--box-steps" role="dialog" aria-modal="true">{@render children?.()}</div>
  {:else if bar === 'dialog'}
    <div class="bc-pf--main"></div>
    <div class="bc-pf--scrim"></div>
    <div class="bc-pf--box" role="dialog" aria-modal="true">{@render children?.()}</div>
  {:else}
    <div class="bc-pf--main" class:bc-pf--padded={bar === 'main'}>
      {#if children}{@render children()}{:else}<p class="bc-pf--empty">{t('gear.profile.paneEmpty')}</p>{/if}
    </div>
  {/if}
</div>

<style>
  @layer od.components {
    .bc-pf {
      --bc-pf-nav: var(--bc-pf-nav-width, 300px);
      --bc-pf-list: 340px;
      --bc-pf-dw: min(640px, 92%);
      position: absolute;
      inset: var(--bc-safe-top) 0 var(--bc-safe-bottom);
      display: flex;
      background: var(--bc-surface);
    }
    @media (min-width: 1200px) {
      .bc-pf {
        --bc-pf-nav: var(--bc-pf-nav-width, 330px);
        --bc-pf-list: 440px;
      }
    }
    .bc-pf--size-s { --bc-pf-dh: 520px; }
    .bc-pf--size-m { --bc-pf-dh: 680px; }
    .bc-pf--size-l { --bc-pf-dh: 780px; }

    .bc-pf--main {
      position: relative;
      flex: 1;
      min-width: 0;
      height: 100%;
      overflow-y: auto;
      box-sizing: border-box;
      background: var(--bc-background);
    }
    .bc-pf--padded {
      padding-top: var(--f7-navbar-height, 56px);
    }
    .bc-pf--empty {
      margin: 0;
      height: 100%;
      display: grid;
      place-items: center;
      color: var(--bc-text-2);
      font-size: 16px;
    }

    /* A form as a dialog: the scrim over the panes, the box centred, the page's own bar as its header. */
    .bc-pf--scrim {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 0.4);
    }
    .bc-pf--box {
      position: absolute;
      left: calc(50% - var(--bc-pf-dw) / 2);
      top: calc(50% - min(var(--bc-pf-dh), 90%) / 2);
      width: var(--bc-pf-dw);
      height: min(var(--bc-pf-dh), 90%);
      box-sizing: border-box;
      padding-top: var(--f7-navbar-height, 56px);
      overflow-y: auto;
      border-radius: 28px;
      background: var(--bc-background);
      box-shadow: 0 8px 32px rgb(0 0 0 / 0.3);
    }

    /* A dialog with its own header and footer: sized by its content, centred, the body scrolls. */
    .bc-pf--box-steps {
      inset: 0;
      margin: auto;
      width: min(760px, 92%);
      height: fit-content;
      max-height: 90%;
      padding-top: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* The page's own bar (Framework7 puts it at the top of the page, over everything). */
    :global(.page-content:has(> .bc-pf)) {
      padding: 0 !important;
      overflow: hidden;
    }
    :global(.page:has(.bc-pf--bar-steps) > .navbar),
    :global(.page:has(.bc-pf--bar-none) > .navbar) {
      display: none;
    }
    :global(.page:has(.bc-pf--bar-main) > .navbar) {
      left: var(--bc-pf-nav-width, 300px);
      width: calc(100% - var(--bc-pf-nav-width, 300px));
    }
    :global(.page:has(.bc-pf--bar-main.bc-pf--three) > .navbar) {
      left: calc(var(--bc-pf-nav-width, 300px) + var(--bc-pf-list-width, 340px));
      width: calc(100% - var(--bc-pf-nav-width, 300px) - var(--bc-pf-list-width, 340px));
    }
    @media (min-width: 1200px) {
      :global(.page:has(.bc-pf--bar-main, .bc-pf--bar-dialog)) {
        --bc-pf-nav-width: 330px;
        --bc-pf-list-width: 440px;
      }
    }
    @media (orientation: landscape) {
      :global(html:not(.bc-desktop-app) .page:has(.bc-pf)) {
        --bc-pf-nav-width: 320px;
      }
    }
    @media (orientation: landscape) and (min-width: 1200px) {
      :global(html:not(.bc-desktop-app) .page:has(.bc-pf)) {
        --bc-pf-nav-width: 350px;
      }
    }
    :global(.page:has(.bc-pf--bar-main) > .navbar .left:not(:has(.bc-profile-info--cancel-edit))) {
      display: none;
    }
    :global(.page:has(.bc-pf--bar-main) > .navbar .title) {
      margin-inline-start: 16px;
    }
    :global(.page:has(.bc-pf--bar-dialog) > .navbar) {
      --f7-safe-area-top: 0px;
      left: calc(50% - min(640px, 92%) / 2);
      top: calc(50% + (var(--bc-safe-top) - var(--bc-safe-bottom)) / 2 - min(var(--bc-pf-dh, 680px), calc((100% - var(--bc-safe-top) - var(--bc-safe-bottom)) * 0.9)) / 2);
      width: min(640px, 92%);
      border-radius: 28px 28px 0 0;
      overflow: hidden;
      z-index: 600;
    }
    :global(.page:has(.bc-pf--size-s) > .navbar) { --bc-pf-dh: 520px; }
    :global(.page:has(.bc-pf--size-m) > .navbar) { --bc-pf-dh: 680px; }
    :global(.page:has(.bc-pf--size-l) > .navbar) { --bc-pf-dh: 780px; }
  }
</style>
