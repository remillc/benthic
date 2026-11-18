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

<div class="od-dev-google-sheet" role="dialog" aria-modal="true" aria-label={text.badge}>
  <form class="od-dev-google-sheet--panel" onsubmit={(e) => { e.preventDefault(); if (!busy) onsubmit({ email, name }); }}>
    <span class="od-dev-google-sheet--badge">{text.badge}</span>
    <p class="od-dev-google-sheet--lead">{text.lead}</p>
    <label class="od-dev-google-sheet--field"><span>{text.email}</span><input type="email" bind:value={email} autocapitalize="off" autocomplete="off" /></label>
    <label class="od-dev-google-sheet--field"><span>{text.name}</span><input type="text" bind:value={name} autocomplete="off" /></label>
    {#if error}<p class="od-dev-google-sheet--error" role="alert">{error}</p>{/if}
    <div class="od-dev-google-sheet--actions">
      <button type="button" class="od-dev-google-sheet--cancel" onclick={oncancel}>{text.cancel}</button>
      <button type="submit" class="od-dev-google-sheet--go" disabled={busy || !email.trim()}>{text.go}</button>
    </div>
  </form>
</div>

<style>
  @layer od.components {
    .od-dev-google-sheet {
      position: fixed;
      inset: 0;
      z-index: 20000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgb(0 0 0 / 0.45);
    }

    .od-dev-google-sheet--panel {
      box-sizing: border-box;
      width: 100%;
      max-width: 480px;
      padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
      border-radius: 20px 20px 0 0;
      background: var(--od-surface);
      color: var(--od-text);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .od-dev-google-sheet--badge {
      align-self: flex-start;
      padding: 4px 10px;
      border: 2px dashed var(--od-alarm, #b3261e);
      border-radius: 8px;
      color: var(--od-alarm, #b3261e);
      font-size: 13px;
      font-weight: 600;
    }

    .od-dev-google-sheet--lead {
      margin: 0;
      font-size: 14px;
      color: var(--od-text-2);
    }

    .od-dev-google-sheet--field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
      color: var(--od-text-2);

      input {
        height: 44px;
        padding: 0 12px;
        border: 1px solid var(--od-release-field-border);
        border-radius: 10px;
        background: var(--od-surface);
        color: var(--od-text);
        font: inherit;
        font-size: 16px;
      }
    }

    .od-dev-google-sheet--error {
      margin: 0;
      color: var(--od-alarm, #b3261e);
      font-size: 14px;
    }

    .od-dev-google-sheet--actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .od-dev-google-sheet--cancel,
    .od-dev-google-sheet--go {
      height: 44px;
      padding: 0 20px;
      border: none;
      border-radius: 22px;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }

    .od-dev-google-sheet--cancel {
      background: transparent;
      color: var(--od-text);
    }

    .od-dev-google-sheet--go {
      background: var(--od-release-row-main);
      color: var(--od-release-on-panel);

      &:disabled {
        opacity: 0.5;
      }
    }
  }
</style>
