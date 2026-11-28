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
    <!--
      One card per signature (task 2026-11-27-420; mock-ups android-tablette-detail-onglets-paysage, detail-onglets-android):
      a 1 px border, 12 px corners; the signature across the card in a 128 px area over a thin line, the « Retirer la signature
      de … » × in its top-right corner (48 px); below, the name · role, then how and when it was signed. A validation waiting
      for its answer has no picture: its × ends the text.
    -->
    {@const removeLabel = t('validation.removeOf', { name: v.name })}
    <div class="bc-dive-signatures--item" class:bc-dive-signatures--pending={v.pending} data-field="signature">
      {#if v.signature}
        <div class="bc-dive-signatures--picture">
          <img class="bc-dive-signatures--signature" src={v.signature} alt={t('validation.signatureOf', { name: v.name })} />
          <button type="button" class="bc-dive-signatures--remove bc-dive-signatures--remove-corner" aria-label={removeLabel} title={removeLabel} onclick={() => confirmRemove(v)}><Icon name="close" size={20} /></button>
        </div>
      {/if}
      <div class="bc-dive-signatures--text-row">
        <div class="bc-dive-signatures--text">
          {#if v.pending}
            <span class="bc-dive-signatures--name">{t('validation.pending')}</span>
            <span class="bc-dive-signatures--detail">{t('validation.pendingText')}</span>
          {:else}
            <span class="bc-dive-signatures--name">{v.name} <span class="bc-dive-signatures--role">· {(tIfExists(`validation.roles.${v.role}`) ?? v.role).toLocaleLowerCase()}</span></span>
            <span class="bc-dive-signatures--detail">{[t(`validation.method.${v.method}`), formatDate(v.at), v.instructorNumber].filter(Boolean).join(' · ')}</span>
            {#if v.modified}<span class="bc-dive-signatures--modified">{t('validation.modified')}</span>{/if}
          {/if}
        </div>
        {#if !v.signature}
          <button type="button" class="bc-dive-signatures--remove" aria-label={removeLabel} title={removeLabel} onclick={() => confirmRemove(v)}><Icon name="close" size={20} /></button>
        {/if}
      </div>
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
      border: 1px solid var(--bc-separator);
      border-radius: 12px;
      overflow: hidden;
    }

    /* The signature's area: 128 px, the picture centred, a thin line under it. Drawn black on white in every mode: it
       keeps its paper. */
    .bc-dive-signatures--picture {
      position: relative;
      height: 128px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-bottom: 1px solid var(--bc-separator);
      background: var(--bc-qr-paper);
    }

    .bc-dive-signatures--text-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 4px 12px 16px;
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
      font-weight: 500;
      color: var(--bc-text);
    }

    .bc-dive-signatures--role {
      font-weight: 400;
      color: var(--bc-text-2);
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

    .bc-dive-signatures--signature {
      box-sizing: border-box;
      max-width: calc(100% - 112px);
      max-height: 104px;
      object-fit: contain;
    }

    /* The × in the picture's top-right corner, on the paper: its ink stays dark in every mode. */
    .bc-dive-signatures--remove.bc-dive-signatures--remove-corner {
      position: absolute;
      top: 4px;
      right: 4px;
      color: var(--bc-qr-ink);
    }

    .bc-dive-signatures--remove {
      flex: none;
      width: 48px;
      height: 48px;
      padding: 0;
      border: none;
      border-radius: 24px;
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
