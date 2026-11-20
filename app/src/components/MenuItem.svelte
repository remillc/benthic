<script>
  // @ts-check
  // One item of an overflow menu (a Framework7 Popover with the "bc-menu"
  // class, styled in theme.css): an MD3 menu item on Android, icon before the
  // label; an iOS pull-down menu item, label then icon at the end. Tapping it
  // closes the menu.
  import { ListItem, theme } from 'framework7-svelte';
  import Icon from './Icon.svelte';

  /**
   * `link`: a route to open; otherwise `onclick` runs.
   * `destructive`: in the alarm colour on iOS (Human Interface Guidelines).
   * `disabled`: shown at 38 % and does nothing; `supporting` is the line under its label that
   * says why (« Seulement des plongées qui se suivent… »).
   * @type {{
   *   icon: import('svelte').ComponentProps<typeof Icon>['name'],
   *   text: string,
   *   link?: string,
   *   onclick?: () => void,
   *   destructive?: boolean,
   *   disabled?: boolean,
   *   supporting?: string,
   * }}
   */
  let { icon, text, link = '#', onclick = undefined, destructive = false, disabled = false, supporting = '' } = $props();
</script>

{#snippet leading()}<Icon name={icon} weight={2} />{/snippet}
{#snippet trailing()}<Icon name={icon} />{/snippet}

<!-- Only the slot of this platform: an empty one would still take room. -->
<ListItem
  link={disabled ? undefined : link}
  popoverClose={!disabled}
  title={text}
  text={supporting || undefined}
  class="bc-menu-item {destructive ? 'bc-menu-item--destructive' : ''} {disabled ? 'bc-menu-item--disabled' : ''}"
  onClick={disabled ? undefined : onclick}
  aria-disabled={disabled ? 'true' : undefined}
  {...theme.ios ? { after: trailing } : { media: leading }}
/>
