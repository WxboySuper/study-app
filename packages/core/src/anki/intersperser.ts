/**
 * Anki's queue intersperser, ported to TypeScript.
 *
 * Original Rust: rslib/src/scheduler/queue/builder/intersperser.rs
 * Copyright: Ankitects Pty Ltd and contributors
 * License: GNU AGPL, version 3 or later.
 *
 * Anki mixes the review and new queues with this adapter, so the two kinds
 * of cards are spread evenly instead of one queue draining first. The
 * ratio is derived from the lengths of the two lists, which is why a deck
 * with many new cards and only a few reviews shows the new cards steadily.
 */

export class Intersperser<T> {
  private readonly one: readonly T[];
  private readonly two: readonly T[];
  private readonly ratio: number;
  private oneIndex = 0;
  private twoIndex = 0;

  constructor(one: readonly T[], two: readonly T[]) {
    this.one = one;
    this.two = two;
    this.ratio = (one.length + 1) / (two.length + 1);
  }

  /** The next item, or `undefined` when both lists are drained. */
  next(): T | undefined {
    const oneIndex = this.oneIndex < this.one.length ? this.oneIndex : undefined;
    const twoIndex = this.twoIndex < this.two.length ? this.twoIndex : undefined;

    if (oneIndex !== undefined && twoIndex !== undefined) {
      const relativeIndexTwo = (twoIndex + 1) * this.ratio;
      if (relativeIndexTwo < oneIndex + 1) {
        this.twoIndex += 1;
        return this.two[twoIndex];
      }
      this.oneIndex += 1;
      return this.one[oneIndex];
    }

    if (oneIndex !== undefined) {
      this.oneIndex += 1;
      return this.one[oneIndex];
    }

    if (twoIndex !== undefined) {
      this.twoIndex += 1;
      return this.two[twoIndex];
    }

    return undefined;
  }

  /** Collects the whole mixed list. */
  toArray(): T[] {
    const result: T[] = [];
    for (;;) {
      const value = this.next();
      if (value === undefined) {
        return result;
      }
      result.push(value);
    }
  }
}
