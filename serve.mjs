/**
 * A tiny static server for previewing the sanctuary on your own machine.
 *
 *   node serve.mjs          →  http://localhost:8123
 *   (or just double-click start.cmd on Windows / start.sh elsewhere)
 *
 * You need this because browsers refuse to load JavaScript modules straight
 * from a folder — every file:// request counts as cross-origin, so the page
 * would never start. Once the site is on GitHub Pages none of this applies.
 *
 * Set OPEN=0 to stop it launching a browser window.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { exec } from 'node:child_process';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8123);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary'
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    if (p.includes('..')) throw new Error('bad path');
    const file = join(ROOT, normalize(p));
    const s = await stat(file);
    if (s.isDirectory()) throw new Error('dir');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  }
}).listen(PORT, () => {
  const url = 'http://localhost:' + PORT;
  console.log('');
  console.log('  Stark Museo is running at ' + url);
  console.log('  Leave this window open while you look around. Ctrl+C to stop.');
  console.log('');
  if (process.env.OPEN !== '0') {
    const open = process.platform === 'win32' ? 'start "" "' + url + '"'
               : process.platform === 'darwin' ? 'open "' + url + '"'
               : 'xdg-open "' + url + '"';
    exec(open, () => {});
  }
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use. Try:  PORT=8124 node serve.mjs');
  } else {
    console.error(e.message);
  }
  process.exit(1);
});
