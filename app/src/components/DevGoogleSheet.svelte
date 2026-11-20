<script>
  // @ts-check
  // DEVELOPMENT ONLY: the sheet of the simulated « Continuer avec Google » (lib/dev-accounts.js). Loaded through
  // `import()` behind the development switch, so a build without VITE_DEV_ACCOUNTS=1 does not contain it. Its texts
  // are not in the translation files for that reason: they must not reach a release catalogue.
  import { randomTempEmail } from '../lib/dev-accounts.js';

  /** @type {{ busy?: boolean, error?: string, onsubmit: (answer: { email: string, name: string }) => void, oncancel: () => void }} */
  let { busy = false, error = '', onsubmit, oncancel } = $props();

  const english = typeof navigator !== 'undefined' && !/^fr/i.test(navigator.language);
  const text = english
    ? { badge: 'Simulation (development)', lead: 'No real Google sign-in: this creates a temporary account on the development server.', email: 'E-mail', name: 'Name', go: 'Continue', cancel: 'Cancel' }
    : { badge: 'Simulation (développement)', lead: 'Aucune vraie connexion Google : cela crée un compte temporaire sur le serveur de développement.', email: 'Courriel', name: 'Nom', go: 'Continuer', cancel: 'Annuler' };

  let email = $state(randomTempEmail());
  let name = $state('Plongeur d’essai');
</script>

<div class="bc-dev-google-sheet" role="dialog" aria-modal="true" aria-label={text.badge}>
  <form class="bc-dev-google-sheet--panel" onsubmit={(e) => { e.preventDefault(); if (!busy) onsubmit({ email, name }); }}>
    <span class="bc-dev-google-sheet--badge">{text.badge}</span>
    <p class="bc-dev-google-sheet--lead">{text.lead}</p>
    <label class="bc-dev-google-sheet--field"><span>{text.email}</span><input type="email" bind:value={email} autocapitalize="off" autocomplete="off" /></label>
    <label class="bc-dev-google-sheet--field"><span>{text.name}</span><input type="text" bind:value={name} autocomplete="off" /></label>
    {#if error}<p class="bc-dev-google-sheet--error" role="alert">{error}</p>{/if}
    <div class="bc-dev-google-sheet--actions">
      <button type="button" class="bc-dev-google-sheet--cancel" onclick={oncancel}>{text.cancel}</button>
      <button type="submit" class="bc-dev-google-sheet--go" disabled={busy || !email.trim()}>{text.go}</button>
    </div>
  </form>
</div>

<style>
  @layer od.components {
    .bc-dev-google-sheet {
      position: fixed;
      inset: 0;
      z-index: 20000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgb(0 0 0 / 0.45);
    }

    .bc-dev-google-sheet--panel {
      box-sizing: border-box;
      width: 100%;
      max-width: 480px;
      padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
      border-radius: 20px 20px 0 0;
      background: var(--bc-surface);
      color: var(--bc-text);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bc-dev-google-sheet--badge {
      align-self: flex-start;
      padding: 4px 10px;
      border: 2px dashed var(--bc-alarm, #b3261e);
      border-radius: 8px;
      color: var(--bc-alarm, #b3261e);
      font-size: 13px;
      font-weight: 600;
    }

    .bc-dev-google-sheet--lead {
      margin: 0;
      font-size: 14px;
      color: var(--bc-text-2);
    }

    .bc-dev-google-sheet--field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
      color: var(--bc-text-2);

      input {
        height: 44px;
        padding: 0 12px;
        border: 1px solid var(--bc-release-field-border);
        border-radius: 10px;
        background: var(--bc-surface);
        color: var(--bc-text);
        font: inherit;
        font-size: 16px;
      }
    }

    .bc-dev-google-sheet--error {
      margin: 0;
      color: var(--bc-alarm, #b3261e);
      font-size: 14px;
    }

    .bc-dev-google-sheet--actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .bc-dev-google-sheet--cancel,
    .bc-dev-google-sheet--go {
      height: 44px;
      padding: 0 20px;
      border: none;
      border-radius: 22px;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }

    .bc-dev-google-sheet--cancel {
      background: transparent;
      color: var(--bc-text);
    }

    .bc-dev-google-sheet--go {
      background: var(--bc-release-row-main);
      color: var(--bc-release-on-panel);

      &:disabled {
        opacity: 0.5;
      }
    }
  }
</style>
