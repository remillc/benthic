<script>
  // @ts-check
  // Alpha first launch on a phone, « Commencer sans compte » (task 2026-11-16-233; docs/mockups/
  // android-premier-lancement-alpha-sans-compte.dc.html): says where the logbook stays before it is created.
  // Three rows in a white card (this phone only, no backup, to link later), then « Commencer ».
  // The logbook of this phone opens, with a snackbar. Tablets and iPhone start the logbook straight from
  // the first screen.
  import EditorialPage from '../components/EditorialPage.svelte';
  import Icon from '../components/Icon.svelte';
  import { announceFirstLaunch } from '../lib/account.js';
  import { startWithoutAccount } from '../lib/logbook.svelte.js';
  import { deviceKey } from '../lib/first-launch.js';
  import { deviceKind } from '../lib/layout.svelte.js';
  import { t } from '../lib/i18n.js';

  let busy = $state(false);

  /** @type {{ key: string, text: string, icon: 'device'|'tablet'|'warning'|'link', warn?: boolean }[]} */
  const rows = $derived([
    { key: 'phoneOnly', text: 'phoneOnlyText', icon: { phone: 'device', tablet: 'tablet', desktop: 'desktop' }[deviceKind()] },
    { key: 'noBackup', text: deviceKey('noBackupText', deviceKind()), icon: 'warning', warn: true },
    { key: 'later', text: 'laterText', icon: 'link' },
  ]);

  async function start() {
    busy = true;
    try {
      await startWithoutAccount();
      announceFirstLaunch('local');
    } finally {
      busy = false;
    }
  }
</script>

<EditorialPage class="bc-without-account"
  firstLaunch
  helpLink
  title={t('welcome.noAccount')}
  heading={t('welcome.noAccount')}
  intro={t('firstLaunch.local.intro')}
  action={t('firstLaunch.local.start')}
  {busy}
  onaction={start}
>
  <ul class="bc-without-account--rows">
    {#each rows as row (row.key)}
      <li>
        <span class="bc-without-account--tile" class:bc-without-account--warn={row.warn} aria-hidden="true"><Icon name={row.icon} size={22} /></span>
        <span class="bc-without-account--text">
          <span class="bc-without-account--label">{t(row.key === 'phoneOnly' ? deviceKey('firstLaunch.local.phoneOnly', deviceKind()) : `firstLaunch.local.${row.key}`)}</span>
          <span class="bc-without-account--detail">{t(`firstLaunch.local.${row.text}`)}</span>
        </span>
      </li>
    {/each}
  </ul>
</EditorialPage>

<style>
  @layer od.components {
    .bc-without-account--rows {
      margin: 0;
      padding: 2px 16px;
      list-style: none;
      border: 1px solid var(--bc-surface-container-highest);
      border-radius: 20px;
      background: var(--bc-surface);

      li {
        padding: 14px 0;
        display: flex;
        gap: 14px;
        align-items: flex-start;

        & + li {
          border-top: 1px solid var(--bc-first-row-line);
        }
      }
    }

    .bc-without-account--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--bc-first-tile);
      color: var(--bc-secondary);
      display: flex;
      align-items: center;
      justify-content: center;

      &.bc-without-account--warn {
        background: var(--bc-first-tile-warn);
        color: var(--bc-tertiary);
      }
    }

    .bc-without-account--text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-without-account--label {
      font-size: 16px;
      line-height: 21px;
      font-weight: 600;
    }

    .bc-without-account--detail {
      font-size: 14px;
      line-height: 19px;
      color: var(--bc-text-2);
    }
  }
</style>
