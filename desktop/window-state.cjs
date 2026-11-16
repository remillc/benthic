// SPDX-License-Identifier: GPL-2.0
// The window's size and place, remembered between starts (a file in the app's data folder).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { screen } = require('electron');

const FILE = 'window-state.json';
const DEFAULT = { width: 1440, height: 900, maximized: false };

/**
 * @param {string} dir the app's data folder
 * @returns {{width: number, height: number, x?: number, y?: number, maximized: boolean}}
 */
function load(dir) {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
    // A place on a screen no longer connected is dropped: the window opens centred.
    const visible =
      typeof saved.x === 'number' &&
      screen.getAllDisplays().some(({ workArea: a }) => saved.x >= a.x - 50 && saved.y >= a.y - 50 && saved.x < a.x + a.width && saved.y < a.y + a.height);
    return {
      width: Math.max(768, saved.width || DEFAULT.width),
      height: Math.max(560, saved.height || DEFAULT.height),
      ...(visible ? { x: saved.x, y: saved.y } : {}),
      maximized: !!saved.maximized,
    };
  } catch {
    return { ...DEFAULT };
  }
}

/**
 * Saves the window's bounds when it moves, is resized or closes.
 * @param {import('electron').BrowserWindow} win
 * @param {string} dir
 */
function track(win, dir) {
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const maximized = win.isMaximized();
      const bounds = maximized ? win.getNormalBounds() : win.getBounds();
      try {
        fs.writeFileSync(path.join(dir, FILE), JSON.stringify({ ...bounds, maximized }));
      } catch {
        // Not remembered this time; the next change tries again.
      }
    }, 300);
  };
  win.on('resize', save);
  win.on('move', save);
  win.on('close', save);
}

module.exports = { load, track };
