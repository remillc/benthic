<script>
  // @ts-check
  // « Brevets » (task 2026-11-18-272, docs/mockups-release/profil-brevets-android.dc.html): the certification cards, each
  // with the agency's name in a colour, the level, the number and the date; « Montrez une carte au centre de plongée,
  // même sans réseau. » and the extended button « Ajouter un brevet ». Read from the sealed working copy on the device.
  import { onMount } from 'svelte';
  import { Page, Navbar, Link, f7 } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import ReadOnlyNotice from '../components/ReadOnlyNotice.svelte';
  import { diver, loadProfile } from '../lib/profile.svelte.js';
  import { gear, loadInventory } from '../lib/inventory.svelte.js';
  import { AGENCIES } from '../lib/profile.js';
  import { formatLongDate } from '../lib/profile-format.js';
  import { t } from '../lib/i18n.js';

  onMount(() => Promise.all([loadProfile(), loadInventory()]));

  /** @param {import('../lib/profile.js').Certification} c */
  const agencyName = (c) => (c.agency === 'other' ? c.agencyName || t('diverProfile.cert.agencyOther') : c.agency);
  /** @param {string} id */
  const tone = (id) => AGENCIES.find((a) => a.id === id)?.tone ?? 'neutral';
  /** @param {import('../lib/profile.js').Certification} c */
  const line = (c) => (c.issuedOn ? t('diverProfile.certs.line', { number: c.number, date: formatLongDate(c.issuedOn) }) : t('diverProfile.certs.lineNoDate', { number: c.number }));
  /** @param {string} id */
  const open = (id) => f7.views.current.router.navigate(`/profile/certs/${id}`);
</script>

<Page class="od-certs">
  <Navbar title={t('diverProfile.certs.title')}>
    {#snippet left()}
      <Link back iconOnly>
        <i class="icon icon-back"></i>
        <span class="od-sr-only">{t('diverProfile.certs.back')}</span>
      </Link>
    {/snippet}
  </Navbar>

  <ReadOnlyNotice />

  {#if diver.ready && !diver.certs.length}
    <div class="od-certs--empty">
      <span class="od-certs--empty-icon"><Icon name="idCard" size={32} weight={1.6} /></span>
      <p class="od-certs--empty-title">{t('diverProfile.certs.empty')}</p>
      <p class="od-certs--empty-text">{t('diverProfile.certs.emptyText')}</p>
    </div>
  {:else}
    <div class="od-certs--list">
      {#each diver.certs as c (c.id)}
        <button type="button" class="od-certs--card" onclick={() => open(c.id)}>
          <span class="od-certs--agency od-certs--tone-{tone(c.agency)}">{agencyName(c)}</span>
          <span class="od-certs--level">{c.level}</span>
          <span class="od-certs--line">{line(c)}</span>
          <span class="od-certs--chevron"><Icon name="chevron" size={20} /></span>
        </button>
      {/each}
    </div>
  {/if}

  <p class="od-certs--note"><Icon name="info" size={18} /><span>{t('diverProfile.certs.note')}</span></p>
  <div class="od-certs--bottom"></div>

  {#snippet fixedContent()}
    <div class="fab fab-right-bottom fab-extended od-fab-add" style:display={gear.readOnly ? 'none' : null}>
      <a href="/profile/certs/new">
        <i class="icon"><Icon name="plus" /></i>
        <div class="fab-text">{t('diverProfile.certs.add')}</div>
      </a>
    </div>
  {/snippet}
</Page>

<style>
  @layer od.components {
    :global(.od-certs .page-content) {
      padding-inline: max(0px, calc((100% - 720px) / 2));
    }

    .od-certs--list {
      margin: 8px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .od-certs--card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      width: 100%;
      padding: 14px 48px 14px 16px;
      border: none;
      border-radius: 20px;
      background: var(--od-surface);
      color: var(--od-text);
      font: inherit;
      text-align: start;
    }

    .od-certs--agency {
      font-size: 14px;
      line-height: 20px;
      font-weight: 700;
      letter-spacing: 0.4px;
    }

    .od-certs--tone-blue {
      color: var(--od-plus-blue-icon);
    }

    .od-certs--tone-green {
      color: var(--od-plus-green-icon);
    }

    .od-certs--tone-amber {
      color: var(--od-plus-amber-icon);
    }

    .od-certs--tone-violet {
      color: var(--od-plus-violet-icon);
    }

    .od-certs--level {
      font-size: 17px;
      line-height: 23px;
      font-weight: 500;
    }

    .od-certs--line {
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-certs--chevron {
      position: absolute;
      inset-inline-end: 14px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      color: var(--od-text-2);
    }

    .od-certs--empty {
      margin: 48px 32px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
    }

    .od-certs--empty-icon {
      width: 64px;
      height: 64px;
      border-radius: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--od-tile-violet);
    }

    .od-certs--empty-title {
      margin: 8px 0 0;
      font-size: 20px;
      line-height: 26px;
      font-weight: 500;
    }

    .od-certs--empty-text {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: var(--od-text-2);
    }

    .od-certs--note {
      margin: 16px 32px 0;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      line-height: 18px;
      color: var(--od-text-2);
    }

    .od-certs--bottom {
      height: 96px;
    }
  }
</style>
