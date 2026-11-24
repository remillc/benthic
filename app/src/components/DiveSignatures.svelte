<script>
  // @ts-check
  // The « Signatures » card of the dive detail's Informations tab (tasks 2026-11-24-382, 386 and 387; mock-ups
  // bureau-carnet-profil-droite, android-tablette-detail-onglets-*, detail-onglets-android): Benthic+ only. It replaces
  // the old « Validations » group on every device. Each signature is a row (« Taylor · guide de palanquée », how and
  // when it was signed, the signature drawn on its paper) with a button to remove it; « Faire signer » in the header
  // starts a new one (a dialog on a tablet and the desktop, the full screen of the phone elsewhere).
  import DesktopEquipmentCard from './DesktopEquipmentCard.svelte';
  import Icon from './Icon.svelte';
  import { validationsOf, removeValidation } from '../lib/validation.svelte.js';
  import { confirmAction } from '../lib/dialogs.js';
  import { showSnackbar } from '../lib/snackbar.js';
  import { formatDate } from '../lib/format.js';
  import { t, tIfExists } from '../lib/i18n.js';

  /** @type {{ dive: import('benthic-core').DiveDetail, onsign: () => void }} */
  let { dive, onsign } = $props();

  const items = $derived(validationsOf(dive));

  /** @param {import('../lib/validation.js').ValidationItem} v */
  function confirmRemove(v) {
    confirmAction({
      title: t('validation.removeTitle'),
      text: v.pending ? t('validation.removePendingText') : t('validation.removeText', { name: v.name }),
      action: t('validation.removeAction'),
      danger: true,
      onConfirm: async () => {
        try {
          await removeValidation(v.id);
          showSnackbar(t('validation.removed'));
        } catch (e) {
          console.error('Remove a validation', e);
          showSnackbar(t('validation.saveFailed'));
        }
      },
    });
  }
</script>

<DesktopEquipmentCard name="signatures" title={t('validation.section')}>
  {#snippet icon()}<Icon name="seal" size={22} />{/snippet}
  {#snippet action()}
    <button type="button" class="bc-dive-signatures--sign" data-field="sign" onclick={onsign}><Icon name="plus" size={18} />{t('validation.add')}</button>
  {/snippet}
  {#each items as v (v.id)}
    <div class="bc-dive-signatures--item" class:bc-dive-signatures--pending={v.pending} data-field="signature">
      <div class="bc-dive-signatures--text">
        {#if v.pending}
          <span class="bc-dive-signatures--name">{t('validation.pending')}</span>
          <span class="bc-dive-signatures--detail">{t('validation.pendingText')}</span>
        {:else}
          <span class="bc-dive-signatures--name">{t('validation.itemName', { name: v.name, role: (tIfExists(`validation.roles.${v.role}`) ?? v.role).toLocaleLowerCase() })}</span>
          <span class="bc-dive-signatures--detail">{[t(`validation.method.${v.method}`), formatDate(v.at), v.instructorNumber].filter(Boolean).join(' · ')}</span>
          {#if v.modified}<span class="bc-dive-signatures--modified">{t('validation.modified')}</span>{/if}
        {/if}
      </div>
      {#if v.signature}<img class="bc-dive-signatures--signature" src={v.signature} alt={t('validation.signatureOf', { name: v.name })} />{/if}
      <button type="button" class="bc-dive-signatures--remove" onclick={() => confirmRemove(v)}>
        <Icon name="close" size={20} /><span class="bc-sr-only">{t('validation.remove')}</span>
      </button>
    </div>
  {/each}
</DesktopEquipmentCard>

<style>
  @layer bc.components {
    .bc-dive-signatures--sign {
      width: auto;
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 0 12px;
      border: 0;
      border-radius: 20px;
      background: none;
      color: var(--bc-on-table-selected);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, currentColor 8%, transparent);
      }
    }

    .bc-dive-signatures--item {
      box-sizing: border-box;
      min-height: 56px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 8px 8px 12px;
      border-radius: 12px;
      background: var(--bc-field-rest);
    }

    .bc-dive-signatures--text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .bc-dive-signatures--name {
      font-size: 15px;
      line-height: 20px;
      color: var(--bc-text);
    }

    .bc-dive-signatures--detail {
      font-size: 13px;
      line-height: 18px;
      color: var(--bc-text-2);
    }

    .bc-dive-signatures--modified {
      font-size: 13px;
      font-weight: 500;
      color: var(--bc-alarm);
    }

    /* The signature is drawn black on white, in every mode: it keeps its paper. */
    .bc-dive-signatures--signature {
      flex: none;
      width: 72px;
      height: 29px;
      border-radius: 6px;
      object-fit: contain;
      background: var(--bc-qr-paper);
      border: 1px solid var(--bc-separator);
    }

    .bc-dive-signatures--remove {
      flex: none;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: none;
      color: var(--bc-text-2);
      cursor: pointer;
      &:hover {
        background: color-mix(in srgb, var(--bc-text) 8%, transparent);
      }
    }
  }
</style>
