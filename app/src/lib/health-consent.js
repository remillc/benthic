// @ts-check
// The optional consent to keep health data (task 2026-11-18-271): off by default, never ticked in advance, separate
// from the terms of use. The account on the server holds the original with its date; the device keeps a copy so that
// the screens work offline (lib/profile.js, `meta/health-consent.json`). Giving or withdrawing writes the device's
// copy first, then tells the account; when the account cannot be reached the copy is marked « not sent » and the
// next `refresh` sends it. Withdrawing deletes the blood group on the device at once (the profile does it); the
// group lives sealed in the diver's own repository, so the deletion reaches the server with the next sync of that file.

/** @typedef {import('./profile.js').Profile} Profile */

/**
 * @typedef {Object} ConsentAccount the calls to the account
 * @property {() => Promise<string>} sessionToken '' when nobody is signed in to the server
 * @property {(token: string) => Promise<{ consent: boolean, consentedAt: string }>} get
 * @property {(token: string, consent: boolean) => Promise<{ consent: boolean, consentedAt: string }>} set
 */

/**
 * @param {Profile} profile
 * @param {ConsentAccount} account
 */
export function createHealthConsent(profile, account) {
  /** Tells the account; false when there is no session or no network. @param {boolean} on */
  async function tell(on) {
    try {
      const token = await account.sessionToken();
      if (!token) return null;
      return await account.set(token, on);
    } catch {
      return null;
    }
  }

  return {
    read: () => profile.readConsent(),

    /** « Garder des données de santé » on, or « Autoriser ». @returns {Promise<{ consent: boolean, at: string, synced: boolean }>} */
    async give() {
      const answer = await tell(true);
      return profile.setConsent(true, { at: answer?.consentedAt || undefined, synced: !!answer });
    },

    /** « Retirer l'accord »: the blood group is deleted on this device, the account is told when it can be. @returns {Promise<{ consent: boolean, at: string, synced: boolean }>} */
    async withdraw() {
      const answer = await tell(false);
      return profile.setConsent(false, { synced: !!answer });
    },

    /**
     * Brings the device's copy and the account together: a change made offline goes up first; else the account's
     * answer is adopted. Does nothing without a session or a network.
     */
    async refresh() {
      const local = await profile.readConsent();
      try {
        const token = await account.sessionToken();
        if (!token) return local;
        if (!local.synced) {
          const answer = await account.set(token, local.consent);
          await profile.adoptConsent({ consent: answer.consent, at: answer.consentedAt });
        } else {
          const answer = await account.get(token);
          await profile.adoptConsent({ consent: answer.consent, at: answer.consentedAt });
        }
      } catch {
        // Offline: the device's copy stands.
      }
      return profile.readConsent();
    },
  };
}
