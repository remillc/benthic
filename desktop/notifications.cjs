// SPDX-License-Identifier: GPL-2.0
'use strict';
// The maintenance notifications on the desktop (task 2026-11-19-308). A system notification cannot be scheduled for a
// moment when the app is closed through Electron, so the renderer sends the list of what is to come ({ id, title, body,
// at (ms), extra }) and this module shows each one at its time while the app runs. Each window (one per logbook) has its
// own list: a new list replaces the window's previous one. A click gives the notification's `extra` back to the window.
// The check runs every 30 s: a timer for a date weeks away would not hold (the longest setTimeout is about 24 days).

const CHECK_MS = 30 * 1000;
/** A notification missed by more than this (the computer slept, the app was busy) is dropped, not shown late. */
const LATE_MS = 6 * 60 * 60 * 1000;

/**
 * @param {{ Notification: any, now?: () => number, setInterval?: typeof setInterval, clearInterval?: typeof clearInterval, onClick: (windowId: number, extra: unknown) => void }} deps
 */
function createNotifier({ Notification, now = Date.now, setInterval: every = setInterval, clearInterval: stop = clearInterval, onClick }) {
  /** @type {Map<number, { id: number, title: string, body: string, at: number, extra: unknown }[]>} */
  const lists = new Map();
  /** @type {any} */
  let timer = null;

  function check() {
    const t = now();
    for (const [windowId, list] of lists) {
      const due = list.filter((n) => n.at <= t);
      if (!due.length) continue;
      lists.set(windowId, list.filter((n) => n.at > t));
      for (const n of due) {
        if (t - n.at > LATE_MS) continue;
        if (Notification.isSupported && !Notification.isSupported()) continue;
        const note = new Notification({ title: n.title, body: n.body });
        note.on('click', () => onClick(windowId, n.extra));
        note.show();
      }
    }
    if (![...lists.values()].some((l) => l.length) && timer) {
      stop(timer);
      timer = null;
    }
  }

  return {
    /** Replaces the window's list. @param {number} windowId @param {unknown} notifications */
    schedule(windowId, notifications) {
      const list = (Array.isArray(notifications) ? notifications : [])
        .filter((n) => n && Number.isFinite(n.at) && typeof n.title === 'string')
        .map((n) => ({ id: Number(n.id) || 0, title: String(n.title), body: String(n.body ?? ''), at: Number(n.at), extra: n.extra ?? {} }));
      lists.set(windowId, list);
      if (list.length && !timer) {
        timer = every(check, CHECK_MS);
        if (timer && typeof timer.unref === 'function') timer.unref();
      }
      check();
    },
    /** A window closed: its list goes. @param {number} windowId */
    forget(windowId) {
      lists.delete(windowId);
    },
    /** What is waiting, for tests. @param {number} windowId */
    pending: (windowId) => (lists.get(windowId) ?? []).map((n) => n.id),
    check,
  };
}

module.exports = { createNotifier, CHECK_MS, LATE_MS };
