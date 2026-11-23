<script>
  // @ts-check
  // The account data sync's screens, mounted once in App.svelte (like ConflictHost) so that they show over any page
  // (inbox task 2026-11-23-338; Benthic+ only). It chooses which screen is due from the sync's state (`accountSync`), keeps the
  // flags of the locked look (`accountLock`) and hands each screen's buttons to lib/account-sync-flows.svelte.js. The screens are
  // dialogs: they own no route, so nothing here touches the router.
  import { onMount, untrack } from 'svelte';
  import AccountUnlockDialog from './AccountUnlockDialog.svelte';
  import AccountDifferentDialog from './AccountDifferentDialog.svelte';
  import PairRequestDialog from './PairRequestDialog.svelte';
  import OrphanedDataDialog from './OrphanedDataDialog.svelte';
  import PairMismatchDialog from './PairMismatchDialog.svelte';
  import PairConfirmDialog from './PairConfirmDialog.svelte';
  import PairedDialog from './PairedDialog.svelte';
  import RecoveryKeyOffer from './RecoveryKeyOffer.svelte';
  import RecoveryKeyShow from './RecoveryKeyShow.svelte';
  import RecoveryKeyEnter from './RecoveryKeyEnter.svelte';
  import JoinSummaryDialog from './JoinSummaryDialog.svelte';
  import StartOverDialog from './StartOverDialog.svelte';
  import { accountSync } from '../lib/account-sync.svelte.js';
  import { benthicPlusAccount } from '../lib/benthic-plus-state.svelte.js';
  import { dueScreen } from '../lib/account-sync-screens.js';
  import * as flows from '../lib/account-sync-flows.svelte.js';

  const flow = flows.accountFlow;

  onMount(() => {
    flows.wireLockActions();
    return () => clearTimeout(waiting);
  });

  /** Counts up while a question waits for another modal to close, so that the effect below looks again. */
  let recheck = $state(0);
  let waiting = 0;

  // The locked look of the profile and the account sheet's « Jumeler un nouvel appareil » row.
  $effect(() => {
    const on = benthicPlusAccount.signedIn;
    flows.setLockFlags({ locked: on && accountSync.keyMissing });
  });

  // A device that holds the key looks for the requests of new devices while the app is open and in front: every 15 s (and at
  // once when it comes back to the front), plus a look in the working copy after each sync run. It stops when the device cannot
  // approve (signed out, key missing, pull only).
  const canApprove = $derived(benthicPlusAccount.signedIn && !accountSync.keyMissing && !accountSync.pullOnly && (accountSync.status === 'synced' || accountSync.status === 'syncing'));
  $effect(() => {
    if (!canApprove) return;
    return untrack(() => flows.watchRequests());
  });
  $effect(() => {
    void accountSync.lastSyncedAt;
    if (!canApprove) return;
    untrack(() => {
      void flows.refreshRequests({ network: false });
      void flows.touchDevice();
    });
  });
  // A request is put in front of the diver by itself when nothing else is open; the account sheet's row asks again after a « Plus tard ».
  $effect(() => {
    void recheck;
    if (!canApprove || flow.screen || flow.busy || !flow.requests.length) return;
    untrack(() => {
      const next = flows.requestDue();
      if (!next) return;
      if (flows.modalInTheWay()) {
        clearTimeout(waiting);
        waiting = /** @type {any} */ (setTimeout(() => recheck++, 1000));
        return;
      }
      flows.askApproval(next);
    });
  });

  // Which screen is due, one at a time and in this order: another account, the missing key, the join, the recovery key. A
  // manual sync runs again after a screen was closed, so a question left open comes back then.
  $effect(() => {
    // `flow.busy`: a pairing in progress (no screen is open between the scan and « Appareil jumelé »): nothing is asked meanwhile.
    if (!benthicPlusAccount.signedIn || flow.screen || flow.busy) return;
    void recheck;
    if (accountSync.status === 'syncing') return flows.resetQuestions();
    const { status, differentAccount, keyMissing, joinNeeded, pullOnly, orphaned } = accountSync;
    untrack(() => {
      const due = dueScreen({ status, differentAccount, keyMissing, joinNeeded, pullOnly, orphaned }, { different: flows.differentDue(), unlock: flows.unlockDue(), join: flows.joinDue(), orphans: flows.orphansDue(), recovery: flows.recoveryOfferDue() });
      if (due && flows.modalInTheWay()) {
        clearTimeout(waiting);
        waiting = /** @type {any} */ (setTimeout(() => recheck++, 1000));
        return;
      }
      if (due === 'different') flows.askDifferentAccount();
      else if (due === 'unlock') flows.askUnlock();
      else if (due === 'join') void flows.openJoin();
      else if (due === 'orphans') flows.askOrphans();
      else if (due === 'recovery') flows.offerRecoveryKey();
    });
  });

  // « Modifié sur deux appareils »: the notice, then the list is cleared.
  $effect(() => {
    if (accountSync.conflicts.length) untrack(() => void flows.announceConflicts());
  });
</script>

{#if benthicPlusAccount.signedIn}
  {#if flow.screen === 'unlock'}
    <AccountUnlockDialog names={flow.devices.map((d) => d.name)} onpair={() => void flows.askForAccess()} onrecoverykey={flows.openRecoveryKeyEntry} onlater={flows.closeScreen} onlost={() => (flow.screen = 'startOver')} />
  {:else if flow.screen === 'requestWait'}
    <PairRequestDialog kind="waiting" code={flow.code} names={flow.devices.map((d) => d.name)} expiresAt={flow.expiresAt} oncancel={flows.cancelAccessRequest} />
  {:else if flow.screen === 'requestEnded'}
    <PairRequestDialog kind={/** @type {'declined'|'expired'|'failed'} */ (flow.endReason || 'failed')} by={flow.endBy} oncancel={flows.closeScreen} onagain={() => void flows.askForAccess()} onlost={flows.openStartOver} />
  {:else if flow.screen === 'approve'}
    <PairConfirmDialog deviceName={flow.deviceName} code={flow.code} busy={flow.busy} onconfirm={() => void flows.approveNow()} onrefuse={() => void flows.declineNow()} onmismatch={() => void flows.declineMismatch()} onlater={flows.putAsideRequest} />
  {:else if flow.screen === 'mismatch'}
    <PairMismatchDialog deviceName={flow.deviceName} onclose={flows.closeScreen} />
  {:else if flow.screen === 'paired'}
    <PairedDialog onclose={flows.closeScreen} />
  {:else if flow.screen === 'joined'}
    <PairedDialog onclose={flows.closeScreen} lines={flow.joinedLines} />
  {:else if flow.screen === 'offer'}
    <RecoveryKeyOffer busy={flow.busy} oncreate={() => void flows.makeRecoveryKey()} onlater={flows.postponeRecoveryKey} />
  {:else if flow.screen === 'show'}
    <RecoveryKeyShow recoveryKey={flow.recoveryKey} oncopy={(text) => void flows.copyRecoveryKey(text)} ondone={flows.doneWithRecoveryKey} />
  {:else if flow.screen === 'enter'}
    <RecoveryKeyEnter error={/** @type {'' | 'wrong'} */ (flow.error)} busy={flow.busy} onrecoverykey={(key) => void flows.enterRecoveryKey(key)} oncancel={flows.closeScreen} />
  {:else if flow.screen === 'startOver'}
    <StartOverDialog busy={flow.busy} onstartover={() => void flows.startOverNow()} oncancel={flows.closeScreen} />
  {:else if flow.screen === 'join'}
    <JoinSummaryDialog recognised={flow.join.recognised} added={flow.join.added} matches={flow.join.matches} busy={flow.busy} onjoin={(answers) => void flows.confirmJoin(answers)} oncancel={flows.closeScreen} />
  {:else if flow.screen === 'orphans'}
    <OrphanedDataDialog busy={flow.busy} onerase={() => void flows.eraseOrphansNow()} onlater={flows.closeScreen} />
  {:else if flow.screen === 'different'}
    <AccountDifferentDialog onuse={() => void flows.useThisAccount()} onkeep={flows.closeScreen} />
  {/if}
{/if}
