<script>
  // @ts-check
  // « Faire signer la plongée » on a tablet and on the desktop (inbox task 2026-11-22-330): the steps of the phone's screen
  // (ValidationSteps: the choice, the signature on this device, the QR code) in a dialog over the detail. Title and buttons
  // follow the step; « Retour » goes one step back, « Annuler » closes from the first one.
  import Md3Dialog from './Md3Dialog.svelte';
  import ValidationSteps from './ValidationSteps.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ ids: number[], onclose: () => void }} */
  let { ids, onclose } = $props();

  /** @type {ValidationSteps|undefined} */
  let steps = $state();
  const step = $derived(steps?.getStep() ?? 'choose');
</script>

<Md3Dialog class="bc-validation-dialog" title={steps?.getTitle() ?? t('validation.chooseTitle')} oncancel={() => (step === 'choose' ? onclose() : steps?.back())}>
  <ValidationSteps bind:this={steps} {ids} onleave={onclose} />
  {#snippet actions()}
    {#if step === 'choose'}
      <button type="button" onclick={onclose}>{t('dialog.cancel')}</button>
    {:else}
      <button type="button" onclick={() => steps?.back()}>{t('detail.back')}</button>
      {#if step === 'sign'}
        <button type="button" onclick={() => steps?.sign()} disabled={!steps?.getCanSign()}>{t('validation.sign')}</button>
      {/if}
    {/if}
  {/snippet}
</Md3Dialog>

<style>
  @layer bc.components {
    /* The steps' own margins (16 to 20 dp) are kept; the dialog's content scrolls. */
    :global(.bc-validation-dialog .bc-validate--actions) {
      margin-bottom: 8px;
    }
  }
</style>
