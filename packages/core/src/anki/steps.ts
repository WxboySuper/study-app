/**
 * Anki's learning step arithmetic, ported to TypeScript.
 *
 * Original Rust: rslib/src/scheduler/states/steps.rs
 * Copyright: Ankitects Pty Ltd and contributors
 * License: GNU AGPL, version 3 or later.
 *
 * `remaining` is Anki's `remaining_steps`: the number of steps that are
 * still to come. The index of the current step is inferred from it, which is
 * what makes a queue rebuild (or a session resumed from a saved state)
 * arrive at the same step as the original session.
 */

const DAY_SECONDS = 60 * 60 * 24;

/** Converts Anki's minutes to seconds. */
function toSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

/** If a delay is longer than a day, round it to whole days. */
function maybeRoundInDays(seconds: number): number {
  if (seconds <= DAY_SECONDS) {
    return seconds;
  }
  return Math.round(seconds / DAY_SECONDS) * DAY_SECONDS;
}

/** The list of learning steps, in minutes. */
export class LearningSteps {
  private readonly steps: readonly number[];

  constructor(steps: readonly number[]) {
    this.steps = steps;
  }

  get length(): number {
    return this.steps.length;
  }

  get isEmpty(): boolean {
    return this.steps.length === 0;
  }

  /** Strips the "learning today" marker and clamps the index. */
  private indexFor(remaining: number): number {
    const total = this.steps.length;
    return Math.max(0, total - Math.max(0, Math.floor(remaining % 1000)));
  }

  private secondsAt(index: number): number | undefined {
    const value = this.steps[index];
    return value === undefined ? undefined : toSeconds(value);
  }

  /** `Again` always goes back to the first step. */
  againDelaySeconds(): number | undefined {
    return this.secondsAt(0);
  }

  /** The delay of `Hard`: the current step, or a step between the first two. */
  hardDelaySeconds(remaining: number): number | undefined {
    const index = this.indexFor(remaining);
    const current = this.secondsAt(index) ?? this.secondsAt(0);
    if (current === undefined) {
      return undefined;
    }
    if (index !== 0) {
      return current;
    }
    const next = this.secondsAt(1);
    if (next !== undefined) {
      return maybeRoundInDays(Math.trunc((current + next) / 2));
    }
    const longest = Math.min(Math.trunc((current * 3) / 2), current + DAY_SECONDS);
    return maybeRoundInDays(longest);
  }

  /** The delay of `Good`: the next step, or `undefined` when it graduates. */
  goodDelaySeconds(remaining: number): number | undefined {
    return this.secondsAt(this.indexFor(remaining) + 1);
  }

  /** The delay of the current step. */
  currentDelaySeconds(remaining: number): number {
    return this.secondsAt(this.indexFor(remaining)) ?? 0;
  }

  /** The remaining steps after a `Good`. */
  remainingForGood(remaining: number): number {
    return Math.max(0, this.steps.length - (this.indexFor(remaining) + 1));
  }

  /** The remaining steps after `Again`. */
  remainingForFailed(): number {
    return this.steps.length;
  }
}
