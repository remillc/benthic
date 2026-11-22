// SPDX-License-Identifier: GPL-2.0
// Minimal CDP client for the audit (Node global WebSocket and fetch, no dependency).
export const PORT = Number(process.env.CDP_PORT || 9391);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function pages() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  return list.filter((p) => p.type === 'page');
}

export class Page {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) for (const l of this.listeners) l(m);
    });
  }
  static async attach(index = 0) {
    const p = (await pages())[index];
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    return new Page(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(fn) { this.listeners.push(fn); }
  async eval(expression, awaitPromise = true) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async metrics() {
    const { metrics } = await this.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  }
  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(file, Buffer.from(data, 'base64'));
  }
  close() { this.ws.close(); }
}

/** Attaches to the page that shows the logbook window (the one holding .bc-desktop-logbook), waiting for it. */
export async function attachLogbook(ms = 300000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const list = await pages();
      for (let i = 0; i < list.length; i++) {
        const p = await Page.attach(i);
        try { if (await p.eval(`!!document.querySelector('.bc-desktop-logbook--row')`)) return p; } catch { /* not ready */ }
        p.close();
      }
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error('logbook window not found');
}
