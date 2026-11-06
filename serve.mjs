// Serves this folder at http://localhost:8004/ . Run: node serve.mjs (or npm run serve)
// Shell Lab uses 8000/8001, the GROMACS visualizer 8002, the BindCraft2 visualizer 8003,
// so all four can run at once.
//
// POST /api/text    saves the page text from the dashboard (admin.html) to data/text.json,
//                   after copying the old file to data/backups/.
// POST /api/runs    saves the run registry to data/runs.json, the same way.
// POST /api/publish commits data/text.json and data/runs.json and pushes (only once this
//                   folder is a git repo with a remote; until then it reports what it would do).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 8004;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.csv': 'text/plain', '.cif': 'text/plain', '.pdb': 'text/plain',
  '.yaml': 'text/plain', '.yml': 'text/plain', '.txt': 'text/plain', '.log': 'text/plain',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};

const run = (cmd, args) => new Promise((res, rej) =>
  execFile(cmd, args, { cwd: root, timeout: 120000 }, (e, out, err) => (e ? rej(new Error(err || out || String(e))) : res(String(out)))));

async function body(req, res, limit = 4e6) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > limit) { res.writeHead(413).end(); return null; } }
  return s;
}

// Save a data file, keeping a timestamped backup of the old one.
async function saveData(req, res, file, validate) {
  const raw = await body(req, res);
  if (raw === null) return;
  let data;
  try { data = JSON.parse(raw); } catch { res.writeHead(400).end('Not JSON'); return; }
  const bad = validate(data);
  if (bad) { res.writeHead(400).end(bad); return; }
  const target = join(root, file);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = 'data/backups';
  await mkdir(join(root, dir), { recursive: true });
  const backup = `${dir}/${file.split('/').pop().replace(/\.json$/, '')}-${stamp}.json`;
  await copyFile(target, join(root, backup)).catch(() => {});
  await writeFile(target, JSON.stringify(data, null, 1) + '\n');
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, backup }));
}

const flatStrings = d => (!d || typeof d !== 'object' || Array.isArray(d) || !Object.values(d).every(v => typeof v === 'string')
  ? 'Expected an object of strings' : null);
const isObject = d => (!d || typeof d !== 'object' || Array.isArray(d) ? 'Expected an object' : null);

async function publish(req, res) {
  const files = ['data/text.json', 'data/runs.json'];
  try {
    await run('git', ['rev-parse', '--is-inside-work-tree']);
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ ok: false, pending: true, message: 'This folder is not a git repo yet, so there is nothing to push. Saved locally.' }));
    return;
  }
  try {
    await run('git', ['add', ...files]);
    const status = await run('git', ['status', '--porcelain', ...files]);
    if (!status.trim()) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, message: 'Nothing to publish: the saved text is already pushed.' }));
      return;
    }
    await run('git', ['commit', '-m', 'Update site text from the dashboard']);
    const branch = (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    await run('git', ['push', '-u', 'origin', branch]);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, message: `Pushed to ${branch}.` }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, message: String(e.message || e) }));
  }
}

createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/text') return void await saveData(req, res, 'data/text.json', flatStrings);
    if (req.method === 'POST' && req.url === '/api/runs') return void await saveData(req, res, 'data/runs.json', isObject);
    if (req.method === 'POST' && req.url === '/api/publish') return void await publish(req, res);
  } catch (e) {
    res.writeHead(500).end(String(e));
    return;
  }
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': (TYPES[extname(file)] || 'application/octet-stream') + '; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`RFD4 Visualizer: http://localhost:${port}/`));
