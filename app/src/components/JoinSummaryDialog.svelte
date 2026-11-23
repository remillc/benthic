<script>
  // @ts-check
  // « Premier envoi, résumé et pièces à confirmer » (inbox task 2026-11-23-338, item 11; Benthic+ only): « Jumeler cet
  // appareil », three counters (reconnues, nouvelles, à confirmer), then one card per ambiguous match with « Cet appareil : … »
  // and « Votre compte : … » over a segmented button « Même pièce | Deux pièces ». « Jumeler » calls `onjoin` with
  // `[{ id, same }]` (lib/account-sync-screens.js `joinResolutions`); « Annuler » (`oncancel`) sends nothing. The content
  // scrolls inside the dialog. A match nobody touched answers `defaultChoice`.
  import Md3Dialog from './Md3Dialog.svelte';
  import ButtonGroup from './ButtonGroup.svelte';
  import { t } from '../lib/i18n.js';
  import { joinCounters, joinResolutions } from '../lib/account-sync-screens.js';

  /**
   * @type {{
   *   recognised: number,
   *   added: number,
   *   matches: import('../lib/account-sync-screens.js').AmbiguousMatch[],
   *   onjoin: (resolutions: { id: string, same: boolean }[]) => void,
   *   oncancel: () => void,
   *   defaultChoice?: 'same'|'two',
   *   busy?: boolean,
   * }}
   */
  let { recognised, added, matches, onjoin, oncancel, defaultChoice = 'same', busy = false } = $props();

  /** @type {Record<string, 'same'|'two'|undefined>} */
  let choices = $state({});
  const counters = $derived(joinCounters({ recognised, added, matches }));
  const options = $derived([
    { value: 'same', label: t('accountSync.join.same') },
    { value: 'two', label: t('accountSync.join.two') },
  ]);
</script>

<Md3Dialog title={t('accountSync.join.title')} class="bc-join-summary" {oncancel}>
  <div class="bc-join-summary--body">
    <p class="bc-join-summary--intro">{t('accountSync.join.intro')}</p>
    <div class="bc-join-summary--counters">
      {#each counters as counter (counter.id)}
        <div class="bc-join-summary--counter" data-counter={counter.id}>
          <span class="bc-join-summary--number">{counter.value}</span>
          <span class="bc-join-summary--caption">{t(`accountSync.join.${counter.id}`)}</span>
        </div>
      {/each}
    </div>
    {#each matches as match (match.id)}
      <div class="bc-join-summary--match" data-match={match.id}>
        <p class="bc-join-summary--side">{t('accountSync.join.thisDevice', { name: match.thisDevice })}</p>
        <p class="bc-join-summary--side">{t('accountSync.join.account', { name: match.account })}</p>
        <ButtonGroup class="bc-join-summary--choice" ariaLabel={`${match.thisDevice} / ${match.account}`} {options} value={choices[match.id] ?? defaultChoice} onchange={(v) => (choices[match.id] = v === 'two' ? 'two' : 'same')} />
      </div>
    {/each}
  </div>
  {#snippet actions()}
    <button type="button" data-action="cancel" disabled={busy} onclick={oncancel}>{t('accountSync.join.cancel')}</button>
    <button type="button" data-action="join" disabled={busy} onclick={() => onjoin(joinResolutions(matches, choices, defaultChoice))}>{t('accountSync.join.join')}</button>
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    .bc-join-summary--body {
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-join-summary--intro {
      margin: 4px 0 8px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-join-summary--counters {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .bc-join-summary--counter {
      padding: 12px 8px;
      border-radius: 16px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .bc-join-summary--number {
      font-size: 28px;
      line-height: 36px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .bc-join-summary--caption {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-join-summary--match {
      padding: 12px 16px 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .bc-join-summary--side {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      overflow-wrap: anywhere;
    }

    :global(.bc-join-summary--choice) {
      margin-top: 8px;
    }

    :global(.bc-join-summary .bc-md3-dialog--actions button:disabled) {
      opacity: 0.38;
      cursor: default;
    }
  }
</style>
