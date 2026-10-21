import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const distDir = '/home/devrun/work/study-app-feat-ui-redesign-2-1792623994/apps/mobile/dist/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const candidate = join(distDir, normalize(decodeURIComponent(url.pathname)));
  if (candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream' });
    createReadStream(candidate).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  void readFile(join(distDir, 'index.html')).then((b) => res.end(b));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

for (const route of process.argv.slice(2)) {
  await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(route.includes('demo=spin') ? 7000 : 2500);
  console.log(`=== ${route}`);
  console.log((await page.innerText('body')).slice(0, 400));
  await page.screenshot({ path: `/tmp/opencode/shot${route.replace(/[^a-z0-9]/gi, '_')}.png` });
}

await browser.close();
server.close();
