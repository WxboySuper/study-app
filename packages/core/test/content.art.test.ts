import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CRITTERS } from '../src/content/critters';
import { HEAVY } from '../src/content/heavy';
import { JUNK } from '../src/content/junk';
import { POWERUPS, SPECIALS } from '../src/content/specials';

/**
 * The art of the game is resolved by the app (`apps/mobile/src/content/art.ts`).
 *
 * Every entry of a registry has an art key: the file name of its PNG. When
 * the PNG is missing, the app falls back to the placeholder of the type of the
 * entry, so the game never shows an empty hole. This test keeps the two
 * sides in sync: every art key of the registries is either in the map of the
 * app (and its PNG exists) or it is on the list of the art that is still to
 * be drawn.
 */

/** The art that is not drawn yet (the entry falls back to its placeholder). */
const ART_PENDING: readonly string[] = [
  'catch_heavy_void_fish',
  'junk_pumpkin_carving',
  'junk_snowy_mittens',
];

/** The root of the repository (the test lives in `packages/core/test`). */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** The file of the art resolver of the app. */
const ART_FILE = `${ROOT}apps/mobile/src/content/art.ts`;

interface ArtEntry {
  /** The art key (the file name of the PNG). */
  id: string;
  /** The path of the PNG, relative to the assets folder of the app. */
  path: string;
}

/** Reads the art map of the app out of the source file. */
function readArtMap(): ArtEntry[] {
  const source = readFileSync(ART_FILE, 'utf8');
  const entries: ArtEntry[] = [];
  const pattern = /^\s*([a-z0-9_]+):\s*require\('([^']+)'\),$/gm;

  let match = pattern.exec(source);
  while (match !== null) {
    entries.push({ id: match[1] ?? '', path: match[2] ?? '' });
    match = pattern.exec(source);
  }

  return entries;
}

describe('the art of the registries', () => {
  const artMap = readArtMap();
  const artIds = new Set(artMap.map((entry) => entry.id));

  it('finds the art map of the app', () => {
    expect(artMap.length).toBeGreaterThan(0);
    expect(artIds.has('critter_gigabrain_golem')).toBe(true);
  });

  it('resolves every art key of the registries or falls back', () => {
    const assetIds = [
      ...CRITTERS.map((entry) => entry.assetId),
      ...JUNK.map((entry) => entry.assetId),
      ...SPECIALS.map((entry) => entry.assetId),
      ...POWERUPS.map((entry) => entry.assetId),
      ...HEAVY.map((entry) => entry.assetId),
    ];

    for (const assetId of assetIds) {
      const resolved = artIds.has(assetId) || ART_PENDING.includes(assetId);
      expect(resolved, `the art key "${assetId}" has no PNG and is not pending`).toBe(true);
    }
  });

  it('has a PNG for every key of the art map', () => {
    for (const entry of artMap) {
      const path = `${ROOT}apps/mobile/${entry.path.replace('../../', '')}`;
      expect(existsSync(path), `${entry.id} points at a missing file`).toBe(true);
    }
  });

  it('has an art key for every heavy catch but the void fish', () => {
    for (const heavy of HEAVY) {
      if (heavy.id === 'void_fish') {
        expect(ART_PENDING).toContain(heavy.assetId);
        continue;
      }
      expect(artIds.has(heavy.assetId)).toBe(true);
    }
  });
});
