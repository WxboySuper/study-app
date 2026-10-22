import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * The sound of the game.
 *
 * Every moment of the game that makes a noise has a name: a tap, a cast, a
 * catch, a right answer, a coin, the tick of the wheel. The names live in
 * {@link SFX_REGISTRY}, which maps every event to the file that plays it.
 *
 * The registry is empty for now: every asset is `null`, so {@link play} is a
 * no-op and the game is silent until the sounds are added. Drop a file in
 * `assets/audio/` and point the event at it (see
 * `docs/ADDING-CONTENT.md`, "Adding a sound").
 *
 * The sounds of the fishing mode are separate: they are already there
 * (`src/modes/fishing/sfx.ts`) and they play their own files.
 */

/** Every sound event of the game. */
export type SfxEvent =
  /** A button, a card or a tile was pressed. */
  | 'tap'
  /** The line was thrown in the water. */
  | 'cast'
  /** A critter took the bait. */
  | 'hooked'
  /** The answer was right. */
  | 'correct'
  /** The answer was wrong. */
  | 'wrong'
  /** A critter was revealed. */
  | 'reveal'
  /** A rare critter was revealed. */
  | 'rare'
  /** A legendary critter was revealed. */
  | 'legendary'
  /** A coin was earned or spent. */
  | 'coin'
  /** The wheel passed a segment. */
  | 'spinTick'
  /** The wheel landed on a prize. */
  | 'spinWin'
  /** The pack is shaking, before it bursts. */
  | 'packShake'
  /** The pack bursts open. */
  | 'packBurst';

/** The file of a sound. */
export interface SfxAsset {
  /**
   * The Metro asset of the sound, or `null` when the sound has not been
   * added yet. A `null` asset means "play nothing".
   */
  source: number | null;
  /** The volume of the sound, between 0 and 1. */
  volume: number;
}

/**
 * The registry of the sounds.
 *
 * Every event of the game points at a file. All the files are `null` for
 * now, so nothing is played: the game is silent but the calls are already
 * everywhere it matters.
 */
export const SFX_REGISTRY: Record<SfxEvent, SfxAsset> = {
  tap: { source: null, volume: 0.5 },
  cast: { source: null, volume: 0.7 },
  hooked: { source: null, volume: 0.8 },
  correct: { source: null, volume: 0.7 },
  wrong: { source: null, volume: 0.7 },
  reveal: { source: null, volume: 0.7 },
  rare: { source: null, volume: 0.8 },
  legendary: { source: null, volume: 0.9 },
  coin: { source: null, volume: 0.6 },
  spinTick: { source: null, volume: 0.4 },
  spinWin: { source: null, volume: 0.8 },
  packShake: { source: null, volume: 0.6 },
  packBurst: { source: null, volume: 0.9 },
};

/** The players of the sounds, one per event. */
const players = new Map<SfxEvent, AudioPlayer>();

/**
 * Whether the game plays sounds.
 *
 * It is `false` until the player turns the sound on (the setting of the home
 * screen) and until the sounds are added.
 */
let enabled = false;

/** Whether the audio session is already configured. */
let configured = false;

/** Turns the sound of the game on or off. */
export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

/** Whether the game plays sounds. */
export function isSoundEnabled(): boolean {
  return enabled;
}

/** The player of an event, created the first time the sound is played. */
function playerFor(event: SfxEvent): AudioPlayer | null {
  const existing = players.get(event);
  if (existing !== undefined) {
    return existing;
  }

  const asset = SFX_REGISTRY[event];
  if (asset === undefined || asset.source === null) {
    return null;
  }

  try {
    const player = createAudioPlayer(asset.source);
    player.volume = asset.volume;
    players.set(event, player);
    return player;
  } catch {
    // The audio subsystem is not available (e.g. on the web): the game simply
    // runs without sound.
    return null;
  }
}

/**
 * Plays a sound.
 *
 * Does nothing when the sound is off, when the event has no file yet or when
 * the audio subsystem is not available: a sound never breaks the game.
 */
export function play(event: SfxEvent): void {
  if (!enabled) {
    return;
  }

  const asset = SFX_REGISTRY[event];
  if (asset === undefined || asset.source === null) {
    return;
  }

  void configure();

  const player = playerFor(event);
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
export function playSequence(event: SfxEvent, times: number, gapMs = 90): void {
  if (!enabled) {
    return;
  }

  for (let index = 0; index < times; index += 1) {
    setTimeout(() => {
      play(event);
    }, index * gapMs);
  }
}

/**
 * Configures the audio session.
 *
 * The sounds mix with whatever the player listens to, and they are allowed
 * to play in silent mode.
 */
export async function configure(): Promise<void> {
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
    // Ignore: the game works without audio.
  }
}

/** Releases the players (called when the app is closed). */
export function release(): void {
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      // Ignore.
    }
  }
  players.clear();
}
