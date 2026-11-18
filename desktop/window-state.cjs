// SPDX-License-Identifier: GPL-2.0
// The window's size and place, remembered between starts (a file in the app's data folder).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
// Electron's `screen` is read when needed, so that `clamp` can be tested without Electron.
const screen = () => require('electron').screen;

const FILE = 'window-state.json';
const DEFAULT = { width: 1440, height: 900, maximized: false };

/**
 * A remembered window that fits the screen it opens on: never taller or wider than the work area (the part of the
 * display the task bar and the menu bar leave), and never placed so that its bottom or its right edge falls
 * outside it. A window saved on a larger screen, or one that was bigger than the work area, would otherwise open
 * with its bottom cut off, and with it the account button at the foot of the rail.
 * @param {{width: number, height: number, x?: number, y?: number}} state
 * @param {{x: number, y: number, width: number, height: number}[]} areas the displays' work areas, the main one first
 */
function clamp(state, areas) {
  const placed = typeof state.x === 'number' && typeof state.y === 'number';
  const area = (placed && areas.find((a) => state.x >= a.x - 50 && state.y >= a.y - 50 && state.x < a.x + a.width && state.y < a.y + a.height)) || areas[0];
  if (!area) return state;
  const width = Math.min(state.width, area.width);
  const height = Math.min(state.height, area.height);
  if (!placed) return { ...state, width, height };
  const x = Math.min(Math.max(state.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(state.y, area.y), area.y + area.height - height);
  return { ...state, width, height, x, y };
}

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
      screen().getAllDisplays().some(({ workArea: a }) => saved.x >= a.x - 50 && saved.y >= a.y - 50 && saved.x < a.x + a.width && saved.y < a.y + a.height);
    const areas = workAreas();
    const state = clamp(
      {
        width: Math.max(768, saved.width || DEFAULT.width),
        height: Math.max(560, saved.height || DEFAULT.height),
        ...(visible ? { x: saved.x, y: saved.y } : {}),
      },
      areas,
    );
    return { ...state, maximized: !!saved.maximized };
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

/** The work areas of the connected displays, the one under the pointer's main display first. */
function workAreas() {
  const main = screen().getPrimaryDisplay().id;
  return screen()
    .getAllDisplays()
    .sort((a, b) => Number(b.id === main) - Number(a.id === main))
    .map((d) => d.workArea);
}

module.exports = { load, track, clamp, workAreas };
