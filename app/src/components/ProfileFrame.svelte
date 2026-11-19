<script>
  // @ts-check
  // The panes of « Mon profil de plongeur » on a wide screen (tasks 2026-11-18-275 and 277): the profile, a list (the
  // equipment or the maintenance) and the chosen sheet, or a form as a centred dialog over them. Each profile page
  // puts its content in this frame when `profileWide()` is true and keeps its single column otherwise; changing the
  // window size only swaps the layout, the page and its state stay.
  //
  // `bar`: where the page's own top bar goes. `main`: over the right pane (its title and buttons; the Back arrow goes,
  // the profile pane leads out); `none`: no bar (the panes draw their own titles); `dialog`: the dialog's header.
  // `size`: the dialog's height, `s`, `m` or `l`.
  import ProfileNav from './ProfileNav.svelte';
  import ProfileGearList from './ProfileGearList.svelte';
  import ProfileMaintenanceList from './ProfileMaintenanceList.svelte';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   section: 'gear'|'maintenance'|'certs'|'info', list?: 'gear'|'maintenance'|null, selected?: string|null,
   *   bar?: 'main'|'none'|'dialog', size?: 's'|'m'|'l', children?: import('svelte').Snippet
   * }}
   */
  let { section, list = null, selected = null, bar = 'main', size = 'm', children } = $props();
</script>

<div class="od-pf od-pf--bar-{bar} od-pf--size-{size}" class:od-pf--three={!!list}>
  <ProfileNav {section} />
  {#if list === 'gear'}<ProfileGearList {selected} />{:else if list === 'maintenance'}<ProfileMaintenanceList {selected} />{/if}
  {#if bar === 'dialog'}
    <div class="od-pf--main"></div>
    <div class="od-pf--scrim"></div>
    <div class="od-pf--box" role="dialog" aria-modal="true">{@render children?.()}</div>
  {:else}
    <div class="od-pf--main" class:od-pf--padded={bar === 'main'}>
      {#if children}{@render children()}{:else}<p class="od-pf--empty">{t('gear.profile.paneEmpty')}</p>{/if}
    </div>
  {/if}
</div>

<style>
  @layer od.components {
    .od-pf {
      --od-pf-nav: 300px;
      --od-pf-list: 340px;
      --od-pf-dw: min(640px, 92%);
      position: absolute;
      inset: 0;
      display: flex;
      background: var(--od-surface);
    }
    @media (min-width: 1200px) {
      .od-pf {
        --od-pf-nav: 330px;
        --od-pf-list: 440px;
      }
    }
    .od-pf--size-s { --od-pf-dh: 520px; }
    .od-pf--size-m { --od-pf-dh: 680px; }
    .od-pf--size-l { --od-pf-dh: 780px; }

    .od-pf--main {
      position: relative;
      flex: 1;
      min-width: 0;
      height: 100%;
      overflow-y: auto;
      box-sizing: border-box;
      background: var(--od-background);
    }
    .od-pf--padded {
      padding-top: var(--f7-navbar-height, 56px);
    }
    .od-pf--empty {
      margin: 0;
      height: 100%;
      display: grid;
      place-items: center;
      color: var(--od-text-2);
      font-size: 16px;
    }

    /* A form as a dialog: the scrim over the panes, the box centred, the page's own bar as its header. */
    .od-pf--scrim {
      position: absolute;
      inset: 0;
      background: rgb(0 0 0 / 0.4);
    }
    .od-pf--box {
      position: absolute;
      left: calc(50% - var(--od-pf-dw) / 2);
      top: calc(50% - min(var(--od-pf-dh), 90%) / 2);
      width: var(--od-pf-dw);
      height: min(var(--od-pf-dh), 90%);
      box-sizing: border-box;
      padding-top: var(--f7-navbar-height, 56px);
      overflow-y: auto;
      border-radius: 28px;
      background: var(--od-background);
      box-shadow: 0 8px 32px rgb(0 0 0 / 0.3);
    }

    /* The page's own bar (Framework7 puts it at the top of the page, over everything). */
    :global(.page-content:has(> .od-pf)) {
      padding: 0 !important;
      overflow: hidden;
    }
    :global(.page:has(.od-pf--bar-none) > .navbar) {
      display: none;
    }
    :global(.page:has(.od-pf--bar-main) > .navbar) {
      left: var(--od-pf-nav-width, 300px);
      width: calc(100% - var(--od-pf-nav-width, 300px));
    }
    :global(.page:has(.od-pf--bar-main.od-pf--three) > .navbar) {
      left: calc(var(--od-pf-nav-width, 300px) + var(--od-pf-list-width, 340px));
      width: calc(100% - var(--od-pf-nav-width, 300px) - var(--od-pf-list-width, 340px));
    }
    @media (min-width: 1200px) {
      :global(.page:has(.od-pf--bar-main, .od-pf--bar-dialog)) {
        --od-pf-nav-width: 330px;
        --od-pf-list-width: 440px;
      }
    }
    :global(.page:has(.od-pf--bar-main) > .navbar .left) {
      display: none;
    }
    :global(.page:has(.od-pf--bar-main) > .navbar .title) {
      margin-inline-start: 16px;
    }
    :global(.page:has(.od-pf--bar-dialog) > .navbar) {
      left: calc(50% - min(640px, 92%) / 2);
      top: calc(50% - min(var(--od-pf-dh, 680px), 90%) / 2);
      width: min(640px, 92%);
      border-radius: 28px 28px 0 0;
      overflow: hidden;
      z-index: 600;
    }
    :global(.page:has(.od-pf--size-s) > .navbar) { --od-pf-dh: 520px; }
    :global(.page:has(.od-pf--size-m) > .navbar) { --od-pf-dh: 680px; }
    :global(.page:has(.od-pf--size-l) > .navbar) { --od-pf-dh: 780px; }
  }
</style>
