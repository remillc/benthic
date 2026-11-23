<script>
  // @ts-check
  // The red badge of the Profil entry (task 2026-11-23-347): the number of maintenance reminders overdue, the same count as
  // the badge of the « Entretien » row of the profile home (lib/account-sheet.js, profileRow). Nothing at 0. Shown over the
  // top right of the entry's icon, in the bottom bar, the iPhone tab bar and the rail.
  import { t } from '../lib/i18n.js';
  import { overdueBadge } from '../lib/inventory.svelte.js';
  import { profileRow } from '../lib/account-sheet.js';

  const late = $derived(profileRow(overdueBadge()));
</script>

{#if late.late}<span class="bc-nav-badge" role="status" aria-label={t('maintenance.badge', { n: late.badge })}>{late.badge > 99 ? '99+' : late.badge}</span>{/if}

<style>
  @layer bc.components {
    .bc-nav-badge {
      position: absolute;
      top: -4px;
      inset-inline-start: calc(50% + 2px);
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      box-sizing: border-box;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--bc-alarm);
      color: #FFFFFF;
      font-size: 11px;
      line-height: 16px;
      font-weight: 600;
      pointer-events: none;
    }
  }
</style>
