// @ts-check
// The dialogs of « Remplacer ce carnet » (decided on 18 November 2026) and the export it offers first. The flow
// itself is lib/replace-logbook.js; the core call is replaceDeviceLogbook (lib/logbook.svelte.js).
import { f7 } from 'framework7-svelte';
import { Share } from '@capacitor/share';
import { BenthicCore } from 'benthic-core';
import { logbook, replaceDeviceLogbook } from './logbook.svelte.js';
import { deviceStore } from './device-store.js';
import { sanitiseLogbookName, logbookExportName, localDay } from './logbook-name.js';
import { runBenthicImport } from './benthic-import.svelte.js';
import { BenthicImportError } from './benthic-import.js';
import { replaceContents } from './benthic-import-text.js';
import { formatNumber } from './format.js';
import { desktopApp } from './layout.svelte.js';
import { exportFile } from './share.js';
import { importErrorKey } from './deep-link.js';
import { replaceEligibility, runReplace } from './replace-logbook.js';
import { showSnackbar } from './snackbar.js';
import { t } from './i18n.js';

/** The open logbook's name on this device. */
export const openLogbookName = () => deviceStore.getItem('bc.logbookName') || t('welcomeSteps.defaultName');

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
  await BenthicCore.grantShareFile({ uri, mime });
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
    await BenthicCore.discardImport({ path: what.data.path }).catch(() => {});
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

/**
 * The dialog of a .benthic file that cannot be imported: incomplete (the red banner's words), from a newer version, or not
 * a file Benthic can read. Nothing was imported.
 * @param {string} fileName
 * @param {unknown} error
 */
export function benthicProblemDialog(fileName, error) {
  const e = error instanceof BenthicImportError ? error : null;
  if (e && (e.code === 'INCOMPLETE' || e.code === 'TOO_NEW')) {
    const text = e.code === 'TOO_NEW' ? t('benthicImport.tooNew', { file: fileName }) : e.bad ? t('benthicImport.incompleteText', { file: fileName, n: e.bad.length }) : t('benthicImport.incompleteCut', { file: fileName });
    f7.dialog.create({ title: t('benthicImport.incompleteTitle'), text, buttons: [{ text: t('dialog.ok') }] }).open();
    return;
  }
  f7.dialog.create({ title: t('logbook.importTitle'), text: t('logbook.importFailed'), buttons: [{ text: t('dialog.ok') }] }).open();
}

/**
 * « Remplacer ce carnet ? » for a .benthic file (task 2026-11-23-360): the open logbook leaves this device and the file's
 * logbook, equipment, profile and certifications take its place. The dialog offers « Exporter d’abord ce carnet »; « Remplacer »
 * opens the progress at once. The import verifies every file first and writes only when all of it succeeded: a failure or a
 * cancel leaves the open logbook as it was. Only a logbook of this device is replaceable (`replaceEligibility`); the logbook of
 * an account is never deleted or overwritten from a file.
 * @param {File} file
 * @param {import('./benthic-import.js').Inspection} inspection
 * @returns {Promise<'cancelled'|'replaced'|'failed'>}
 */
export async function startBenthicReplace(file, inspection) {
  const eligibility = replaceEligibility(logbook);
  const current = openLogbookName();
  if (eligibility !== 'ok') {
    await ask({ title: t('benthicImport.replace.title'), text: t(`link.replace_${eligibility}`), buttons: [{ text: t('dialog.ok'), value: 'ok', bold: true }] });
    return 'cancelled';
  }
  const personal = t(desktopApp ? 'benthicImport.replace.personalDesktop' : 'benthicImport.replace.personal');
  const contents = replaceContents(inspection.counts, t, (n) => formatNumber(n));
  return runReplace(
    {
      explain: async ({ pending, exported }) =>
        /** @type {'export'|'replace'|'cancel'} */ (
          await ask({
            title: t('benthicImport.replace.title'),
            text: [
              t('benthicImport.replace.text', { logbook: current, dives: t('welcomeSteps.summaryDives', { n: logbook.dives.length }), file: file.name, contents }),
              inspection.sensitive ? personal : '',
              pending > 0 ? t('replace.pending', { n: pending }) : '',
              exported ? t('replace.exported') : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
            buttons: [
              { text: t('replace.exportFirst'), value: 'export', bold: !exported },
              { text: t('dialog.cancel'), value: 'cancel' },
              { text: t('replace.action'), value: 'replace', bold: exported },
            ],
          })
        ),
      exportCurrent: exportOpenLogbook,
      // The dialog already said what leaves; no second question and no name step: the file's name is the logbook's.
      confirmRemoval: async () => true,
      askName: async (suggested) => sanitiseLogbookName(suggested) || t('welcomeSteps.defaultName'),
      replace: async (name) => {
        const result = await runBenthicImport(inspection, {
          fileName: file.name,
          overlay: true,
          applyLogbook: async (staged) => {
            // A file without a logbook leaves the dives of this device alone.
            if (staged) await replaceDeviceLogbook(name, { path: staged.path }, 'logbook.ssrf');
          },
        });
        if (result.skipped) showSnackbar(t('benthicImport.mediaSkipped', { n: result.skipped }));
        return result.dives;
      },
      done: (name, n) => showSnackbar(t(n ? 'benthicImport.done' : 'benthicImport.doneNoDives', { name, n })),
      failed: (e) => {
        if (e instanceof BenthicImportError && e.code === 'CANCELLED') return void showSnackbar(t('benthicImport.cancelled'));
        if (e instanceof BenthicImportError && (e.code === 'INCOMPLETE' || e.code === 'TOO_NEW')) return benthicProblemDialog(file.name, e);
        const code = e instanceof BenthicImportError ? e.code : String(/** @type {any} */ (e)?.message ?? '');
        console.error('Replace from a .benthic file', code, /** @type {any} */ (e)?.cause?.message ?? '');
        f7.dialog.create({ title: t('benthicImport.failedTitle'), text: t(code === 'BAD_LOGBOOK' ? 'benthicImport.badLogbook' : 'benthicImport.failed'), buttons: [{ text: t('dialog.ok') }] }).open();
      },
    },
    { logbook: current, file: file.name, data: { path: '' }, pending: logbook.pending },
  );
}
