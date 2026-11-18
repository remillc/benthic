<script>
  // @ts-check
  // « Entretien » (task 2026-11-18-274, docs/mockups-release/ent-liste-android.dc.html): three figures (en retard,
  // dans 60 jours, à jour), then the sections « En retard », « Bientôt » and « À jour ». A row: the piece's icon,
  // « pièce · tâche », the due date or the dives left, and a coloured tag. A tap opens the maintenance of the piece.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import GearIcon from '../components/GearIcon.svelte';
  import { gear, loadInventory, maintenanceSections } from '../lib/inventory.svelte.js';
  import { taskInline, tagText, lineText } from '../lib/maintenance-text.js';
  import { formatLongDate } from '../lib/format.js';
  import { t } from '../lib/i18n.js';

  onMount(loadInventory);

  const sections = $derived(maintenanceSections());
  const empty = $derived(gear.ready && sections.counts.overdue + sections.counts.soon + sections.counts.ok === 0);
  const figures = $derived(/** @type {const} */ (['overdue', 'soon', 'ok']));

  /** @param {import('../lib/maintenance.js').Evaluation} e */
  const piece = (e) => gear.pieces.find((g) => g.id === e.item.gearId);

  /** @param {string} id */
  const open = (id) => `/profile/gear/${id}/maintenance`;
</script>

<Page class="od-maintenance-page" onPageBeforeIn={loadInventory}>
  <Navbar title={t('maintenance.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('maintenance.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <div class="od-maintenance-page--figures">
    {#each figures as key (key)}
      <span class="od-maintenance-page--figure od-maintenance-page--figure-{key}">
        <span class="od-maintenance-page--value">{sections.counts[key]}</span>
        <span class="od-maintenance-page--legend">{t(`maintenance.figures.${key}`)}</span>
      </span>
    {/each}
  </div>

  {#if empty}
    <div class="od-maintenance-page--empty">
      <h2>{t('maintenance.emptyTitle')}</h2>
      <p>{t('maintenance.emptyText')}</p>
    </div>
  {/if}

  {#each figures as key (key)}
    {#if sections[key].length}
      <h2 class="od-maintenance-page--title">{t(`maintenance.sections.${key}`)}</h2>
      <div class="od-maintenance-page--list">
        {#each sections[key] as e (e.item.id)}
          {@const p = piece(e)}
          {#if p}
            <a href={open(p.id)} class="od-maintenance-page--row">
              <span class="od-maintenance-page--tile"><GearIcon type={p.type} name={p.name} size={22} /></span>
              <span class="od-maintenance-page--texts">
                <span class="od-maintenance-page--name">{p.name} · {taskInline(e.item)}</span>
                <span class="od-maintenance-page--line">{lineText(e, formatLongDate)}</span>
              </span>
              <span class="od-maintenance-page--tag od-maintenance-page--tag-{key}">{tagText(e)}</span>
            </a>
          {/if}
        {/each}
      </div>
    {/if}
  {/each}

  <p class="od-maintenance-page--note"><Icon name="info" size={18} /><span>{t('maintenance.listNote')}</span></p>
  <div class="od-maintenance-page--bottom"></div>
</Page>

<style>
  @layer od.components {
    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.od-maintenance-page .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-maintenance-page--figures {
      margin: 8px 16px 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .od-maintenance-page--figure {
      padding: 12px 8px;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--od-surface);
    }

    .od-maintenance-page--value {
      font-size: 28px;
      line-height: 32px;
      font-weight: 600;
    }

    .od-maintenance-page--figure-overdue .od-maintenance-page--value {
      color: var(--od-alarm);
    }

    .od-maintenance-page--legend {
      font-size: 13px;
      line-height: 18px;
      text-align: center;
      color: var(--od-text-2);
    }

    .od-maintenance-page--title {
      margin: 20px 20px 8px;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    .od-maintenance-page--list {
      margin: 0 16px;
      border-radius: 20px;
      overflow: hidden;
      background: var(--od-surface);
    }

    .od-maintenance-page--row {
      min-height: 64px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--od-text);
      text-decoration: none;
    }

    .od-maintenance-page--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
    }

    .od-maintenance-page--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-maintenance-page--name {
      font-size: 16px;
      line-height: 22px;
    }

    .od-maintenance-page--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-maintenance-page--tag {
      flex: none;
      max-width: 40%;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 20px;
      font-weight: 500;
      text-align: center;
      background: var(--od-surface-2);
    }

    .od-maintenance-page--tag-overdue {
      background: var(--od-alarm-tint);
      color: var(--od-alarm);
    }

    .od-maintenance-page--empty {
      margin: 32px 24px 0;

      h2 {
        margin: 0;
        font-size: 18px;
        line-height: 24px;
        font-weight: 700;
      }

      p {
        margin: 4px 0 0;
        font-size: 14px;
        color: var(--od-text-2);
      }
    }

    .od-maintenance-page--note {
      margin: 16px 20px 0;
      display: flex;
      gap: 8px;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-maintenance-page--bottom {
      height: 48px;
    }
  }
</style>
