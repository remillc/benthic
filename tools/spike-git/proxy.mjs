// Local proxy in front of Forgejo: adds CORS (Forgejo has none), serves the browser harness on the same port, and
// delays each request and response by half of an artificial round trip time (node proxy.mjs <port> <rttMs>).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const port = Number(process.argv[2] ?? 3100), rtt = Number(process.argv[3] ?? 0);
const target = new URL(process.env.OD_FORGEJO ?? 'http://127.0.0.1:3000');
const agent = new http.Agent({ keepAlive: true });
const sleep = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : null);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,git-protocol,accept', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': '*' };
const webDir = path.resolve(import.meta.dirname, '../../build/spike-git/web');
http.createServer(async (req, res) => {
  if (req.url.startsWith('/__web/')) {
    const f = path.join(webDir, req.url.slice(7).split('?')[0] || 'index.html');
    if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404); return res.end();
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  await sleep(rtt / 2);
  const p = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host }, agent }, async (pr) => {
    await sleep(rtt / 2);
    res.writeHead(pr.statusCode, { ...pr.headers, ...cors });
    pr.pipe(res);
  });
  p.on('error', () => { res.writeHead(502); res.end(); });
  p.end(Buffer.concat(chunks));
}).listen(port, '127.0.0.1', () => console.log(`proxy on ${port}, rtt ${rtt} ms`));
