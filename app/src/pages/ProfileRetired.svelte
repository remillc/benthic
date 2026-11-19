<script>
  // @ts-check
  // « Pièces retirées » (task 2026-11-19-308, docs/mockups/profil-equipement-android.dc.html and the retired-piece sheets): the pieces
  // retired from the equipment, the latest first, each with the day and the reason. A piece opens its sheet (« Remettre en
  // service », « Exporter l'historique », « Supprimer pour de bon »). The panes of a wide screen show it beside the equipment list.
  import { onMount } from 'svelte';
  import { Page, Navbar } from 'framework7-svelte';
  import BackLink from '../components/BackLink.svelte';
  import GearIcon from '../components/GearIcon.svelte';
  import Icon from '../components/Icon.svelte';
  import ProfileFrame from '../components/ProfileFrame.svelte';
  import { gear, loadInventory, retiredGear } from '../lib/inventory.svelte.js';
  import { formatDate } from '../lib/format.js';
  import { profileWide, showProfilePath } from '../lib/profile-frame.js';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7router: any }} */
  let { f7router } = $props();

  onMount(loadInventory);

  const pieces = $derived(retiredGear());

  /** @param {import('../lib/inventory.js').Gear} g */
  const line = (g) => [g.retiredOn ? t('gear.retire.retiredOn', { date: formatDate(g.retiredOn) }) : t('gear.retire.retired'), g.retiredReason ? t(`gear.retire.reason.${g.retiredReason}`) : ''].filter(Boolean).join(' · ');

  /** @param {string} id */
  const open = (id) => (profileWide() ? showProfilePath(`/profile/gear/${id}`) : f7router.navigate(`/profile/gear/${id}`));
</script>

{#snippet body()}
  {#if profileWide()}<h1 class="od-retired-page--title">{t('gear.inventory.retiredRow')}</h1>{/if}
  {#if !pieces.length && gear.ready}
    <p class="od-retired-page--empty">{t('gear.retire.empty')}</p>
  {:else}
    <p class="od-retired-page--note">{t('gear.retire.listNote')}</p>
    <div class="od-retired-page--list">
      {#each pieces as g (g.id)}
        <button type="button" class="od-retired-page--row" onclick={() => open(g.id)}>
          <span class="od-retired-page--tile"><GearIcon type={g.type} name={g.name} size={22} piece={g} tile={40} /></span>
          <span class="od-retired-page--texts">
            <span class="od-retired-page--name">{g.name}</span>
            <span class="od-retired-page--supporting">{line(g)}</span>
          </span>
          <span class="od-retired-page--chevron"><Icon name="chevron" size={20} /></span>
        </button>
      {/each}
    </div>
  {/if}
  <div class="od-retired-page--bottom"></div>
{/snippet}

<Page class="od-retired-page">
  <Navbar title={t('gear.inventory.retiredRow')}>
    {#snippet left()}
      <BackLink label={t('gear.inventory.title')} name={t('gear.piece.back')} />
    {/snippet}
  </Navbar>
  {#if profileWide()}
    <ProfileFrame section="gear" list="gear" selected="retired" bar="none">{@render body()}</ProfileFrame>
  {:else}
    {@render body()}
  {/if}
</Page>

<style>
  @layer od.components {
    /* Fluid layout: the content keeps a readable width on a tablet. */
    :global(.od-retired-page .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-retired-page--title {
      margin: 24px 20px 4px;
      font-size: 24px;
      line-height: 30px;
      font-weight: 500;
    }

    .od-retired-page--note,
    .od-retired-page--empty {
      margin: 8px 20px 16px;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-retired-page--list {
      margin: 0 16px;
      border-radius: 20px;
      background: var(--od-surface);
      overflow: hidden;
    }

    .od-retired-page--row {
      box-sizing: border-box;
      width: 100%;
      min-height: 64px;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      border: none;
      background: none;
      color: var(--od-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .od-retired-page--row + .od-retired-page--row {
      border-top: 1px solid var(--od-separator);
    }

    .od-retired-page--tile {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-release-tile);
    }

    :global(.ios) .od-retired-page--tile {
      width: 36px;
      height: 36px;
      border-radius: 8px;
    }

    .od-retired-page--texts {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .od-retired-page--name {
      font-size: 16px;
      line-height: 22px;
      overflow-wrap: anywhere;
    }

    .od-retired-page--supporting {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-retired-page--chevron {
      flex: none;
      color: var(--od-text-2);
    }

    .od-retired-page--bottom {
      height: calc(32px + var(--od-safe-bottom));
    }
  }
</style>
