<script>
  // @ts-check
  // The "Equipment" section of the dive detail (docs/mockups/detail3-android.dc.html):
  // one card, collapsed by default, with the suit (only when set) and the total
  // weight in bold and a chevron on the right. A tap anywhere opens it and shows
  // the weights by location, as the section did before. Role button with
  // aria-expanded.
  import Icon from './Icon.svelte';
  import ButtonGroup from './ButtonGroup.svelte';
  import DcTile from './DcTile.svelte';
  import { ownComputerPhoto } from '../lib/gear-photos.svelte.js';
  import { FEEDBACK_CHOICES } from '../lib/weight-feedback.js';
  import { t } from '../lib/i18n.js';

  /**
   * @type {{
   *   label: string,
   *   suit: string,
   *   undersuit?: string,
   *   weightTotal: string,
   *   weights: { place: string, weight: string }[],
   *   computer?: string,
   *   computers?: { name: string, model?: string, serial?: string, main: boolean }[],
   *   open: boolean,
   *   opens?: boolean,
   *   ontoggle: () => void,
   *   feedback?: string,
   *   onfeedback?: (value: string) => void,
   *   oncomputers?: () => void,
   * }}
   * label: the accessible name, "Equipment: dry suit, weights 35 lb. Show details";
   * weightTotal: empty when no weight is set; weights: one entry per location.
   * computer: the main computer's name (a third row); computers: all of them, listed when open;
   * opens: false when opening would show nothing more (one weight, no
   * location): a plain card, no chevron.
   * Open, the order is: suit, weight total, weights by location, "Ce lest était"
   * (feedback: 'too-light', 'ok', 'too-heavy' or '', when a weight is set and
   * onfeedback is given), then the computer. Closed, the computer row is the third row.
   * With several computers (task 2026-11-14-144), a block « Ordinateurs » under the card's rows,
   * open or closed: one row per computer, « Principal » on the first; a tap calls oncomputers.
   */
  let { label, suit, undersuit = '', weightTotal, weights, computer = '', computers = [], open, opens = true, ontoggle, feedback = '', onfeedback, oncomputers } = $props();

  /** Several computers: their own block, always shown, instead of the « Ordinateur » row. */
  const several = $derived(computers.length > 1);
  const computersLabel = $derived(
    t('detail.computersLabel', { list: computers.map((c) => (c.main ? t('detail.computerMain', { name: c.name }) : c.name)).join(', ') }),
  );

  const spread = $derived(opens && open);
  /** The computer row stays in the summary when closed, or when it is the only row. */
  const computerInSummary = $derived(!spread || (!suit && !weightTotal));
  const feedbackOptions = $derived(FEEDBACK_CHOICES.map((value) => ({ value, label: t(`weightFeedback.${value === 'too-light' ? 'tooLight' : value === 'ok' ? 'ok' : 'tooHeavy'}`) })));
</script>

{#snippet noPhoto()}{/snippet}
<!-- The main computer: its photo at 32 dp before its name (task 2026-11-19-306); a model without a photo shows the name alone. -->
{#snippet computerValue()}
  {@const main = computers[0]}
  <span class="bc-equipment-card--value bc-equipment-card--computer-value">
    {#if main?.model}<DcTile model={main.model} size={32} radius={8} photo={ownComputerPhoto(main.model, main.serial)} fallback={noPhoto} />{/if}
    <span>{computer}</span>
  </span>
{/snippet}

<div class="bc-equipment-card">
  <svelte:element
    this={opens ? 'button' : 'div'}
    type={opens ? 'button' : undefined}
    class="bc-equipment-card--summary"
    class:bc-equipment-card--static={!opens}
    role={opens ? undefined : 'group'}
    aria-expanded={opens ? open : undefined}
    aria-label={label}
    onclick={opens ? ontoggle : undefined}
  >
    <span class="bc-equipment-card--rows">
      {#if suit}
        <span class="bc-equipment-card--row"><span class="bc-equipment-card--name">{t('detail.suitRow')}</span><span class="bc-equipment-card--value">{suit}</span></span>
      {/if}
      {#if undersuit}
        <span class="bc-equipment-card--row"><span class="bc-equipment-card--name">{t('gear.diveGear.undersuit')}</span><span class="bc-equipment-card--value">{undersuit}</span></span>
      {/if}
      {#if weightTotal}
        <span class="bc-equipment-card--row"><span class="bc-equipment-card--name">{t('detail.weights')}</span><span class="bc-equipment-card--value bc-equipment-card--strong bc-value">{weightTotal}</span></span>
      {/if}
      {#if computer && computerInSummary && !several}
        <span class="bc-equipment-card--row"><span class="bc-equipment-card--name">{t('detail.computerRow')}</span>{@render computerValue()}</span>
      {/if}
    </span>
    {#if opens}<span class="bc-equipment-card--chevron" class:bc-equipment-card--open={open}><Icon name="expand" size={24} weight={2} /></span>{/if}
  </svelte:element>
  {#if spread && weights.length}
    <ul class="bc-equipment-card--weights" aria-label={t('detail.weightsByPlace')}>
      {#each weights as weight, i (i)}
        <li class="bc-value"><span>{weight.place || t('detail.weights')}</span><span>{weight.weight}</span></li>
      {/each}
    </ul>
  {/if}
  {#if spread && weightTotal && onfeedback}
    <div class="bc-equipment-card--feedback">
      <p class="bc-equipment-card--feedback-title" id="od-weight-feedback-title">{t('weightFeedback.title')}</p>
      <ButtonGroup options={feedbackOptions} value={feedback} onchange={(v) => onfeedback(v)} ariaLabelledby="od-weight-feedback-title" clearable rail />
    </div>
  {/if}
  {#if spread && computer && !computerInSummary && !several}
    <div class="bc-equipment-card--computer">
      <span class="bc-equipment-card--row"><span class="bc-equipment-card--name">{t('detail.computerRow')}</span>{@render computerValue()}</span>
    </div>
  {/if}
  {#if several}
    <!-- One touch target: it opens « Ordinateurs de cette plongée » (detail-ordinateurs-android.dc.html). -->
    <button type="button" class="bc-equipment-card--computers" aria-label={computersLabel} aria-haspopup="dialog" onclick={oncomputers}>
      <span class="bc-equipment-card--computers-head">
        <span>{t('detail.computersRow')}</span>
        <Icon name="chevron" size={24} weight={2} />
      </span>
      {#each computers as c, i (i)}
        <span class="bc-equipment-card--computer-row">
          <DcTile model={c.model ?? c.name} photo={ownComputerPhoto(c.model ?? c.name, c.serial)} />
          <span class="bc-equipment-card--computer-name">{c.name}</span>
          {#if c.main}<span class="bc-equipment-card--main">{t('detail.mainBadge')}</span>{/if}
        </span>
      {/each}
    </button>
  {/if}
</div>

<style>
  @layer od.components {
    .bc-equipment-card--computers {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 0 8px 4px 16px;
      border: none;
      border-top: 1px solid var(--bc-row-divider);
      background: none;
      color: var(--bc-text);
      font: inherit;
      text-align: start;
    }

    .bc-equipment-card--computers-head {
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 16px;

      :global(.bc-icon) {
        color: var(--bc-text-2);
      }
    }

    .bc-equipment-card--computer-row {
      min-height: 64px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding-right: 8px;
      border-top: 1px solid var(--bc-row-divider);

      :global(.bc-icon) {
        flex: none;
        color: var(--bc-text-2);
      }

      /* iPhone: 68 pt rows (detail-ordinateurs-feuille-ios). */
      :global(.ios) & {
        min-height: 68px;
      }
    }

    .bc-equipment-card--computer-name {
      flex: 1;
      min-width: 0;
      font-size: 16px;
      color: var(--bc-text-2);
    }

    /* « Principal »: #114477 on #D4E2F2, as the blue theme's selection. */
    .bc-equipment-card--main {
      flex: none;
      height: 24px;
      padding: 0 10px;
      border-radius: 12px;
      background: var(--bc-secondary-container);
      color: var(--bc-secondary);
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
    }

    .bc-equipment-card {
      border-radius: 16px;
      background: var(--bc-surface);
      color: var(--bc-text);
      overflow: hidden;
    }

    .bc-equipment-card--summary {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 8px 4px 16px;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      &.bc-equipment-card--static {
        padding-inline-end: 16px;
        cursor: default;
      }
    }

    .bc-equipment-card--rows {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-equipment-card--row {
      min-height: 48px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 16px;

      & + & {
        border-top: 1px solid var(--bc-separator);
      }
    }

    .bc-equipment-card--name {
      flex: 1;
    }

    .bc-equipment-card--value {
      color: var(--bc-text-2);
      font-variant-numeric: tabular-nums;
      text-align: end;

      &.bc-equipment-card--strong {
        font-weight: 600;
        color: var(--bc-text);
      }
    }

    .bc-equipment-card--computer-value {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .bc-equipment-card--chevron {
      flex: none;
      display: flex;

      &.bc-equipment-card--open {
        transform: rotate(180deg);
      }
    }

    /* "Ce lest était": its title, then the three buttons. */
    .bc-equipment-card--feedback {
      padding: 12px 16px 16px;
      border-top: 1px solid var(--bc-separator);
    }

    .bc-equipment-card--feedback-title {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-equipment-card--computer {
      padding: 0 16px;
      border-top: 1px solid var(--bc-separator);
    }

    /* The weights by location: one line each, as the section showed them. */
    .bc-equipment-card--weights {
      margin: 0;
      padding: 12px 16px 14px;
      list-style: none;
      border-top: 1px solid var(--bc-separator);
      display: flex;
      flex-direction: column;
      gap: 4px;

      li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
        line-height: 20px;
        color: var(--bc-text-2);
      }
    }


    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-equipment-card--summary {
        transition: box-shadow 120ms linear;
        &:not(.bc-equipment-card--static):hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bc-equipment-card--summary {
        transition: none;
      }
    }
  }
</style>
