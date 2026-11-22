<script>
  // @ts-check
  // Android phone: the account avatar at the right of a section's top bar, before the page's ⋮
  // (task 2026-11-14-120). A 32 dp circle with the account's initial (the generic account icon
  // without an account) in a 48 dp target; it opens the account sheet. A small badge says that
  // something waits: changes not sent or a map update (tertiary), a sync error (alarm).
  import Icon from './Icon.svelte';
  import { benthicPlusAccount, benthicPlusSubscriber } from '../lib/benthic-plus-state.svelte.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { bottomNav, layout, ios, desktopApp } from '../lib/layout.svelte.js';

  /** rail: at the bottom of the Android tablet rail (task 2026-11-14-126), a 64 dp circle. */
  let { rail = false } = $props();
  const shown = $derived(rail ? layout.rail && !ios : bottomNav());
  import { updatesCount } from '../lib/offline-maps.svelte.js';
  import { t } from '../lib/i18n.js';
  import { isRelease } from '../lib/edition.js';
  import { accountEmail, sheetVariant } from '../lib/account-sheet.js';

  const email = $derived(accountEmail(benthicPlusAccount, logbook));
  const initial = $derived(email.trim().charAt(0).toLocaleUpperCase());
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
  // Free version (task 2026-11-18-281): the silhouette in the same disc, named by what the sheet holds.
  const free = $derived(sheetVariant({ release: isRelease, subscriber: benthicPlusSubscriber(), email: logbook.email }) === 'free');
  const label = $derived(
    free ? t('nav.accountLabelFree') + (waiting ? `. ${waiting}` : '') : t('nav.accountLabel', { name: email || t('menu.noAccount') }) + (waiting ? `. ${waiting}` : ''),
  );
</script>

{#if shown}
  <button type="button" class="bc-account-avatar" class:bc-account-avatar--rail={rail} class:bc-account-avatar--tablet={rail && !desktopApp} class:bc-account-avatar--ios={ios} aria-label={label} aria-haspopup="dialog" onclick={() => (navigation.accountOpen = true)}>
    <span class="bc-account-avatar--circle">
      {#if initial}{initial}{:else}<Icon name="account" size={rail ? (desktopApp ? 38 : 44) : 20} weight={2} />{/if}
    </span>
    {#if badge}<span class="bc-account-avatar--badge bc-account-avatar--{badge}" aria-hidden="true"></span>{/if}
  </button>
{/if}

<style>
  @layer od.components {
    .bc-account-avatar {
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

    .bc-account-avatar--circle {
      width: 32px;
      height: 32px;
      border-radius: 16px;
      background: var(--bc-band-avatar);
      color: var(--bc-nav-avatar-ink);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      line-height: 1;
      font-weight: 600;
    }

    /* The rail (Android tablet and desktop): a 64 dp circle in the secondary colour, in an 80 dp target, on the rail's light surface (the rail is 96 dp wide). */
    .bc-account-avatar--rail {
      width: 80px;
      height: 80px;
      border-radius: 40px;

      .bc-account-avatar--circle {
        width: 64px;
        height: 64px;
        border-radius: 32px;
        background: var(--bc-nav-avatar-ink);
        color: #FFFFFF;
        font-size: 28px;
      }

      .bc-account-avatar--badge {
        top: 12px;
        right: 12px;
        box-shadow: 0 0 0 2px var(--bc-background);
      }
    }

    .bc-account-avatar--tablet {
      .bc-account-avatar--circle {
        width: 72px;
        height: 72px;
        border-radius: 36px;
        font-size: 32px;
      }

      .bc-account-avatar--badge {
        top: 8px;
        right: 8px;
      }
    }

    /* iPhone (task 2026-11-14-127): a 32 pt circle in the secondary colour, white initial. */
    .bc-account-avatar--ios {
      width: 44px;
      height: 44px;

      .bc-account-avatar--circle {
        background: var(--bc-secondary);
        color: var(--bc-on-secondary);
        font-size: 15px;
      }

      .bc-account-avatar--badge {
        top: 4px;
        right: 4px;
        box-shadow: 0 0 0 2px var(--bc-background);
      }
    }

    /* Mouse: the Material 3 hover layer, 8 % of the circle's content colour, over the circle. */
    @media (hover: hover) and (pointer: fine) {
      .bc-account-avatar--circle {
        position: relative;
        &::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: currentColor;
          opacity: 0;
          transition: opacity 120ms linear;
        }
      }
      .bc-account-avatar:hover .bc-account-avatar--circle::after {
        opacity: 0.08;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-account-avatar--circle::after {
        transition: none;
      }
    }

    /* A small dot at the top right of the circle; its meaning is also in the sheet, in words. */
    .bc-account-avatar--badge {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 10px;
      height: 10px;
      border-radius: 5px;
      box-shadow: 0 0 0 2px var(--bc-band-control);

      &.bc-account-avatar--waiting {
        background: var(--bc-tertiary);
      }

      &.bc-account-avatar--alarm {
        background: var(--bc-alarm);
      }
    }
  }
</style>
