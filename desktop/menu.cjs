// SPDX-License-Identifier: GPL-2.0
// The macOS menu bar (task 2026-11-15-169, section 6; docs/system-design.md, section 7).
// Each item sends a command to the interface, which acts as its own shortcut does (Undo
// in a text field undoes the typing, in the logbook the last change). Windows and Linux
// have no menu bar.
'use strict';

const { Menu } = require('electron');

/**
 * @param {any} texts the app's translations (app/src/i18n/<lang>.json)
 * @param {(command: string) => void} send
 * @returns {Menu}
 */
function buildMenu(texts, send) {
  const m = texts.desktop.macMenu;
  const item = (/** @type {string} */ label, /** @type {string} */ command, /** @type {string} */ accelerator = '') => ({
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => send(command),
  });
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = [
    {
      label: 'OpenDives',
      submenu: [
        item(m.about, 'about'),
        { type: 'separator' },
        item(m.settings, 'settings', 'Cmd+,'),
        { type: 'separator' },
        { role: 'services', label: m.services },
        { type: 'separator' },
        { role: 'hide', label: m.hide },
        { role: 'hideOthers', label: m.hideOthers },
        { role: 'unhide', label: m.showAll },
        { type: 'separator' },
        { role: 'quit', label: m.quit },
      ],
    },
    {
      label: m.file,
      submenu: [
        item(m.newDive, 'new', 'Cmd+N'),
        item(m.import, 'import', 'Cmd+O'),
        item(m.download, 'download'),
        { type: 'separator' },
        item(m.export, 'export', 'Shift+Cmd+E'),
        item(m.print, 'print', 'Cmd+P'),
      ],
    },
    {
      label: m.edit,
      submenu: [
        item(m.undo, 'undo', 'Cmd+Z'),
        item(m.redo, 'redo', 'Shift+Cmd+Z'),
        { type: 'separator' },
        { role: 'cut', label: m.cut },
        item(m.copy, 'copy', 'Cmd+C'),
        { role: 'paste', label: m.paste },
        item(m.selectAll, 'selectAll', 'Cmd+A'),
        item(m.delete, 'delete', 'Backspace'),
        { type: 'separator' },
        item(m.find, 'find', 'Cmd+F'),
      ],
    },
    {
      label: m.view,
      submenu: [
        item(m.logbook, 'section:logbook', 'Cmd+1'),
        item(m.sites, 'section:sites', 'Cmd+2'),
        item(m.statistics, 'section:statistics', 'Cmd+3'),
        item(m.tools, 'section:tools', 'Cmd+4'),
        { type: 'separator' },
        item(m.columns, 'columns'),
        { type: 'separator' },
        // « Taille du texte » (task 2026-11-15-202): the app's three sizes, not Chromium's free zoom.
        item(m.textBigger, 'text:bigger', 'Cmd+Plus'),
        item(m.textSmaller, 'text:smaller', 'Cmd+-'),
        item(m.textActual, 'text:actual', 'Cmd+0'),
        { type: 'separator' },
        { role: 'togglefullscreen', label: m.fullScreen },
      ],
    },
    {
      label: m.dive,
      submenu: [item(m.editDive, 'edit', 'Cmd+E'), item(m.merge, 'merge'), item(m.split, 'split'), item(m.addToTrip, 'addToTrip')],
    },
    { role: 'windowMenu', label: m.window },
    { role: 'help', label: m.help, submenu: [item(m.helpAbout, 'about')] },
  ];
  return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
