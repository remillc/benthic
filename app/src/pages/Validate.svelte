<script>
  // @ts-check
  // « Faire signer la plongée » on the phone (inbox task 2026-11-19-309, point 2; Benthic+; docs/mockups/validation-choix-android,
  // validation-signature-android and validation-qr-android): a full screen holding the steps of
  // components/ValidationSteps.svelte for the dive (or the checked dives, `?ids=1,2,3`). Tablets and the desktop show the same
  // steps as a dialog (ValidationDialog.svelte, task 2026-11-22-330).
  import { Page, Navbar, Link } from 'framework7-svelte';
  import Icon from '../components/Icon.svelte';
  import ValidationSteps from '../components/ValidationSteps.svelte';
  import { t } from '../lib/i18n.js';

  /** @type {{ f7route: { query: { ids?: string } }, f7router: any }} */
  let { f7route, f7router } = $props();

  const ids = (f7route.query.ids ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  /** @type {ValidationSteps|undefined} */
  let steps = $state();
</script>

<Page class="bc-validate">
  <Navbar title={steps?.getTitle() ?? ''}>
    {#snippet left()}
      <Link iconOnly onClick={() => steps?.back()}>
        <Icon name="arrowBack" /><span class="bc-sr-only">{t('detail.back')}</span>
      </Link>
    {/snippet}
    {#snippet right()}
      {#if steps?.getStep() === 'sign'}
        <Link onClick={() => steps?.sign()} class={steps.getCanSign() ? '' : 'disabled'}>{t('validation.sign')}</Link>
      {/if}
    {/snippet}
  </Navbar>
  <ValidationSteps bind:this={steps} {ids} onleave={() => f7router.back()} />
</Page>

<style>
  @layer bc.components {
    :global(.bc-validate.page) {
      background: var(--bc-background);
    }
  }
</style>
