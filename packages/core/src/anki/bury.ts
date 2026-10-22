/**
 * Sibling burying, following Anki's burying rules.
 *
 * Anki buries the other cards of a note when one of its cards is shown, so
 * the player does not see two versions of the same fact in a row. The game
 * builds one question per note, so sibling keys are optional; when two
 * questions share one (for example two cards generated from the same note),
 * they are buried together for the session.
 *
 * Original Anki file: rslib/src/scheduler/queue/builder/burying.rs
 * Copyright: Ankitects Pty Ltd and contributors
 * License: GNU AGPL, version 3 or later.
 */

import type { AnkiCard } from './types';

/** Every card id that shares a sibling key with `id`. */
export function siblingIds(
  cards: Readonly<Record<string, AnkiCard>>,
  id: string,
): string[] {
  const key = cards[id]?.siblingKey;
  if (key === undefined) {
    return [];
  }

  return Object.values(cards)
    .filter((card) => card.siblingKey === key)
    .map((card) => card.id);
}

/** Adds the siblings of a shown card to the buried list. */
export function burySiblings(
  cards: Readonly<Record<string, AnkiCard>>,
  id: string,
  buried: readonly string[],
): string[] {
  const next = [...buried];

  for (const sibling of siblingIds(cards, id)) {
    if (sibling !== id && !next.includes(sibling)) {
      next.push(sibling);
    }
  }

  return next;
}
