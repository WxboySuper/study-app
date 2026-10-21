import { CRITTERS, type CritterDef } from '@study-app/core';
import type { ImageSourcePropType } from 'react-native';

/**
 * The art of the critters (apps/mobile/assets/critters).
 *
 * Metro turns an import of an image into a `require()`, so the map of the
 * sprites has to be written out: the bundler cannot build it at runtime.
 * Every critter of the catalogue has a PNG, and the emoji of the critter is
 * the fallback when one is missing.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- Metro needs static require() for images */
export const CRITTER_ART: Readonly<Record<string, ImageSourcePropType>> = {
  critter_bat_ter_up: require('../../assets/critters/critter_bat_ter_up.png'),
  critter_candy_corn_kid: require('../../assets/critters/critter_candy_corn_kid.png'),
  critter_captain_cram: require('../../assets/critters/critter_captain_cram.png'),
  critter_count_flashula: require('../../assets/critters/critter_count_flashula.png'),
  critter_doodle_moth: require('../../assets/critters/critter_doodle_moth.png'),
  critter_ghost_of_finals_past: require('../../assets/critters/critter_ghost_of_finals_past.png'),
  critter_gigabrain_golem: require('../../assets/critters/critter_gigabrain_golem.png'),
  critter_gummy_eraser: require('../../assets/critters/critter_gummy_eraser.png'),
  critter_headless_homework_horseman: require('../../assets/critters/critter_headless_homework_horseman.png'),
  critter_mnemo_the_memory_jelly: require('../../assets/critters/critter_mnemo_the_memory_jelly.png'),
  critter_mummy_wrapped_up: require('../../assets/critters/critter_mummy_wrapped_up.png'),
  critter_nibbles_the_notecard: require('../../assets/critters/critter_nibbles_the_notecard.png'),
  critter_pip_pencil: require('../../assets/critters/critter_pip_pencil.png'),
  critter_professor_hoot_n_holler: require('../../assets/critters/critter_professor_hoot_n_holler.png'),
  critter_pumpkin_pupil: require('../../assets/critters/critter_pumpkin_pupil.png'),
  critter_recall_raccoon: require('../../assets/critters/critter_recall_raccoon.png'),
  critter_sir_highlighter: require('../../assets/critters/critter_sir_highlighter.png'),
  critter_synapse_sprite: require('../../assets/critters/critter_synapse_sprite.png'),
  critter_the_spaced_ranger: require('../../assets/critters/critter_the_spaced_ranger.png'),
  critter_the_witching_hour_owl: require('../../assets/critters/critter_the_witching_hour_owl.png'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** The art of a critter, or `null` when the PNG is missing. */
export function critterArt(critter: CritterDef): ImageSourcePropType | null {
  return CRITTER_ART[critter.assetId] ?? null;
}

/** How many critters of the catalogue have their art. */
export const CRITTERS_WITH_ART: number = CRITTERS.filter(
  (critter) => CRITTER_ART[critter.assetId] !== undefined,
).length;
