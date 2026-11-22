<script>
  // @ts-check
  // « Compléter la plongée » (task 2026-11-14-151): the quick entry on the boat, opened after a
  // download for each new dive that has no site. The site (the 3 nearest, or the 3 most recently dived
  // without a position; the nearest one preselected within 500 m), the buddies, the rating. Android:
  // docs/mockups/saisie-bateau-android.dc.html (Material 3: ✕, title, filled « Enregistrer »);
  // iPhone: docs/mockups/ios-saisie.dc.html (« Plus tard », « Compléter », « Enregistrer »; a blue
  // check on the chosen row). « Chercher un autre site » opens « Choisir un site ». Save is one
  // undoable edit of the dive (lib/logbook.svelte.js saveDiveChanges); the next new dive follows.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import ChipsField from '../components/ChipsField.svelte';
  import StarsInput from '../components/StarsInput.svelte';
  import ProfileThumbnail from '../components/ProfileThumbnail.svelte';
  import { cachedSites } from '../lib/core-cache.js';
  import { endQuickEntry } from '../lib/download.js';
  import { quickEntryUrl } from '../lib/quick-entry.js';
  import { formatDepth, formatDateTime, formatMinutes, formatNumber, formatDate } from '../lib/format.js';
  import { ios } from '../lib/layout.svelte.js';
  import { logbookValues } from '../lib/people.js';
  import { logbook, saveDiveChanges } from '../lib/logbook.svelte.js';
  import { t } from '../lib/i18n.js';
  import { offerUndo } from '../lib/undo.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { chooseSite, createSiteHere, currentPosition } from '../lib/site-choice.js';
  import { distanceParts, sitesInChoiceOrder } from '../lib/site-distance.js';
  import { SITE_SUGGESTION_LIMIT_M } from '../lib/site-suggestion.js';

  /** How many sites the block lists. */
  const SHOWN = 3;

  /** @type {{ f7route: { params: { id: string }, query: { next?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  const id = Number(f7route.params.id);
  /** The dives still to complete after this one. */
  const next = (f7route.query?.next ?? '').split(',').map(Number).filter(Boolean);

  const dive = $derived(logbook.dives.find((d) => d.id === id));
  const unit = $derived(/** @type {'m'|'ft'} */ (logbook.prefs.length === 'ft' ? 'ft' : 'm'));

  /** @type {import('benthic-core').SiteSummary[]} */
  let sites = $state([]);
  let position = $state(/** @type {{ latUdeg: number, lonUdeg: number }|null} */ (null));
  let positionKnown = $state(false);
  /** The site chosen (uuid; 0: none), and a site picked elsewhere than in the three rows. */
  let chosen = $state(0);
  let touched = false;
  let picked = $state(/** @type {import('benthic-core').SiteSummary|{ uuid: number, name: string }|null} */ (null));
  let buddies = $state(/** @type {string[]} */ ([]));
  let known = $state(/** @type {string[]} */ ([]));
  let rating = $state(0);
  let saving = $state(false);
  let creating = $state(false);

  const ordered = $derived(sitesInChoiceOrder(sites.filter((s) => s.name), position));
  /** The nearest site, preselected within the limit. */
  const nearestId = $derived.by(() => {
    const first = ordered[0];
    return position && first && first.metres !== null && first.metres <= SITE_SUGGESTION_LIMIT_M ? first.site.uuid : 0;
  });
  /** The rows: the site picked elsewhere first, then the nearest ones. */
  const rows = $derived.by(() => {
    const list = ordered.slice(0, SHOWN);
    if (picked && !list.some((r) => r.site.uuid === picked?.uuid)) {
      const full = ordered.find((r) => r.site.uuid === picked?.uuid);
      return [full ?? { site: /** @type {any} */ ({ ...picked, dives: 0, lastDate: '' }), metres: null }, ...list.slice(0, SHOWN - 1)];
    }
    return list;
  });

  cachedSites().then(
    (/** @type {import('benthic-core').SiteSummary[]} */ list) => (sites = list),
    (/** @type {unknown} */ e) => console.error('Sites', e),
  );
  currentPosition().then((p) => {
    position = p;
    positionKnown = true;
  });
  logbookValues('buddy').then((v) => (known = v));
  // The nearest site is the answer unless the diver already chose.
  $effect(() => {
    if (!touched && nearestId) chosen = nearestId;
  });

  /** « À 394 pi ». @param {number} metres */
  function distanceText(metres) {
    const d = distanceParts(metres, unit);
    const names = { m: t('units.meters'), ft: t('units.feet'), km: t('units.kilometers'), mi: t('units.miles') };
    return t('sites.chooseAway', { distance: `${formatNumber(d.value, d.decimals)} ${names[d.unit]}` });
  }

  /** « À 394 pi · dernière plongée le … », « À 1,1 mi · aucune plongée »; without a position, the last dive only. @param {{ site: import('benthic-core').SiteSummary, metres: number|null }} row */
  function line(row) {
    const last = row.site.dives && row.site.lastDate ? t('quickEntry.lastDive', { date: formatDate(row.site.lastDate) }) : t('quickEntry.noDive');
    const away = row.metres === null ? '' : distanceText(row.metres);
    return [away.charAt(0).toLocaleUpperCase() + away.slice(1), last].filter(Boolean).join(' · ');
  }

  /** @param {number} uuid */
  function choose(uuid) {
    touched = true;
    chosen = chosen === uuid ? 0 : uuid;
  }

  /** @param {{ uuid: number, name: string }} site */
  function picks(site) {
    touched = true;
    picked = site;
    chosen = site.uuid;
  }

  async function createHere() {
    creating = true;
    const here = position ?? (await currentPosition());
    creating = false;
    createSiteHere(f7router, picks, here);
  }

  /** The next new dive, else a message: this save's (with its Undo), or the download's when nothing was saved. @param {boolean} saved */
  function afterThis(saved) {
    if (next.length) return f7router.navigate(quickEntryUrl(next), { reloadCurrent: true });
    f7router.back();
    if (saved) {
      endQuickEntry(false);
      offerUndo(t('edit.saved'), undefined, 6000, 1);
    } else endQuickEntry();
  }

  async function save() {
    if (saving) return;
    saving = true;
    /** @type {Record<string, unknown>} */
    const changes = {};
    let saved = false;
    if (chosen) changes.site = chosen;
    if (buddies.length) changes.buddies = [...buddies];
    if (rating) changes.rating = rating;
    try {
      if (Object.keys(changes).length) {
        await saveDiveChanges(id, changes);
        logbook.sitesVersion++;
        saved = true;
      }
      afterThis(saved);
    } catch (e) {
      const code = String(/** @type {any} */ (e)?.message ?? '');
      console.error('Quick entry', code, JSON.stringify(changes));
      showSnackbar(code.startsWith('WRITE_LOCKED') ? t('edit.writeLocked') : t('edit.failed'));
    } finally {
      saving = false;
    }
  }
  /** « Plus tard »: nothing changes; the following new dives are left too. */
  function later() {
    f7router.back();
    endQuickEntry();
  }

  onMount(() => {
    if (!dive && !logbook.dives.length) f7router.back();
  });
</script>

<Page class="bc-quick-entry">
  {#if ios}
    <Navbar title={t('quickEntry.titleShort')}>
      {#snippet left()}
        <Link onClick={later}>{t('quickEntry.later')}</Link>
      {/snippet}
      {#snippet right()}
        <Link onClick={save} class={saving ? 'disabled' : ''}>{t('edit.save')}</Link>
      {/snippet}
    </Navbar>
  {:else}
    <div class="bc-quick-entry--bar">
      <button type="button" class="bc-quick-entry--close" aria-label={t('quickEntry.later')} onclick={later}><Icon name="close" /></button>
      <h1>{t('quickEntry.title')}</h1>
      <button type="button" class="bc-quick-entry--save" disabled={saving} onclick={save}>{t('edit.save')}</button>
    </div>
  {/if}

<div class="bc-quick-entry--content" class:bc-quick-entry--ios={ios}>
  {#if dive}
    <div class="bc-quick-entry--dive">
      <ProfileThumbnail profile={dive.profile} maxDepthMm={dive.maxDepthMm} prefs={logbook.prefs} />
      <span class="bc-quick-entry--dive-texts">
        <span class="bc-quick-entry--dive-title">{t('quickEntry.diveOf', { date: formatDateTime(dive.date) })}</span>
        <span class="bc-quick-entry--dive-line bc-value">{t('quickEntry.diveLine', { depth: formatDepth(dive.maxDepthMm, logbook.prefs), duration: formatMinutes(dive.durationSeconds) })}</span>
      </span>
    </div>
  {/if}

  <h2 class="bc-quick-entry--title">{t('quickEntry.site')}</h2>
  <div class="bc-quick-entry--block" role="group" aria-label={t('quickEntry.chooseSite')}>
    <button type="button" class="bc-quick-entry--action" disabled={creating} onclick={createHere}>
      <Icon name="locate" size={22} />
      <span>{t('sites.createHere')}</span>
    </button>
    <ul class="bc-quick-entry--list" role="listbox" aria-label={t('quickEntry.chooseSite')}>
      {#each rows as row (row.site.uuid)}
        <li role="presentation">
          <button type="button" role="option" aria-selected={chosen === row.site.uuid} class="bc-quick-entry--row" class:bc-quick-entry--selected={chosen === row.site.uuid} onclick={() => choose(row.site.uuid)}>
            <span class="bc-quick-entry--texts">
              <span class="bc-quick-entry--name">{row.site.name}{#if row.site.uuid === nearestId}<span class="bc-quick-entry--nearest">&nbsp;· {t('quickEntry.nearest')}</span>{/if}</span>
              <span class="bc-quick-entry--line bc-value">{line(row)}</span>
            </span>
            {#if chosen === row.site.uuid}<Icon name="check" size={22} />{/if}
          </button>
        </li>
      {/each}
    </ul>
    <button type="button" class="bc-quick-entry--action bc-quick-entry--search" onclick={() => chooseSite(f7router, picks)}>{t('quickEntry.searchOther')}</button>
  </div>
  <p class="bc-quick-entry--note">{t('quickEntry.siteNote')}</p>

  <h2 class="bc-quick-entry--title">{t('edit.buddies')}</h2>
  <div class="bc-quick-entry--block bc-quick-entry--field">
    <ChipsField label={t('quickEntry.addBuddy')} bind:values={buddies} suggestions={known} />
  </div>
  <p class="bc-quick-entry--note">{t('quickEntry.buddiesNote')}</p>

  <h2 class="bc-quick-entry--title">{t('edit.rating')}</h2>
  <div class="bc-quick-entry--block bc-quick-entry--rating">
    <StarsInput value={rating} label={t('quickEntry.ratingLabel')} onchange={(v) => (rating = v)} />
  </div>
</div>
</Page>

<style>
  @layer od.components {
    .bc-quick-entry--bar {
      height: 64px;
      padding: calc(var(--f7-safe-area-top) + 0px) 4px 0 4px;
      box-sizing: content-box;
      display: flex;
      align-items: center;

      h1 {
        flex: 1;
        min-width: 0;
        margin: 0 0 0 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 22px;
        font-weight: 500;
      }
    }

    .bc-quick-entry--close {
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 24px;
      background: none;
      color: var(--bc-text);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bc-quick-entry--save {
      flex: none;
      width: auto;
      height: 40px;
      margin-right: 8px;
      padding: 0 16px;
      border: none;
      border-radius: 20px;
      background: var(--bc-primary);
      color: var(--bc-on-primary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    .bc-quick-entry--dive {
      margin: 4px 16px 0;
      padding: 12px 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .bc-quick-entry--dive-texts {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-quick-entry--dive-title {
      font-size: 16px;
      font-weight: 600;
    }

    .bc-quick-entry--dive-line {
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-quick-entry--title {
      margin: 20px 16px 6px 24px;
      font-size: 14px;
      font-weight: 500;
      color: var(--bc-secondary);
    }

    .bc-quick-entry--block {
      margin: 0 16px;
      border-radius: 16px;
      background: var(--bc-surface);
      overflow: hidden;
    }

    .bc-quick-entry--list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .bc-quick-entry--action,
    .bc-quick-entry--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 8px 16px;
      border: none;
      background: none;
      color: var(--bc-text);
      font: inherit;
      font-size: 16px;
      text-align: start;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .bc-quick-entry--action {
      font-weight: 500;

      :global(.bc-icon) {
        color: var(--bc-secondary);
      }
    }

    .bc-quick-entry--search {
      border-top: 1px solid var(--bc-row-divider);
    }

    .bc-quick-entry--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bc-quick-entry--name {
      font-size: 16px;
      line-height: 22px;
    }

    .bc-quick-entry--nearest {
      font-size: 14px;
      font-weight: 600;
      color: var(--bc-secondary);
    }

    .bc-quick-entry--line {
      font-size: 14px;
      line-height: 20px;
      color: var(--bc-text-2);
    }

    /* Android: the chosen row is filled with the secondary container, its name in 600, a check on the right. */
    .bc-quick-entry--selected {
      background: var(--bc-secondary-container);
      color: var(--bc-on-secondary-container);

      .bc-quick-entry--name {
        font-weight: 600;
      }

      :global(.bc-icon) {
        color: var(--bc-secondary);
      }
    }

    .bc-quick-entry--note {
      margin: 6px 24px 0;
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-quick-entry--field {
      padding: 4px 16px 8px;
    }

    .bc-quick-entry--rating {
      padding: 4px 8px;
      display: flex;
      justify-content: center;
    }

    /* iPhone: grouped lists, 10 pt corners, small grey titles, a check and no fill on the chosen row. */
    .bc-quick-entry--ios {
      .bc-quick-entry--block,
      .bc-quick-entry--dive {
        border-radius: 10px;
      }

      .bc-quick-entry--title {
        margin-inline-start: 32px;
        font-weight: 400;
        color: var(--bc-text-2);
      }

      .bc-quick-entry--note {
        margin-inline: 32px;
      }

      .bc-quick-entry--selected {
        background: none;
        color: var(--bc-text);

        :global(.bc-icon) {
          color: var(--bc-secondary);
        }
      }

      .bc-quick-entry--list li + li {
        border-top: 0.5px solid var(--bc-row-divider);
      }
    }

  }
</style>
