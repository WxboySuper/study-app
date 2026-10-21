import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import bite from '../../../assets/audio/fishing/bite.mp3';
import cast from '../../../assets/audio/fishing/cast.mp3';
import coin from '../../../assets/audio/fishing/coin.mp3';
import correct from '../../../assets/audio/fishing/correct.mp3';
import frenzy from '../../../assets/audio/fishing/frenzy.mp3';
import legend from '../../../assets/audio/fishing/legend.mp3';
import lure from '../../../assets/audio/fishing/lure.mp3';
import nibble from '../../../assets/audio/fishing/nibble.mp3';
import plop from '../../../assets/audio/fishing/plop.mp3';
import powerup from '../../../assets/audio/fishing/powerup.mp3';
import reel from '../../../assets/audio/fishing/reel.mp3';
import reveal from '../../../assets/audio/fishing/reveal.mp3';
import snap from '../../../assets/audio/fishing/snap.mp3';
import wrong from '../../../assets/audio/fishing/wrong.mp3';

/**
 * The sound effects of the fishing mode (docs/design/fishing.md §12).
 *
 * All the sounds are CC0 (see `assets/CREDITS.md`). They are short, so they
 * are played through a small pool of players that are created once and
 * rewound instead of being loaded again.
 */

/** Every sound of the mode. */
export type SfxId =
  | 'cast'
  | 'plop'
  | 'nibble'
  | 'bite'
  | 'reel'
  | 'snap'
  | 'correct'
  | 'wrong'
  | 'reveal'
  | 'legend'
  | 'lure'
  | 'coin'
  | 'frenzy'
  | 'powerup';

const SOURCES: Record<SfxId, number> = {
  cast,
  plop,
  nibble,
  bite,
  reel,
  snap,
  correct,
  wrong,
  reveal,
  legend,
  lure,
  coin,
  frenzy,
  powerup,
};

const players = new Map<SfxId, AudioPlayer>();
let enabled = true;
let configured = false;

function playerFor(id: SfxId): AudioPlayer | null {
  const existing = players.get(id);
  if (existing !== undefined) {
    return existing;
  }

  try {
    const player = createAudioPlayer(SOURCES[id]);
    player.volume = 0.7;
    players.set(id, player);
    return player;
  } catch {
    // The audio subsystem is not available (e.g. on the web): the mode simply
    // runs without sound.
    return null;
  }
}

/** Turns the sound of the mode on or off. */
export function setSfxEnabled(value: boolean): void {
  enabled = value;
}

/** Whether the sound of the mode is on. */
export function isSfxEnabled(): boolean {
  return enabled;
}

/** Plays a sound. Does nothing when the sound is off. */
export function playSfx(id: SfxId): void {
  if (!enabled) {
    return;
  }

  const player = playerFor(id);
  if (player === null) {
    return;
  }

  try {
    player.seekTo(0);
    player.play();
  } catch {
    // Never let a sound break the game.
  }
}

/** Plays a sound several times in a row (the coin roll of the payout). */
export function playSfxSequence(id: SfxId, times: number, gapMs = 90): void {
  if (!enabled) {
    return;
  }

  for (let index = 0; index < times; index += 1) {
    setTimeout(() => {
      playSfx(id);
    }, index * gapMs);
  }
}

/**
 * Loads the sounds and configures the audio session.
 *
 * The mode ducks the music of the player instead of stopping it, so the
 * sounds can be heard over whatever is playing.
 */
export async function prepareSfx(): Promise<void> {
  if (configured) {
    return;
  }
  configured = true;

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  } catch {
    // Ignore: the mode works without audio.
  }

  for (const id of Object.keys(SOURCES) as SfxId[]) {
    playerFor(id);
  }
}

/** Releases the players (called when the mode is left). */
export function releaseSfx(): void {
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      // Ignore.
    }
  }
  players.clear();
}
