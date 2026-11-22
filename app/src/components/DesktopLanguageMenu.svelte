<script>
  // @ts-check
  // Desktop first-launch screen (task 2026-11-16-246; docs/mockups/bureau-premier-lancement-alpha-accueil.dc.html):
  // a divider and a text button (globe, the current language, a chevron) beside « Une question ? À propos et
  // contact ». It opens the Settings choice menu (RowMenu) above the button, 260 dp wide. A choice is Settings ›
  // « Langue de l’app »: the same setting and the same setter.
  import RowMenu from './RowMenu.svelte';
  import { settings, setAppSetting } from '../lib/settings.svelte.js';
  import { deviceLanguage, t } from '../lib/i18n.js';
  import { languageOptions, currentLanguageName } from '../lib/language-menu.js';

  /** @type {HTMLButtonElement|undefined} */
  let button = $state();
  let open = $state(false);
  const name = $derived(currentLanguageName(settings.language, deviceLanguage));
  const options = $derived(languageOptions(settings.language, deviceLanguage, t('desktopLanguage.system')));
</script>

<span class="bc-desktop-language--divider" aria-hidden="true"></span>
<button
  type="button"
  class="bc-desktop-language"
  class:bc-desktop-language--open={open}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={t('desktopLanguage.button', { language: name })}
  bind:this={button}
  onclick={() => (open = true)}
>
  <svg class="bc-desktop-language--globe" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"></path>
  </svg>
  {name}
  <svg class="bc-desktop-language--chevron" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"></path></svg>
</button>

{#if open && button}
  <RowMenu
    anchor={button}
    label={t('settings.language.label')}
    {options}
    value={settings.language}
    width={260}
    above
    onclose={() => (open = false)}
    onselect={(v) => setAppSetting('language', /** @type {'system'|'fr'|'fr-CA'|'en'} */ (v))}
  />
{/if}

<style>
  @layer bc.components {
    .bc-desktop-language--divider {
      flex: none;
      width: 1px;
      height: 20px;
      background: var(--bc-language-divider);
    }

    .bc-desktop-language {
      flex: none;
      width: auto; /* a global rule gives every button 100 % */
      height: 32px;
      padding: 0 8px 0 10px;
      border: none;
      border-radius: 16px;
      background: transparent;
      display: flex;
      align-items: center;
      gap: 6px;
      font: inherit;
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
      white-space: nowrap;
      cursor: pointer;

      svg {
        flex: none;
        display: block;
        max-width: none;
      }

      .bc-desktop-language--globe {
        width: 18px;
        height: 18px;
      }

      .bc-desktop-language--chevron {
        width: 16px;
        height: 16px;
      }

      svg :is(circle, path) {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      &:focus-visible {
        outline: 2px solid var(--bc-text-2);
        outline-offset: 2px;
      }

      @media (hover: hover) {
        &:hover {
          background: color-mix(in srgb, var(--bc-text-2) 10%, transparent);
        }
      }

      /* While the menu is open: the selected tint. */
      &.bc-desktop-language--open,
      &:global(.bc-row-menu--anchored) {
        background: var(--bc-surface-container-highest) !important;
        border-radius: 16px !important;
      }
    }
  }
</style>
