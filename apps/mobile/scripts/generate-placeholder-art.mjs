#!/usr/bin/env node
/**
 * Generates the placeholder images of the art resolver.
 *
 * Every content entry has an art key (the file name of its PNG). When the
 * image is missing, the resolver falls back to the placeholder of its type
 * (a critter, a junk item, a special or a fish). These placeholders are
 * drawn here, so they always exist and always look the same.
 *
 * ```bash
 * node scripts/generate-placeholder-art.mjs
 * ```
 *
 * The files land in `apps/mobile/assets/content/`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'assets', 'content');

const SIZE = 256;

/** The placeholder of every content type: the fill, the outline and the eye. */
const PLACEHOLDERS = {
  critter: { fill: [139, 92, 246], outline: [59, 7, 100], eye: [30, 27, 75] },
  junk: { fill: [141, 110, 99], outline: [69, 39, 36], eye: [30, 27, 75] },
  special: { fill: [34, 211, 238], outline: [14, 116, 144], eye: [30, 27, 75] },
  fish: { fill: [30, 136, 229], outline: [13, 71, 161], eye: [30, 27, 75] },
  // The deep end of the lake: a deep sea teal with a gold belly.
  heavy: { fill: [13, 148, 136], outline: [4, 47, 46], eye: [253, 230, 138] },
};

/* -------------------------------------------------------------------------
 * A tiny PNG encoder (8 bit RGBA, no interlacing)
 * ---------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * Encodes RGBA pixels (a flat array of four bytes per pixel) as a PNG.
 */
function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(6, 9); // color type: RGBA
  header.writeUInt8(0, 10); // compression
  header.writeUInt8(0, 11); // filter
  header.writeUInt8(0, 12); // interlace

  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // the "none" filter
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------
 * The drawing
 * ---------------------------------------------------------------------- */

/** Whether a point is inside a circle. */
function inCircle(x, y, cx, cy, radius) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Draws the mascot of a type: a round body with an outline, a belly and two
 * eyes.
 */
function draw(colors) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const center = SIZE / 2;
  const radius = SIZE * 0.44;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const offset = (y * SIZE + x) * 4;
      let color = null;

      if (inCircle(x, y, center, center, radius)) {
        color = colors.outline;
      }
      if (inCircle(x, y, center, center, radius * 0.88)) {
        color = colors.fill;
      }
      // The belly is a lighter circle in the lower half.
      if (inCircle(x, y, center, center + radius * 0.18, radius * 0.55)) {
        color = colors.fill.map((value) => Math.min(255, Math.round(value * 1.25)));
      }
      // The eyes.
      for (const eyeX of [center - radius * 0.32, center + radius * 0.32]) {
        if (inCircle(x, y, eyeX, center - radius * 0.18, radius * 0.19)) {
          color = [255, 255, 255];
        }
        if (inCircle(x, y, eyeX, center - radius * 0.18, radius * 0.09)) {
          color = colors.eye;
        }
      }

      if (color === null) {
        continue;
      }

      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

mkdirSync(target, { recursive: true });

for (const [type, colors] of Object.entries(PLACEHOLDERS)) {
  const file = join(target, `placeholder_${type}.png`);
  writeFileSync(file, encodePng(SIZE, SIZE, draw(colors)));
  console.log(`Wrote ${file}`);
}
