<script>
  // @ts-check
  // DEVELOPMENT ONLY: « Supprimer ce compte d'essai », on the account page of a temporary account (address ending in
  // @opendives.test) made with the simulated Google sign-in. Loaded through `import()` behind the development switch.
  import { f7 } from 'framework7-svelte';
  import { deleteSignedInAccount, isTempEmail } from '../lib/dev-accounts.js';
  import { signOut } from '../lib/logbook.svelte.js';
  import { showSection } from '../lib/navigation.svelte.js';
  import { showSnackbar } from '../lib/snackbar.js';

  /** @type {{ email: string }} */
  let { email } = $props();

  const english = typeof navigator !== 'undefined' && !/^fr/i.test(navigator.language);
  const text = english
    ? { button: 'Delete this test account', help: 'Development only: deletes the account and its repository on the development server, and the copy on this device.', confirm: 'Delete the test account?', done: 'Test account deleted', failed: 'The test account could not be deleted' }
    : { button: 'Supprimer ce compte d’essai', help: 'Développement seulement : supprime le compte et son dépôt sur le serveur de développement, et la copie sur cet appareil.', confirm: 'Supprimer le compte d’essai ?', done: 'Compte d’essai supprimé', failed: 'Le compte d’essai n’a pas pu être supprimé' };

  async function remove() {
    try {
      await deleteSignedInAccount();
      await signOut({ deleteCopy: true });
      showSection('logbook');
      showSnackbar(text.done);
    } catch (e) {
      console.error('Deleting the test account', e);
      showSnackbar(text.failed);
    }
  }

  function ask() {
    f7.dialog.confirm(text.confirm, text.button, () => void remove());
  }
</script>

{#if isTempEmail(email)}
  <div class="bc-dev-delete-account">
    <button type="button" class="bc-outlined-button" onclick={ask}>{text.button}</button>
    <span class="bc-dev-delete-account--help">{text.help}</span>
  </div>
{/if}

<style>
  @layer od.components {
    .bc-dev-delete-account {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 16px 16px 0;
      padding-top: 16px;
      border-top: 2px dashed var(--bc-alarm);
    }

    .bc-dev-delete-account--help {
      font-size: 13px;
      color: var(--bc-text-2);
    }
  }
</style>
