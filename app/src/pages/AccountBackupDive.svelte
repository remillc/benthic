<script>
  // @ts-check
  // « Une version d’une plongée » on a phone (tasks 2026-11-19-290 and 2026-11-22-319; sauvegarde-une-plongee-android,
  // sauvegarde-plongee-android, ios-sauvegarde-plongee): without a dive in the address, the choice of a dive (the dives changed
  // recently); with one, its versions. A row of the choice opens the dive's versions, whose back arrow returns to the choice; the
  // dive's menu, « Versions de cette plongée », opens them directly.
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import BackupDive from '../components/BackupDive.svelte';
  import BackupDivePick from '../components/BackupDivePick.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { params: Record<string, string> }, f7router: any }} */
  let { f7route, f7router } = $props();
  /** `2022-04-24T10:30:00` in the address, `2022-04-24 10:30:00` for the repository; empty on the choice. */
  const startKey = (f7route.params.key ?? '').replace('T', ' ');
  const PICK = '/account/backup/dive/';
  /** The page before this one, to know whether the versions were reached from the choice. */
  const fromPick = startKey && f7router.history?.[f7router.history.length - 2] === PICK;

  /** @param {string} key */
  const open = (key) => f7router.navigate(`/account/backup/dive/${key.replace(' ', 'T')}`);
  /** « Changer »: back to the choice, or to a new one when the versions were opened from the dive's menu. */
  const change = () => (fromPick ? f7router.back() : f7router.navigate(PICK));
</script>

<Page class="bc-account-backup-page">
  <Navbar title={startKey ? t('backup.dive.title') : t('backup.dive.pickTitle')}>
    {#snippet left()}
      <BackLink label={startKey ? (fromPick ? t('backup.dive.pickTitle') : '') : t('backup.title')} name={t('detail.back')} />
    {/snippet}
  </Navbar>
  {#if startKey}
    <BackupDive {startKey} onchange={change} />
  {:else}
    <BackupDivePick onpick={open} />
  {/if}
</Page>
