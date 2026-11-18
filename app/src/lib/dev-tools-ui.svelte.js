// @ts-check
// DEVELOPMENT ONLY: whether the « Outils de développement » menu is open. Tiny and without dev texts; the menu itself
// (components/DevToolsMenu.svelte) is loaded through `import()` behind `devAccounts`.
export const devUi = $state({ open: false });
