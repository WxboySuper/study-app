#!/usr/bin/env node
/* global URL, document */
/**
 * The screenshots of the game.
 *
 * The script exports the web build of the app, serves it with a tiny static
 * server and photographs the screens with Playwright. The pictures land in
 * `docs/screenshots/` and are the fastest way to review a change of the look
 * of the game.
 *
 * ```
 * node scripts/screenshots.mjs            # build and shoot everything
 * node scripts/screenshots.mjs --no-build # reuse the export in apps/mobile/dist
 * ```
 */

import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mobileDir = join(root, 'apps', 'mobile');
const distDir = join(mobileDir, 'dist');
const outDir = join(root, 'docs', 'screenshots');

/** The size of the pictures (an iPhone 14 Pro in CSS pixels). */
const VIEWPORT = { width: 412, height: 915 };

/** The content types of the static server. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

/** Runs a command and waits for it. */
function run(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
    });
  });
}

/**
 * Serves the exported web build.
 *
 * Every path that is not a file falls back to `index.html`, so the client
 * side router of expo-router can handle the deep links.
 */
function serve(directory) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const candidate = join(directory, normalize(decodeURIComponent(url.pathname)));

    if (candidate.startsWith(directory) && existsSync(candidate) && statSync(candidate).isFile()) {
      response.writeHead(200, {
        'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      createReadStream(candidate).pipe(response);
      return;
    }

    response.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    void readFile(join(directory, 'index.html')).then((body) => {
      response.end(body);
    });
  });

  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolvePromise({ server, port });
    });
  });
}

/** Waits until the app of the page is ready. */
async function settle(page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root !== null && root.childElementCount > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  // The fonts, the gradients and the entrance animations need a moment.
  await page.waitForTimeout(1400);
}

/**
 * The screenshots of the script.
 *
 * `path` is the route of the screen, `waitFor` is the text that only shows
 * up in that state, `scrollTo` is the test id of the part of the screen the
 * camera has to look at, `actions` are the taps that happen before the
 * picture and `wait` is how long the screen needs after it.
 */
const SHOTS = [
  { name: 'home', path: '/' },
  { name: 'home-decks', path: '/', scrollTo: 'deck-picker', wait: 900 },
  { name: 'packs', path: '/packs' },
  { name: 'pack-reveal', path: '/packs?demo=reveal', waitFor: 'CONTINUE', wait: 2600 },
  {
    name: 'pack-open-another',
    path: '/packs?demo=reveal',
    waitFor: 'OPEN ANOTHER',
    actions: [{ click: 'OPEN ANOTHER' }],
    wait: 2800,
  },
  { name: 'collection', path: '/collection' },
  { name: 'collection-sheet', path: '/collection?demo=sheet', waitFor: 'SELL', wait: 1200 },
  { name: 'spin', path: '/spin' },
  { name: 'spin-spinning', path: '/spin?demo=spin', wait: 1800 },
  { name: 'spin-result', path: '/spin?demo=spin', waitFor: 'TOKENS', wait: 1600 },
  { name: 'fishing', path: '/fishing', wait: 600 },
  { name: 'fishing-question', path: '/fishing?demo=question', waitFor: 'STUDY NOTE', wait: 900 },
  { name: 'fishing-reveal', path: '/fishing?demo=reveal', waitFor: 'CONTINUE', wait: 1200 },
  { name: 'fishing-payout', path: '/fishing?demo=payout', waitFor: 'PLAY AGAIN', wait: 1400, timeout: 90_000 },
];

async function main() {
  const skipBuild = process.argv.includes('--no-build');

  if (!skipBuild) {
    console.log('› exporting the web build…');
    await run('npx', ['expo', 'export', '--platform', 'web', '--clear'], mobileDir);
  }

  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(`No web export found at ${distDir}. Run without --no-build.`);
  }

  mkdirSync(outDir, { recursive: true });

  const { server, port } = await serve(distDir);
  const base = `http://127.0.0.1:${port}`;
  console.log(`› serving ${distDir} on ${base}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });

  const errors = [];

  for (const shot of SHOTS) {
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      errors.push(`${shot.name}: ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(`${shot.name}: ${message.text()}`);
      }
    });

    await page.goto(`${base}${shot.path}`, { waitUntil: 'load' });
    await settle(page);

    if (shot.waitFor !== undefined) {
      await page.waitForFunction(
        (needle) => (document.body.innerText ?? '').includes(needle),
        shot.waitFor,
        { timeout: shot.timeout ?? 30_000 },
      );
    }

    // The camera looks at a part of the screen (the deck picker of the home
    // screen, for instance).
    if (shot.scrollTo !== undefined) {
      const target = page.locator(`[data-testid="${shot.scrollTo}"]`).first();
      if ((await target.count()) > 0) {
        await target.evaluate((node) => {
          node.scrollIntoView({ block: 'center', inline: 'center' });
        });
        await page.waitForTimeout(600);
      }
    }

    // The taps that happen before the picture (the "Open another" of the
    // pack shop, for instance).
    for (const action of shot.actions ?? []) {
      if (action.click !== undefined) {
        await page.getByText(action.click, { exact: false }).first().click();
        await page.waitForTimeout(400);
      }
    }

    if (shot.wait !== undefined) {
      await page.waitForTimeout(shot.wait);
    }

    await page.screenshot({ path: join(outDir, `${shot.name}.png`) });
    console.log(`› ${shot.name}.png`);
    await page.close();
  }

  await browser.close();
  server.close();

  if (errors.length > 0) {
    console.error('\nThe pages reported errors:');
    for (const error of errors) {
      console.error(`  • ${error}`);
    }
    process.exitCode = 1;
  }
}

await main();
