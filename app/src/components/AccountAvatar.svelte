<script>
  // @ts-check
  // Android phone: the account avatar at the right of a section's top bar, before the page's ⋮
  // (task 2026-11-14-120). A 32 dp circle with the account's initial (the generic account icon
  // without an account) in a 48 dp target; it opens the account sheet. A small badge says that
  // something waits: changes not sent or a map update (tertiary), a sync error (alarm).
  import Icon from './Icon.svelte';
  import { logbook } from '../lib/logbook.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { bottomNav, layout, ios } from '../lib/layout.svelte.js';

  /** rail: at the bottom of the Android tablet rail (task 2026-11-14-126), a 40 dp circle. */
  let { rail = false } = $props();
  const shown = $derived(rail ? layout.rail && !ios : bottomNav());
  import { updatesCount } from '../lib/offline-maps.svelte.js';
  import { t } from '../lib/i18n.js';

  const initial = $derived(logbook.email ? logbook.email.trim().charAt(0).toLocaleUpperCase() : '');
  /** '' when nothing waits; else the badge's role. */
  const badge = $derived(
    logbook.syncFailure || (logbook.conflict && logbook.conflictLater) ? 'alarm' : logbook.pending > 0 || updatesCount() > 0 ? 'waiting' : '',
  );
  /** What waits, in words, after the account (task 2026-11-14-126): « 3 modifications non envoyées, 1 mise à jour de carte ». */
  const waiting = $derived(
    [logbook.pending > 0 ? t('nav.pendingChanges', { n: logbook.pending }) : '', updatesCount() > 0 ? t('nav.mapUpdates', { n: updatesCount() }) : '']
      .filter(Boolean)
      .join(', '),
  );
  const label = $derived(
    t('nav.accountLabel', { name: logbook.email || t('menu.noAccount') }) + (waiting ? `. ${waiting}` : ''),
  );
</script>

{#if shown}
  <button type="button" class="od-account-avatar" class:od-account-avatar--rail={rail} class:od-account-avatar--ios={ios} aria-label={label} aria-haspopup="dialog" onclick={() => (navigation.accountOpen = true)}>
    <span class="od-account-avatar--circle">
      {#if initial}{initial}{:else}<Icon name="account" size={20} weight={2} />{/if}
    </span>
    {#if badge}<span class="od-account-avatar--badge od-account-avatar--{badge}" aria-hidden="true"></span>{/if}
  </button>
{/if}

<style>
  @layer od.components {
    .od-account-avatar {
      position: relative;
      flex: none;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      border-radius: 24px;
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .od-account-avatar--circle {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      background: var(--od-band-avatar);
      color: var(--od-nav-avatar-ink);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
      font-weight: 600;
    }

    /* The rail: a 40 dp circle in the secondary colour, on the rail's light surface. */
    .od-account-avatar--rail {
      width: 56px;
      height: 56px;

      .od-account-avatar--circle {
        width: 40px;
        height: 40px;
        border-radius: 20px;
        background: var(--od-nav-avatar-ink);
        color: #FFFFFF;
        font-size: 17px;
      }

      .od-account-avatar--badge {
        top: 6px;
        right: 6px;
        box-shadow: 0 0 0 2px var(--od-background);
      }
    }

    /* iPhone (task 2026-11-14-127): a 32 pt circle in the secondary colour, white initial. */
    .od-account-avatar--ios {
      width: 44px;
      height: 44px;

      .od-account-avatar--circle {
        background: var(--od-secondary);
        color: var(--od-on-secondary);
        font-size: 15px;
      }

      .od-account-avatar--badge {
        top: 4px;
        right: 4px;
        box-shadow: 0 0 0 2px var(--od-background);
      }
    }

    /* Mouse: the Material 3 hover layer, 8 % of the circle's content colour, over the circle. */
    @media (hover: hover) and (pointer: fine) {
      .od-account-avatar--circle {
        position: relative;
      }
      .od-account-avatar--circle::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: currentColor;
        opacity: 0;
        transition: opacity 120ms linear;
      }
      .od-account-avatar:hover .od-account-avatar--circle::after {
        opacity: 0.08;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .od-account-avatar--circle::after {
        transition: none;
      }
    }

    /* A small dot at the top right of the circle; its meaning is also in the sheet, in words. */
    .od-account-avatar--badge {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 10px;
      height: 10px;
      border-radius: 5px;
      box-shadow: 0 0 0 2px var(--od-band-control);

      &.od-account-avatar--waiting {
        background: var(--od-tertiary);
      }

      &.od-account-avatar--alarm {
        background: var(--od-alarm);
      }
    }
  }
</style>
