<script>
  // @ts-check
  // The desktop Outils section (task 2026-11-15-196, mock-ups bureau-outils*): from 1200 dp wide,
  // the tools list on the left (320 dp, two headings, a live line under each tool) and the
  // chosen tool on the right. The calculations are the phone's; only the layout is new. Below
  // 1200 dp the tablet's Tools.svelte shows instead (App.svelte).
  import { Page } from 'framework7-svelte';
  import { OpenDivesCore } from 'opendives-core';
  import Icon from '../components/Icon.svelte';
  import DesktopEadMod from '../components/DesktopEadMod.svelte';
  import DesktopBestMix from '../components/DesktopBestMix.svelte';
  import { t } from '../lib/i18n.js';
  import { logbook } from '../lib/logbook.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
  import { navigation } from '../lib/navigation.svelte.js';
  import { startup } from '../lib/startup.svelte.js';
  import { desaturationState } from '../lib/tools-page.js';
  import { formatHoursMinutes } from '../lib/tools.js';
  import { formatDuration, localNowIso } from '../lib/format.js';
  import { DESKTOP_TOOLS, desaturationLine, plansLine } from '../lib/desktop-tools.js';
  import { desktopTools, openTool } from '../lib/desktop-tools.svelte.js';

  // The tools that are their own chunks, read when first shown. Not `{#await import(...)}`: an await block left
  // in a layout that the adaptive swap removes kept that layout (and the other sections' DOM) alive in Svelte's batch.
  const chunks = {
    planner: () => import('../components/DesktopPlanner.svelte'),
    desaturation: () => import('../components/DesktopDesaturation.svelte'),
    blender: () => import('../components/DesktopBlender.svelte'),
  };
  /** @type {Record<string, any>} */
  let loaded = $state.raw({});
  /** @param {string} id */
  function load(id) {
    const read = /** @type {Record<string, (() => Promise<{ default: any }>) | undefined>} */ (chunks)[id];
    if (read && !loaded[id]) read().then((m) => (loaded = { ...loaded, [id]: m.default }));
  }

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
    if (logbook.loading || !startup.ready || navigation.section !== 'tools') return;
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
    queueMicrotask(() => /** @type {HTMLElement|null} */ (document.querySelector(`.bc-desktop-tools--row[data-tool="${next.id}"]`))?.focus());
  }
  const current = $derived(DESKTOP_TOOLS.find((tool) => tool.id === desktopTools.tool) ?? DESKTOP_TOOLS[0]);
  // The planner starts its calls when it mounts: not before the first screen is up (lib/startup.svelte.js).
  $effect(() => {
    if (startup.ready) load(current.id);
  });
</script>

<Page class="bc-desktop-tools" pageContent={false}>
  <div class="bc-desktop-tools--frame">
    <header class="bc-desktop-tools--bar">
      <h1 class="bc-desktop-tools--title">{t('tools.title')}</h1>
      <p class="bc-desktop-tools--summary">{t('band.tools')}</p>
    </header>

    <div class="bc-desktop-tools--columns">
      <nav class="bc-desktop-tools--list" data-od-scroll aria-label={t('tools.title')}>
        {#each groups as group (group.id)}
          <h2 class="bc-desktop-tools--heading">{t(group.heading)}</h2>
          <ul role="list" onkeydown={listKey}>
            {#each DESKTOP_TOOLS.filter((tool) => tool.group === group.id) as tool (tool.id)}
              <li>
                <button
                  type="button"
                  class="bc-desktop-tools--row"
                  class:bc-desktop-tools--selected={desktopTools.tool === tool.id}
                  data-tool={tool.id}
                  aria-current={desktopTools.tool === tool.id ? 'page' : undefined}
                  onclick={() => openTool(tool.id)}
                >
                  <span class="bc-desktop-tools--tile"><Icon name={tool.icon} size={22} /></span>
                  <span class="bc-desktop-tools--texts">
                    <span class="bc-desktop-tools--name">{t(tool.name)}</span>
                    <span class="bc-desktop-tools--line bc-value">{lineOf(tool.id, tool.text)}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/each}
      </nav>

      <main class="bc-desktop-tools--pane" data-od-scroll aria-label={t(current.name)}>
        {#if current.id === 'planner'}
          <!-- The tools are their own chunks, read when first shown. -->
          {#if loaded.planner}{@const Planner = loaded.planner}<Planner />{/if}
        {:else}
          <h2 class="bc-desktop-tools--pane-title">{t(current.name)}</h2>
          {#if current.id === 'desaturation'}
            {#if loaded.desaturation}{@const Desaturation = loaded.desaturation}<Desaturation />{/if}
          {:else if current.id === 'eadMod'}
            <DesktopEadMod />
          {:else if current.id === 'bestMix'}
            <DesktopBestMix />
          {:else}
            {#if loaded.blender}{@const Blender = loaded.blender}<Blender />{/if}
          {/if}
        {/if}
      </main>
    </div>
  </div>
</Page>

<style>
  @layer od.components {
    .bc-desktop-tools--frame {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bc-background);
    }
    .bc-desktop-tools--bar {
      display: flex;
      align-items: baseline;
      gap: 16px;
      padding: 16px 24px 12px;
    }
    .bc-desktop-tools--title {
      margin: 0;
      font-family: var(--bc-title-font);
      font-size: 22px;
      font-weight: 500;
      color: var(--bc-text);
    }
    .bc-desktop-tools--summary {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }
    .bc-desktop-tools--columns {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .bc-desktop-tools--list {
      flex: none;
      /* Fluid layout: 320 dp from 1280 dp of window, narrower below. */
      width: clamp(260px, 25vw, 320px);
      padding: 8px 8px 24px 12px;
      border-right: 1px solid var(--bc-separator);
      overflow-y: auto;
      & ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }
    }
    .bc-desktop-tools--heading {
      margin: 12px 0 4px;
      padding: 0 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--bc-text-2);
    }
    .bc-desktop-tools--row {
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
      color: var(--bc-text);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 6%, transparent);
      }
      &:focus-visible {
        outline: 2px solid var(--bc-text);
        outline-offset: -2px;
      }
    }
    .bc-desktop-tools--selected,
    .bc-desktop-tools--selected:hover {
      background: var(--bc-desktop-selected);
      color: var(--bc-desktop-selected-ink);
    }
    .bc-desktop-tools--tile {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: var(--bc-desktop-field);
      color: var(--bc-text);
    }
    .bc-desktop-tools--selected .bc-desktop-tools--tile {
      background: var(--bc-surface);
      color: var(--bc-desktop-selected-ink);
    }
    .bc-desktop-tools--texts {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .bc-desktop-tools--name {
      font-size: 16px;
      line-height: 1.25;
    }
    .bc-desktop-tools--selected .bc-desktop-tools--name {
      font-weight: 500;
    }
    .bc-desktop-tools--line {
      font-size: 14px;
      line-height: 1.25;
      color: var(--bc-text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bc-desktop-tools--selected .bc-desktop-tools--line {
      color: var(--bc-desktop-selected-ink);
    }
    .bc-desktop-tools--pane {
      flex: 1;
      min-width: 0;
      padding: 8px 32px 32px;
      overflow-y: auto;
      /* The tools lay out by the pane's width, not the window's (@container od-tool). */
      container: od-tool / inline-size;
    }
    .bc-desktop-tools--pane-title {
      margin: 0 0 20px;
      font-family: var(--bc-title-font);
      font-size: 24px;
      font-weight: 500;
      color: var(--bc-text);
    }


    /* A short window: the bar, the rows and the pane's margins take less room, so that more of the tool shows. */
    @media (max-height: 700px) {
      .bc-desktop-tools--bar {
        padding-top: 8px;
        padding-bottom: 4px;
      }
      .bc-desktop-tools--row {
        height: 56px;
      }
      .bc-desktop-tools--heading {
        margin-top: 8px;
      }
      .bc-desktop-tools--pane {
        padding-top: 4px;
        padding-bottom: 16px;
      }
      .bc-desktop-tools--pane-title {
        margin-bottom: 12px;
        font-size: 20px;
      }
    }

    /* Mouse: the Material 3 hover layer, 8 % of the content colour over the background. */
    @media (hover: hover) and (pointer: fine) {
      .bc-desktop-tools--row {
        transition: box-shadow 120ms linear;
        &:hover {
          box-shadow: inset 0 0 0 100vmax color-mix(in srgb, currentColor 8%, transparent);
        }
      }
    }
  }
</style>
