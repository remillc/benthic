// @ts-check
// The two help pages of the git form, « Comment créer un dépôt » and « Comment créer un jeton d’accès »
// (tasks 2026-11-16-247, 252 to 256, 257): the hosts, their pages and how many steps each has. One list per help,
// read by the component that draws them (components/GitHelp.svelte), which the phone's pages and the tablet's and
// desktop's first-launch column both use. To add a host: one entry here and its texts `<prefix>.<id>.*`.

/** @typedef {{ id: string, page: string, steps: number }} HelpProvider */
/** @typedef {{ prefix: string, tabs: string, providers: HelpProvider[] }} HelpKind */

/** @type {Record<'repository'|'token', HelpKind>} */
export const GIT_HELP = {
  repository: {
    prefix: 'repoHelp',
    tabs: 'repoHelp.tabs',
    providers: [
      { id: 'github', page: 'https://github.com/new', steps: 6 },
      { id: 'gitlab', page: 'https://gitlab.com/projects/new#blank_project', steps: 7 },
      { id: 'codeberg', page: 'https://codeberg.org/repo/create', steps: 6 },
    ],
  },
  token: {
    prefix: 'tokenHelp',
    tabs: 'tokenHelp.hosts',
    providers: [
      { id: 'github', page: 'https://github.com/settings/personal-access-tokens/new', steps: 9 },
      { id: 'gitlab', page: 'https://gitlab.com/-/user_settings/personal_access_tokens', steps: 7 },
      { id: 'codeberg', page: 'https://codeberg.org/user/settings/applications', steps: 7 },
    ],
  },
};

/**
 * The keys of a host's steps. In the desktop app a step that names a touch (« Touchez », « Tap ») has a variant
 * `sNDesktop` (« Cliquez sur », « Click ») that replaces it; `hasDesktop` tells whether that key exists.
 * @param {'repository'|'token'} kind
 * @param {HelpProvider} provider
 * @param {(key: string) => boolean} [hasDesktop] given in the desktop app only
 * @returns {string[]}
 */
export function helpStepKeys(kind, provider, hasDesktop) {
  return Array.from({ length: provider.steps }, (_, i) => {
    const key = `${GIT_HELP[kind].prefix}.${provider.id}.s${i + 1}`;
    return hasDesktop?.(`${key}Desktop`) ? `${key}Desktop` : key;
  });
}
