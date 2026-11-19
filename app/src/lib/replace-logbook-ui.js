// @ts-check
// The dialogs of « Remplacer ce carnet » (decided on 18 November 2026) and the export it offers first. The flow
// itself is lib/replace-logbook.js; the core call is replaceDeviceLogbook (lib/logbook.svelte.js).
import { f7 } from 'framework7-svelte';
import { Share } from '@capacitor/share';
import { OpenDivesCore } from 'opendives-core';
import { logbook, replaceDeviceLogbook } from './logbook.svelte.js';
import { deviceStore } from './device-store.js';
import { sanitiseLogbookName, logbookExportName, localDay } from './logbook-name.js';
import { exportFile } from './share.js';
import { importErrorKey } from './deep-link.js';
import { runReplace } from './replace-logbook.js';
import { showSnackbar } from './snackbar.js';
import { t } from './i18n.js';

/** The open logbook's name on this device. */
export const openLogbookName = () => deviceStore.getItem('od.logbookName') || t('welcomeSteps.defaultName');

/**
 * « Exporter d'abord ce carnet »: the open logbook as a Subsurface `.ssrf`, through the same export as « Exporter mon
 * carnet » and the system's share or save sheet.
 * @returns {Promise<boolean>} true when it was handed over (false: nothing to export, or the sheet was closed)
 */
export async function exportOpenLogbook() {
  const ids = logbook.dives.map((d) => d.id);
  if (!ids.length) return false;
  const name = logbookExportName(openLogbookName(), localDay(), t('desktop.export.fileLogbook'));
  const { uri, mime } = await exportFile(ids, 'ssrf', false, logbook.prefs, name);
  await OpenDivesCore.grantShareFile({ uri, mime });
  try {
    await Share.share({ title: name, files: [uri] });
  } catch (e) {
    if (/cancel/i.test(String(/** @type {any} */ (e)?.message ?? e))) return false;
    throw e;
  }
  return true;
}

/**
 * @param {{ title: string, text: string, buttons: { text: string, value: string, bold?: boolean }[] }} o
 * @returns {Promise<string>} the value of the chosen button
 */
function ask(o) {
  return new Promise((resolve) => {
    f7.dialog
      .create({
        title: o.title,
        text: o.text,
        verticalButtons: o.buttons.length > 2,
        buttons: o.buttons.map((b) => ({ text: b.text, bold: b.bold, onClick: () => resolve(b.value) })),
      })
      .open();
  });
}

/**
 * The guarded flow on screen: explanation with « Exporter d'abord ce carnet », the second confirmation, the name,
 * then the replacement. Resolves with what happened.
 * @param {{ file: string, data: { path: string }, fileName: string, several?: { count: number, main: string }|null }} what
 *   `file` is what the diver sees (the file's name), `fileName` the name the core reads the format from, `data` the
 *   logbook as a staged file in the app's cache (deleted here whatever the outcome)
 * @returns {Promise<'cancelled'|'replaced'|'failed'>}
 */
export async function startReplace(what) {
  const logbookName = openLogbookName();
  try {
    return await replaceFlow(what, logbookName);
  } finally {
    await OpenDivesCore.discardImport({ path: what.data.path }).catch(() => {});
  }
}

/**
 * @param {{ file: string, data: { path: string }, fileName: string, several?: { count: number, main: string }|null }} what
 * @param {string} logbookName
 */
function replaceFlow(what, logbookName) {
  return runReplace(
    {
      explain: async ({ logbook: current, file, pending, exported }) =>
        /** @type {'export'|'replace'|'cancel'} */ (
          await ask({
            title: t('replace.title', { logbook: current }),
            text: [
              t('replace.text', { logbook: current, file }),
              what.several ? t('replace.several', what.several) : '',
              pending > 0 ? t('replace.pending', { n: pending }) : '',
              exported ? t('replace.exported') : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
            buttons: [
              { text: t('dialog.cancel'), value: 'cancel' },
              { text: t('replace.exportFirst'), value: 'export', bold: !exported },
              { text: t('replace.action'), value: 'replace', bold: exported },
            ],
          })
        ),
      exportCurrent: exportOpenLogbook,
      confirmRemoval: async ({ logbook: current, pending }) =>
        (await ask({
          title: t('replace.confirmTitle'),
          text: t(pending > 0 ? 'replace.confirmPending' : 'replace.confirmText', { logbook: current, n: pending }),
          buttons: [
            { text: t('dialog.cancel'), value: 'no' },
            { text: t('replace.confirmAction'), value: 'yes', bold: true },
          ],
        })) === 'yes',
      askName: (suggested) =>
        new Promise((resolve) => {
          f7.dialog.prompt(
            t('replace.nameText'),
            t('replace.nameTitle'),
            (value) => resolve(sanitiseLogbookName(value) || sanitiseLogbookName(suggested) || t('welcomeSteps.defaultName')),
            () => resolve(null),
            sanitiseLogbookName(suggested) || t('welcomeSteps.defaultName'),
          );
        }),
      replace: (name, data) => replaceDeviceLogbook(name, data, what.fileName),
      done: (name, n) => showSnackbar(t('replace.done', { name, n })),
      failed: (e) => {
        const code = String(/** @type {any} */ (e)?.message ?? '');
        console.error('Replace the logbook', code);
        f7.dialog.create({ title: t('replace.failedTitle'), text: t(code.startsWith('NO_DIVES') || code.startsWith('NO_NEW') ? 'replace.failedNoDives' : importErrorKey(code) === 'logbook.importFailed' ? 'replace.failed' : importErrorKey(code)), buttons: [{ text: t('dialog.ok') }] }).open();
      },
    },
    { logbook: logbookName, file: what.file, data: what.data, pending: logbook.pending },
  );
}
