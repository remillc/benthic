import fs from 'node:fs';
const f = 'app/src/lib/shared-file.js';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing ' + a.slice(0, 40)); s = s.replace(a, b); };
rep(` * @property {() => Promise<void>} [ready] resolves once the logbook is read
 */`, ` * @property {() => Promise<void>} [ready] resolves once the logbook is read
 * @property {() => string} [logbookName] the name of the open logbook, for the sites confirmation
 * @property {(options: { name: string, canCreate: boolean }, actions: { merge: () => Promise<void>, create?: () => Promise<void> }) => void} [choose]
 *   the choice for a dives file with a logbook open: « Nouveau carnet » (\`create\`, only when this device can hold
 *   another logbook) or « Ajouter à ce carnet » (\`merge\`); without it, the single confirmation \`confirm\` is used
 * @property {(name: string, data: string) => Promise<void>} [newLogbook] creates a logbook from the file, keeps the open one untouched
 * @property {() => boolean} [canCreateLogbook] false when this device holds one logbook at a time (a phone)
 */`);
rep(`    deps.confirm({ textKey: 'link.sitesText', values: { name: label, n: sites.length }, actionKey: 'link.sitesAction' }, async () => {`,
`    // The sites go to the open logbook, named in the question: never to one the diver did not choose.
    deps.confirm({ textKey: 'link.sitesText', values: { name: label, n: sites.length, logbook: deps.logbookName?.() ?? '' }, actionKey: 'link.sitesAction' }, async () => {`);
rep(`  deps.confirm({ textKey: 'link.fileText', values: { name: label || name }, actionKey: 'link.fileAction' }, async () => {
    try {
      deps.imported(await deps.importData(name, data));
    } catch (e) {
      deps.importFailed(e);
    }
  });
  return 'confirm-dives';`, `  const merge = async () => {
    try {
      deps.imported(await deps.importData(name, data));
    } catch (e) {
      deps.importFailed(e);
    }
  };
  if (!deps.choose) {
    deps.confirm({ textKey: 'link.fileText', values: { name: label || name }, actionKey: 'link.fileAction' }, merge);
    return 'confirm-dives';
  }
  const newLogbook = deps.newLogbook;
  const canCreate = !!newLogbook && (deps.canCreateLogbook?.() ?? true);
  const create = canCreate && newLogbook
    ? async () => {
        try {
          await newLogbook(name, data);
        } catch (e) {
          deps.importFailed(e);
        }
      }
    : undefined;
  deps.choose({ name: label || name, canCreate }, { merge, create });
  return 'confirm-dives';`);
s = s.replace(`a sites file is merged into the open logbook:`, `a sites file is merged into the open logbook, named in the question:`);
fs.writeFileSync(f, s);

const o = 'app/src/lib/open-link.js';
s = fs.readFileSync(o, 'utf8');
rep(`  confirm: (/** @type {any} */ o,`, `  logbookName: () => deviceStore.getItem('bc.logbookName') || logbook.email || t('welcomeSteps.defaultName'),
  // One logbook at a time on a phone or a tablet (the device's copy, or the account's): « Nouveau carnet » would
  // replace the open one, so it is not offered there; the desktop opens one logbook per window and takes no shared file.
  canCreateLogbook: () => false,
  choose: (/** @type {{ name: string, canCreate: boolean }} */ o, /** @type {{ merge: () => Promise<void>, create?: () => Promise<void> }} */ actions) => {
    /** @type {any[]} */
    const buttons = [{ text: t('dialog.cancel') }];
    if (actions.create) buttons.push({ text: t('link.fileNew'), bold: true, onClick: actions.create });
    buttons.push({ text: t('link.fileMerge'), onClick: actions.merge });
    f7.dialog
      .create({ title: t('link.fileTitle'), text: t(actions.create ? 'link.fileChoose' : 'link.fileChooseOne', { name: o.name }), buttons, verticalButtons: buttons.length > 2 })
      .open();
  },
  confirm: (/** @type {any} */ o,`);
fs.writeFileSync(o, s);

for (const [lang, v] of Object.entries({
  fr: { fileChoose: 'Que faire des plongées de « {name} » ?\n\nNouveau carnet : garde ce carnet tel quel et crée un carnet à partir du fichier.\n\nAjouter à ce carnet : ajoute les plongées du fichier au carnet ouvert.', fileChooseOne: 'Ajoute les plongées de « {name} » au carnet ouvert. Celles qui y sont déjà ne sont pas ajoutées deux fois. Cet appareil ne garde qu’un carnet à la fois : un nouveau carnet remplacerait celui-ci.', fileNew: 'Nouveau carnet', fileMerge: 'Ajouter à ce carnet',
    sitesText: 'Ajouter les {n} sites de « {name} » au carnet {logbook} ? Un site déjà dans le carnet n’est pas modifié ni ajouté deux fois ; un site dont seul le nom provisoire est connu est complété.', sitesAction: 'Ajouter au carnet' },
  en: { fileChoose: 'What to do with the dives of “{name}”?\n\nNew logbook: keeps this logbook as it is and creates a logbook from the file.\n\nAdd to this logbook: adds the dives of the file to the open logbook.', fileChooseOne: 'Adds the dives of “{name}” to the open logbook. Dives already there are not added twice. This device keeps one logbook at a time: a new logbook would replace this one.', fileNew: 'New logbook', fileMerge: 'Add to this logbook',
    sitesText: 'Add the {n} sites of “{name}” to the logbook {logbook}? A site already in the logbook is neither changed nor added twice; a site known only by its temporary name is completed.', sitesAction: 'Add to logbook' },
})) {
  const p = `app/src/i18n/${lang}.json`;
  let j = fs.readFileSync(p, 'utf8');
  for (const [k, val] of Object.entries(v)) {
    const re = new RegExp(String.raw`(
    "${k}": )"(?:[^"\]|\.)*"(,?
)`);
    const enc = JSON.stringify(val);
    if (re.test(j) && ['sitesText', 'sitesAction'].includes(k)) j = j.replace(re, (m, a, b) => a + enc + b);
    else if (k === 'fileAction') continue;
    else j = j.replace(`\n    "fileAction": `, `\n    ${JSON.stringify(k)}: ${enc},\n    "fileAction": `);
  }
  fs.writeFileSync(p, j);
}
