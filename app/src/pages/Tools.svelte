<script>
  // @ts-check
  // Tools section (task 2026-11-14-122; docs/ui-specification.md, section 1, "Tools page and
  // gas tools"; docs/mockups/android-outils.dc.html, android-tablette-outils-*.dc.html). The two
  // dive tools are cards that say their state: the planned dives of the logbook, and the wait
  // before flying with the time since the last dive. The three gas tools are rows of one card
  // (task 2026-11-14-128).
  // On a tablet the page takes the width (no list pane): the two cards side by side, and a
  // tool opens over the page, as on a phone.
  import { Page, Navbar, NavRight, theme } from 'framework7-svelte';
  import { BenthicCore } from 'benthic-core';
  import MenuButton from '../components/MenuButton.svelte';
  import AccountAvatar from '../components/AccountAvatar.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import BandBackdrop from '../components/BandBackdrop.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { startup } from '../lib/startup.svelte.js';
  import { desaturationState } from '../lib/tools-page.js';
  import { formatHoursMinutes } from '../lib/tools.js';
  import { formatDuration, localNowIso } from '../lib/format.js';

  // The time moves: read the clock again every 30 seconds, and when the app comes back.
  let now = $state(localNowIso());
  $effect(() => {
    const tick = () => (now = localNowIso());
    const timer = setInterval(tick, 30000);
    const back = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', back);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
    };
  });

  const desat = $derived(logbook.loading ? null : desaturationState(logbook.dives, settings.flightWait, now));
  /** "55 min", "6 h 10": as the wait before flying is written. @param {number} seconds */
  const spell = (seconds) => (seconds < 3600 ? formatDuration(seconds, 'minutes') : formatHoursMinutes(seconds));
  const wait = $derived(desat?.kind === 'waiting' ? spell(desat.remainingSeconds) : '');
  // The time since surfacing counts whole minutes behind (the wait, rounded up, counts ahead).
  const ago = $derived(desat && desat.sinceSeconds >= 0 ? spell(desat.sinceSeconds - (desat.sinceSeconds % 60)) : '');
  const desatLabel = $derived(desat ? t(`tools.desaturationLabel.${desat.kind}`, { time: wait, ago }) : t('tools.desaturation'));

  /** The planned dives of the logbook; null until read. */
  let plans = $state(/** @type {number|null} */ (null));
  let reading = false;
  /** Asked again while a read was running: read once more after it. */
  let again = false;

  async function readPlans() {
    if (reading) {
      again = true;
      return;
    }
    reading = true;
    do {
      again = false;
      try {
        plans = (await BenthicCore.listPlans()).length;
      } catch {
        plans = null;
      }
    } while (again);
    reading = false;
  }

  // Read again each time the page is shown at the root of its section, and when the logbook
  // changes (a download, a sync, a saved plan).
  $effect(() => {
    void logbook.dives;
    if (logbook.loading || !startup.ready || navigation.section !== 'tools' || !navigation.atRoot) return;
    readPlans();
  });

  const plansText = $derived(plans === null ? '' : plans === 0 ? t('tools.plansNone') : t('tools.plansCount', { n: plans }));

  /** @type {{ href: string, icon: 'depthGauge'|'bestMix'|'blender', shape: string, name: string, text: string }[]} */
  const gases = $derived([
    { href: '/tools/ead-mod', icon: 'depthGauge', shape: 'square', name: t('tools.eadMod'), text: t('tools.eadModText') },
    { href: '/tools/best-mix', icon: 'bestMix', shape: 'circle', name: t('tools.bestMixTool'), text: t('tools.bestMixText') },
    { href: '/tools/blender', icon: 'blender', shape: 'leaf', name: t('tools.blender'), text: t('tools.blenderText') },
  ]);
</script>

<Page class="bc-tools" onPageBeforeIn={() => startup.ready && readPlans()}>
  <Navbar large={theme.ios} class={theme.ios ? 'bc-ios-bar' : 'bc-band-bar bc-band-titled'} title={t('tools.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight><AccountAvatar /></NavRight>
  </Navbar>

  {#if !theme.ios}<BandBackdrop short />{/if}
  <SectionBand bare={!theme.ios} summary={t('band.tools')} />

  <div class="bc-tools--content">
    <div class="bc-tools--dive">
      <a class="bc-tools--card" href="/plans/">
        <span class="bc-tools--card-row">
          <span class="bc-tools--card-icon bc-tools--plan-icon"><Icon name="plan" /></span>
          <span class="bc-tools--texts">
            <span class="bc-tools--card-title">{t('tools.planner')}</span>
            <span class="bc-tools--card-line">{plansText}</span>
          </span>
          <span class="bc-tools--chevron"><Icon name="chevron" size={20} /></span>
        </span>
      </a>

      <a class="bc-tools--card" href="/tools/desaturation" aria-label={desatLabel}>
        <span class="bc-tools--card-row">
          <span class="bc-tools--card-icon bc-tools--desat-icon" class:bc-tools--idle={desat?.kind === 'rest' || desat?.kind === 'empty'}>
            <Icon name="desaturation" />
          </span>
          <span class="bc-tools--texts">
            <span class="bc-tools--card-title">{t('tools.desaturation')}</span>
            <span class="bc-tools--card-line">
              {#if desat?.kind === 'waiting'}
                <span class="bc-tools--flight bc-value">{t('tools.flightIn', { time: wait })}</span>
                · {t('tools.diveAgo', { time: ago })}
              {:else if desat?.kind === 'allowed'}
                {t('tools.flightAllowed')} · {t('tools.diveAgo', { time: ago })}
              {:else if desat?.kind === 'rest'}
                {t('tools.atRest')}
              {:else if desat?.kind === 'empty'}
                {t('tools.noDives')}
              {/if}
            </span>
          </span>
          <span class="bc-tools--chevron"><Icon name="chevron" size={20} /></span>
        </span>
        {#if desat?.kind === 'waiting'}
          <span class="bc-tools--track" aria-hidden="true"><span class="bc-tools--fill" style="width: {(desat.share * 100).toFixed(1)}%"></span></span>
        {/if}
      </a>
    </div>

    <h2 class="bc-tools--title">{t('tools.groupGas')}</h2>
    <!-- One card, a row per tool, laid out like the Planificateur card (task 2026-11-14-128). -->
    <div class="bc-tools--gases" role="list">
      {#each gases as tool (tool.href)}
        <div role="listitem">
          <a class="bc-tools--gas" href={tool.href}>
            <span class="bc-tools--gas-icon bc-tools--{tool.shape}"><Icon name={tool.icon} /></span>
            <span class="bc-tools--texts">
              <span class="bc-tools--card-title">{tool.name}</span>
              <span class="bc-tools--card-line">{tool.text}</span>
            </span>
            <span class="bc-tools--chevron"><Icon name="chevron" size={20} /></span>
          </a>
        </div>
      {/each}
    </div>
  </div>
  <div class="bc-tools--bottom"></div>
</Page>

<style>
  @layer od.components {
    .bc-tools--content {
      container-type: inline-size;
    }

    /* The two dive tools: one under the other on a phone, side by side when there is room. */
    .bc-tools--dive {
      margin: 12px 16px 0;
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }

    @container (min-width: 600px) {
      .bc-tools--dive {
        grid-template-columns: 1fr 1fr;
      }
    }

    .bc-tools--card {
      display: block;
      padding: 16px;
      border-radius: 28px;
      background: var(--bc-surface);
      color: var(--bc-text);
      text-decoration: none;
    }

    .bc-tools--card-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .bc-tools--card-icon {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-tools--plan-icon {
      background: var(--bc-secondary-container);
      color: var(--bc-secondary);
    }

    .bc-tools--desat-icon {
      background: var(--bc-tertiary-container);
      color: var(--bc-tertiary);

      &.bc-tools--idle {
        background: var(--bc-idle-container);
        color: var(--bc-text-2);
      }
    }

    .bc-tools--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-tools--card-title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .bc-tools--card-line {
      min-height: 20px;
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    .bc-tools--flight {
      color: var(--bc-tertiary);
      font-weight: 600;
    }

    .bc-tools--chevron {
      flex: none;
      display: flex;
      color: var(--bc-text-2);
    }

    /* The wait before flying: the share of it already behind, under the text (52 dp in). */
    .bc-tools--track {
      display: block;
      margin: 12px 0 0 52px;
      height: 4px;
      border-radius: 2px;
      background: var(--bc-flight-track);
      overflow: hidden;
    }

    .bc-tools--fill {
      display: block;
      height: 100%;
      border-radius: 2px;
      background: var(--bc-tertiary);
    }

    .bc-tools--title {
      margin: 20px 16px 8px 20px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
      color: var(--bc-text);
    }

    .bc-tools--gases {
      margin: 0 16px;
      border-radius: 28px;
      background: var(--bc-surface);
      overflow: hidden;

      [role='listitem'] + [role='listitem'] .bc-tools--gas::before {
        content: '';
        position: absolute;
        top: 0;
        left: 68px;
        right: 0;
        height: 1px;
        background: var(--bc-row-divider);
      }
    }

    .bc-tools--gas {
      position: relative;
      box-sizing: border-box;
      min-height: 72px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--bc-text);
      text-decoration: none;
    }

    /* Each tool keeps its shape, in the Material 3 Expressive spirit: rounded square, circle, leaf. */
    .bc-tools--gas-icon {
      flex: none;
      width: 40px;
      height: 40px;
      background: var(--bc-secondary-container);
      color: var(--bc-secondary);
      display: flex;
      align-items: center;
      justify-content: center;

      &.bc-tools--square {
        border-radius: 14px;
      }

      &.bc-tools--circle {
        border-radius: 20px;
      }

      &.bc-tools--leaf {
        border-radius: 10px 20px 10px 20px;
      }
    }

    .bc-tools--bottom {
      height: 24px;
    }
  }
</style>
