// @ts-check
// DEVELOPMENT ONLY. What the development tools say when an action fails: a short sentence that tells what happened and
// what to do, never a raw code. The code only goes in a small secondary line, for debugging. Like the menu, these texts
// are not in the translation files: they must not reach a release catalogue.

/** @typedef {'fr'|'en'} DevLang */

/** The sentences, by code. Each one says what happened and what to do. */
const MESSAGES = /** @type {Record<string, { fr: string, en: string }>} */ ({
  NO_SESSION: {
    fr: 'Aucun compte connecté. Touchez « Abonné » ou « Gratuit / connecté » pour en créer un.',
    en: 'No account is signed in. Tap “Subscriber” or “Free / signed in” to create one.',
  },
  NOT_TEMPORARY: {
    fr: 'Ce compte n’est pas un compte d’essai, il ne peut pas être supprimé ici. Touchez « Nouveau compte d’essai ».',
    en: 'This is not a test account, so it cannot be deleted here. Tap “New test account”.',
  },
  UNREACHABLE: {
    fr: 'Le serveur de développement ne répond pas. Branchez le téléphone et relancez tools/dev-phone.sh.',
    en: 'The development server does not answer. Plug the phone in and run tools/dev-phone.sh again.',
  },
  NETWORK: {
    fr: 'Le serveur de développement ne répond pas. Branchez le téléphone et relancez tools/dev-phone.sh.',
    en: 'The development server does not answer. Plug the phone in and run tools/dev-phone.sh again.',
  },
  BAD_ADDRESS: {
    fr: 'L’adresse du serveur n’est pas valable. Vérifiez VITE_SERVER_URL et relancez l’app.',
    en: 'The server address is not valid. Check VITE_SERVER_URL and restart the app.',
  },
  INSECURE_ADDRESS: {
    fr: 'Le serveur doit être joint en HTTPS, sauf le serveur local. Vérifiez VITE_SERVER_URL.',
    en: 'The server must be reached over HTTPS, except the local one. Check VITE_SERVER_URL.',
  },
  REFUSED: {
    fr: 'Le serveur a refusé la session. Touchez « Nouveau compte d’essai » pour vous reconnecter.',
    en: 'The server refused the session. Tap “New test account” to sign in again.',
  },
  REJECTED: {
    fr: 'Le serveur a refusé la demande. Touchez « Nouveau compte d’essai » pour vous reconnecter.',
    en: 'The server rejected the request. Tap “New test account” to sign in again.',
  },
  NOT_DEBUG: {
    fr: 'Cette action n’existe que dans une version de développement. Installez le build de développement.',
    en: 'This action only exists in a development build. Install the development build.',
  },
  NOT_DEV: {
    fr: 'Cette action n’existe que dans une version de développement. Installez le build de développement.',
    en: 'This action only exists in a development build. Install the development build.',
  },
  TOO_BIG: {
    fr: 'Le fichier est trop gros pour être traité. Exportez un carnet plus petit.',
    en: 'The file is too big to be handled. Export a smaller logbook.',
  },
  NO_ALPHA: {
    fr: 'Aucun carnet de la version précédente sur cet appareil. Il n’y a rien à importer.',
    en: 'No logbook of the previous version on this device. There is nothing to import.',
  },
  CANCELLED: { fr: 'Action annulée.', en: 'Action cancelled.' },
  FAILED: { fr: 'L’action a échoué. Réessayez, puis consultez la console si cela continue.', en: 'The action failed. Try again, then check the console if it keeps happening.' },
  UNIMPLEMENTED: { fr: 'Cette action n’existe pas sur cette plateforme.', en: 'This action does not exist on this platform.' },
  UNAVAILABLE: { fr: 'Cette action n’existe pas sur cette plateforme.', en: 'This action does not exist on this platform.' },
  INVALID_ADDRESS: { fr: 'L’adresse e-mail temporaire a été refusée. Réessayez.', en: 'The temporary e-mail address was refused. Try again.' },
  WRONG_CODE: { fr: 'Le serveur a refusé le code. Réessayez.', en: 'The server refused the code. Try again.' },
  CODE_EXPIRED: { fr: 'Le code a expiré. Réessayez.', en: 'The code expired. Try again.' },
  TOO_MANY_ATTEMPTS: { fr: 'Trop d’essais. Attendez un moment, puis réessayez.', en: 'Too many attempts. Wait a moment, then try again.' },
  RESEND_TOO_SOON: { fr: 'Trop d’essais. Attendez un moment, puis réessayez.', en: 'Too many attempts. Wait a moment, then try again.' },
});

/** What is said for a code that is not in the table. */
const UNKNOWN = {
  fr: 'L’action a échoué. Réessayez, puis consultez la console si cela continue.',
  en: 'The action failed. Try again, then check the console if it keeps happening.',
};

/** Every code the dev tools can receive and that has a sentence. */
export const DEV_ERROR_CODES = Object.keys(MESSAGES);

/**
 * The code of an error: its own `code` when it is a known one, else the first word of its message.
 * @param {unknown} error
 * @returns {string}
 */
export function devErrorCode(error) {
  const e = /** @type {{ code?: unknown, message?: unknown }} */ (error ?? {});
  if (typeof e.code === 'string' && Object.hasOwn(MESSAGES, e.code)) return e.code;
  const word = String(e.message ?? error ?? '').split(/[:\s]/)[0].trim();
  if (Object.hasOwn(MESSAGES, word)) return word;
  return typeof e.code === 'string' && e.code && e.code !== 'CORE_ERROR' ? e.code : word;
}

/**
 * The text to show for an error, and the code for the small line of detail.
 * @param {unknown} error
 * @param {DevLang} [lang]
 * @returns {{ text: string, detail: string }}
 */
export function devErrorText(error, lang = 'fr') {
  const code = devErrorCode(error);
  const entry = Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined;
  return { text: (entry ?? UNKNOWN)[lang], detail: code };
}
