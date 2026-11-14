<script>
  // @ts-check
  // Tools section (task 2026-11-14-122; docs/ui-specification.md, section 1, "Tools page and
  // gas tools"; docs/mockups/android-outils.dc.html, android-tablette-outils-*.dc.html). The two
  // dive tools are cards that say their state: the planned dives of the logbook, and the wait
  // before flying with the time since the last dive. The three gas tools are tiles in one row.
  // On a tablet the page takes the width (no list pane): the two cards side by side, and a
  // tool opens over the page, as on a phone.
  import { Page, Navbar, NavRight, theme } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import MenuButton from '../components/MenuButton.svelte';
  import AccountAvatar from '../components/AccountAvatar.svelte';
  import SectionBand from '../components/SectionBand.svelte';
  import BandBackdrop from '../components/BandBackdrop.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
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
        plans = (await OpenDivesCore.listPlans()).length;
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
    if (logbook.loading || navigation.section !== 'tools' || !navigation.atRoot) return;
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

<Page class="od-tools" onPageBeforeIn={readPlans}>
  <Navbar class="od-band-bar{theme.ios ? '' : ' od-band-titled'}" title={t('tools.title')}>
    {#snippet left()}<MenuButton />{/snippet}
    <NavRight><AccountAvatar /></NavRight>
  </Navbar>

  {#if !theme.ios}<BandBackdrop short />{/if}
  <SectionBand bare={!theme.ios} summary={t('band.tools')} />

  <div class="od-tools--content">
    <div class="od-tools--dive">
      <a class="od-tools--card" href="/plans/">
        <span class="od-tools--card-row">
          <span class="od-tools--card-icon od-tools--plan-icon"><Icon name="plan" /></span>
          <span class="od-tools--texts">
            <span class="od-tools--card-title">{t('tools.planner')}</span>
            <span class="od-tools--card-line">{plansText}</span>
          </span>
          <span class="od-tools--chevron"><Icon name="chevron" size={24} weight={2} /></span>
        </span>
      </a>

      <a class="od-tools--card" href="/tools/desaturation" aria-label={desatLabel}>
        <span class="od-tools--card-row">
          <span class="od-tools--card-icon od-tools--desat-icon" class:od-tools--idle={desat?.kind === 'rest' || desat?.kind === 'empty'}>
            <Icon name="desaturation" />
          </span>
          <span class="od-tools--texts">
            <span class="od-tools--card-title">{t('tools.desaturation')}</span>
            <span class="od-tools--card-line">
              {#if desat?.kind === 'waiting'}
                <span class="od-tools--flight od-value">{t('tools.flightIn', { time: wait })}</span>
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
          <span class="od-tools--chevron"><Icon name="chevron" size={24} weight={2} /></span>
        </span>
        {#if desat?.kind === 'waiting'}
          <span class="od-tools--track" aria-hidden="true"><span class="od-tools--fill" style="width: {(desat.share * 100).toFixed(1)}%"></span></span>
        {/if}
      </a>
    </div>

    <h2 class="od-tools--title">{t('tools.groupGas')}</h2>
    <div class="od-tools--tiles" role="list">
      {#each gases as tool (tool.href)}
        <div role="listitem">
          <a class="od-tools--tile" href={tool.href}>
            <span class="od-tools--tile-icon od-tools--{tool.shape}"><Icon name={tool.icon} /></span>
            <span class="od-tools--tile-name">{tool.name}</span>
            <span class="od-tools--tile-text">{tool.text}</span>
          </a>
        </div>
      {/each}
    </div>
  </div>
  <div class="od-tools--bottom"></div>
</Page>

<style>
  @layer od.components {
    .od-tools--content {
      container-type: inline-size;
    }

    /* The two dive tools: one under the other on a phone, side by side when there is room. */
    .od-tools--dive {
      margin: 12px 16px 0;
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }

    @container (min-width: 600px) {
      .od-tools--dive {
        grid-template-columns: 1fr 1fr;
      }

      .od-tools--tile {
        min-height: 140px;
      }
    }

    .od-tools--card {
      display: block;
      padding: 16px;
      border-radius: 28px;
      background: var(--od-surface);
      color: var(--od-text);
      text-decoration: none;
    }

    .od-tools--card-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .od-tools--card-icon {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .od-tools--plan-icon {
      background: var(--od-secondary-container);
      color: var(--od-secondary);
    }

    .od-tools--desat-icon {
      background: var(--od-tertiary-container);
      color: var(--od-tertiary);

      &.od-tools--idle {
        background: var(--od-idle-container);
        color: var(--od-text-2);
      }
    }

    .od-tools--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-tools--card-title {
      font-size: 16px;
      line-height: 24px;
      font-weight: 600;
    }

    .od-tools--card-line {
      min-height: 20px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-tools--flight {
      color: var(--od-tertiary);
      font-weight: 600;
    }

    .od-tools--chevron {
      flex: none;
      display: flex;
      color: var(--od-text-2);
    }

    /* The wait before flying: the share of it already behind, under the text (52 dp in). */
    .od-tools--track {
      display: block;
      margin: 12px 0 0 52px;
      height: 4px;
      border-radius: 2px;
      background: var(--od-flight-track);
      overflow: hidden;
    }

    .od-tools--fill {
      display: block;
      height: 100%;
      border-radius: 2px;
      background: var(--od-tertiary);
    }

    .od-tools--title {
      margin: 20px 16px 8px 20px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
      color: var(--od-text);
    }

    .od-tools--tiles {
      margin: 0 16px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .od-tools--tile {
      box-sizing: border-box;
      height: 100%;
      min-height: 132px;
      padding: 14px 12px;
      border-radius: 24px;
      background: var(--od-surface);
      color: var(--od-text);
      text-decoration: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Three shapes, in the Material 3 Expressive spirit: rounded square, circle, leaf. */
    .od-tools--tile-icon {
      flex: none;
      width: 44px;
      height: 44px;
      background: var(--od-secondary-container);
      color: var(--od-secondary);
      display: flex;
      align-items: center;
      justify-content: center;

      &.od-tools--square {
        border-radius: 16px;
      }

      &.od-tools--circle {
        border-radius: 22px;
      }

      &.od-tools--leaf {
        border-radius: 12px 24px 12px 24px;
      }
    }

    .od-tools--tile-name {
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
    }

    .od-tools--tile-text {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-tools--bottom {
      height: 24px;
    }
  }
</style>
