import type { SessionStage } from '@study-app/core';

/** Anki's colours for the three queues. */
export const STAGE_COLORS: Record<SessionStage, string> = {
  new: '#60a5fa',
  learning: '#f87171',
  review: '#4ade80',
};

/** The labels of the three queues. */
export const STAGE_LABELS: Record<SessionStage, string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Due',
};
