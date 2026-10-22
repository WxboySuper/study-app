import { POWERUPS, findCritter, isCatchOutcome, type RolledCatch } from '@study-app/core';

/**
 * The art and the words of a catch.
 *
 * The scene and the reveal card show the same catch, so the helpers live
 * here: the sprite of the catch, its name and the line of flavour text
 * under it.
 */

/** The sprite of a catch. */
export function assetIdOf(landed: RolledCatch): string {
  switch (landed.kind) {
    case 'fish':
    case 'critter':
    case 'junk':
    case 'heavy':
      return landed.catch.assetId;
    case 'new_lure':
      return 'special_new_lure';
    case 'frenzy':
      return 'special_frenzy';
    case 'powerup':
      return POWERUPS.find((entry) => entry.id === landed.powerup)?.assetId ?? 'pu_double_hook';
    case 'pack_ticket':
      return 'special_pack_ticket';
  }
}

/** The name of a catch. */
export function nameOf(landed: RolledCatch): string {
  switch (landed.kind) {
    case 'fish':
    case 'critter':
    case 'junk':
    case 'heavy':
      return landed.catch.name;
    case 'new_lure':
      return 'New Lure!';
    case 'frenzy':
      return 'FRENZY!';
    case 'powerup':
      return POWERUPS.find((entry) => entry.id === landed.powerup)?.name ?? 'Powerup';
    case 'pack_ticket':
      return 'Pack Ticket!';
  }
}

/**
 * The caption of a catch: the joke of the silly catches and the vibe of the
 * critters.
 */
export function captionOf(landed: RolledCatch): string | undefined {
  if (landed.kind === 'critter') {
    const critter = findCritter(landed.critter.id);
    return critter?.vibe;
  }
  if (landed.kind === 'fish' || landed.kind === 'junk' || landed.kind === 'heavy') {
    return landed.catch.joke;
  }
  if (landed.kind === 'pack_ticket') {
    return 'One free Brain Buddies pack.';
  }
  if (landed.kind === 'frenzy') {
    return 'The next five catches come fast and heavy.';
  }
  return undefined;
}

/**
 * `true` when the catch is a critter.
 *
 * A critter catch is a catch like any other: it is never granted to the
 * collection (only a pack grants a critter).
 */
export function isCritterCatch(landed: RolledCatch): boolean {
  return isCatchOutcome(landed) && landed.kind === 'critter';
}
