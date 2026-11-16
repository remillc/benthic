<script>
  // @ts-check
  // The desktop Outils section (task 2026-11-15-196, mock-ups bureau-outils*): from 1200 dp wide,
  // the tools list on the left (320 dp, two headings, a live line under each tool) and the
  // chosen tool on the right. The calculations are the phone's; only the layout is new. Below
  // 1200 dp the tablet's Tools.svelte shows instead (App.svelte).
  import { Page } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import DesktopPlanner from '../components/DesktopPlanner.svelte';
  import DesktopDesaturation from '../components/DesktopDesaturation.svelte';
  import DesktopEadMod from '../components/DesktopEadMod.svelte';
  import DesktopBestMix from '../components/DesktopBestMix.svelte';
  import DesktopBlender from '../components/DesktopBlender.svelte';
  import { t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { desaturationState } from '../lib/tools-page.js';
  import { formatHoursMinutes } from '../lib/tools.js';
  import { formatDuration, localNowIso } from '../lib/format.js';
  import { DESKTOP_TOOLS, desaturationLine, plansLine } from '../lib/desktop-tools.js';
  import { desktopTools, openTool } from '../lib/desktop-tools.svelte.js';

  // The time moves: read the clock again every 30 seconds, and when the window comes back.
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
  /** « 55 min », « 6 h 10 »: as the wait before flying is written. @param {number} seconds */
  const spell = (seconds) => (seconds < 3600 ? formatDuration(seconds, 'minutes') : formatHoursMinutes(seconds));

  /** The planned dives of the logbook; null until read. */
  let plans = $state(/** @type {number|null} */ (null));
  let reading = false;
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
  // Read again when the logbook changes (a download, a sync, a saved plan).
  $effect(() => {
    void logbook.dives;
    if (logbook.loading || navigation.section !== 'tools') return;
    readPlans();
  });

  /** The live line of a tool, written. @param {string} id */
  function liveLine(id) {
    const line = id === 'planner' ? plansLine(plans) : id === 'desaturation' ? desaturationLine(desat, desat?.kind === 'waiting' ? spell(desat.remainingSeconds) : '') : null;
    return line ? t(line.key, line.params) : '';
  }
  /** @param {string|undefined} textKey @param {string} id */
  const lineOf = (id, textKey) => (textKey ? t(textKey) : liveLine(id));

  const groups = /** @type {const} */ ([
    { id: 'dive', heading: 'desktopTools.groupDive' },
    { id: 'gas', heading: 'tools.groupGas' },
  ]);

  /** @param {KeyboardEvent} e */
  function listKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const at = DESKTOP_TOOLS.findIndex((tool) => tool.id === desktopTools.tool);
    const next = DESKTOP_TOOLS[(at + (e.key === 'ArrowDown' ? 1 : -1) + DESKTOP_TOOLS.length) % DESKTOP_TOOLS.length];
    e.preventDefault();
    openTool(next.id);
    queueMicrotask(() => /** @type {HTMLElement|null} */ (document.querySelector(`.od-desktop-tools--row[data-tool="${next.id}"]`))?.focus());
  }
  const current = $derived(DESKTOP_TOOLS.find((tool) => tool.id === desktopTools.tool) ?? DESKTOP_TOOLS[0]);
</script>

<Page class="od-desktop-tools" pageContent={false}>
  <div class="od-desktop-tools--frame">
    <header class="od-desktop-tools--bar">
      <h1 class="od-desktop-tools--title">{t('tools.title')}</h1>
      <p class="od-desktop-tools--summary">{t('band.tools')}</p>
    </header>

    <div class="od-desktop-tools--columns">
      <nav class="od-desktop-tools--list" data-od-scroll aria-label={t('tools.title')}>
        {#each groups as group (group.id)}
          <h2 class="od-desktop-tools--heading">{t(group.heading)}</h2>
          <ul role="list" onkeydown={listKey}>
            {#each DESKTOP_TOOLS.filter((tool) => tool.group === group.id) as tool (tool.id)}
              <li>
                <button
                  type="button"
                  class="od-desktop-tools--row"
                  class:od-desktop-tools--selected={desktopTools.tool === tool.id}
                  data-tool={tool.id}
                  aria-current={desktopTools.tool === tool.id ? 'page' : undefined}
                  onclick={() => openTool(tool.id)}
                >
                  <span class="od-desktop-tools--tile"><Icon name={tool.icon} size={22} /></span>
                  <span class="od-desktop-tools--texts">
                    <span class="od-desktop-tools--name">{t(tool.name)}</span>
                    <span class="od-desktop-tools--line od-value">{lineOf(tool.id, tool.text)}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/each}
      </nav>

      <main class="od-desktop-tools--pane" data-od-scroll aria-label={t(current.name)}>
        {#if current.id === 'planner'}
          <DesktopPlanner />
        {:else}
          <h2 class="od-desktop-tools--pane-title">{t(current.name)}</h2>
          {#if current.id === 'desaturation'}
            <DesktopDesaturation />
          {:else if current.id === 'eadMod'}
            <DesktopEadMod />
          {:else if current.id === 'bestMix'}
            <DesktopBestMix />
          {:else}
            <DesktopBlender />
          {/if}
        {/if}
      </main>
    </div>
  </div>
</Page>

<style>
  @layer od.components {
    .od-desktop-tools--frame {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--od-background);
    }
    .od-desktop-tools--bar {
      display: flex;
      align-items: baseline;
      gap: 16px;
      padding: 16px 24px 12px;
    }
    .od-desktop-tools--title {
      margin: 0;
      font-family: var(--od-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--od-text);
    }
    .od-desktop-tools--summary {
      margin: 0;
      font-size: 14px;
      color: var(--od-text-2);
    }
    .od-desktop-tools--columns {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .od-desktop-tools--list {
      flex: none;
      /* Fluid layout: 320 dp from 1280 dp of window, narrower below. */
      width: clamp(260px, 25vw, 320px);
      padding: 8px 8px 24px 12px;
      border-right: 1px solid var(--od-separator);
      overflow-y: auto;
    }
    .od-desktop-tools--list ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .od-desktop-tools--heading {
      margin: 12px 0 4px;
      padding: 0 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--od-text-2);
    }
    .od-desktop-tools--row {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      height: 64px;
      padding: 0 12px;
      border: 0;
      border-radius: 12px;
      background: none;
      font: inherit;
      text-align: left;
      color: var(--od-text);
      cursor: pointer;
    }
    .od-desktop-tools--row:hover {
      background: color-mix(in srgb, var(--od-text) 6%, transparent);
    }
    .od-desktop-tools--row:focus-visible {
      outline: 2px solid var(--od-text);
      outline-offset: -2px;
    }
    .od-desktop-tools--selected,
    .od-desktop-tools--selected:hover {
      background: var(--od-desktop-selected);
      color: var(--od-desktop-selected-ink);
    }
    .od-desktop-tools--tile {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--od-desktop-field);
      color: var(--od-text);
    }
    .od-desktop-tools--selected .od-desktop-tools--tile {
      background: var(--od-surface);
      color: var(--od-desktop-selected-ink);
    }
    .od-desktop-tools--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .od-desktop-tools--name {
      font-size: 16px;
      line-height: 1.25;
    }
    .od-desktop-tools--selected .od-desktop-tools--name {
      font-weight: 500;
    }
    .od-desktop-tools--line {
      font-size: 14px;
      line-height: 1.25;
      color: var(--od-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .od-desktop-tools--selected .od-desktop-tools--line {
      color: var(--od-desktop-selected-ink);
    }
    .od-desktop-tools--pane {
      flex: 1;
      min-width: 0;
      padding: 8px 32px 32px;
      overflow-y: auto;
      /* The tools lay out by the pane's width, not the window's (@container od-tool). */
      container: od-tool / inline-size;
    }
    .od-desktop-tools--pane-title {
      margin: 0 0 20px;
      font-family: var(--od-title-font);
      font-size: 24px;
      font-weight: 500;
      color: var(--od-text);
    }


    /* A short window: the bar, the rows and the pane's margins take less room, so that more of the tool shows. */
    @media (max-height: 700px) {
      .od-desktop-tools--bar {
        padding-top: 8px;
        padding-bottom: 4px;
      }
      .od-desktop-tools--row {
        height: 56px;
      }
      .od-desktop-tools--heading {
        margin-top: 8px;
      }
      .od-desktop-tools--pane {
        padding-top: 4px;
        padding-bottom: 16px;
      }
      .od-desktop-tools--pane-title {
        margin-bottom: 12px;
        font-size: 20px;
      }
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .od-desktop-tools--row {
        transition: box-shadow 120ms linear;
      }
      .od-desktop-tools--row:hover {
        box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
      }
    }
  }
</style>
