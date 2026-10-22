/**
 * The in-session scheduler, ported from the design of Anki's scheduler.
 *
 * Anki (github.com/ankitects/anki) is licensed AGPL-3.0; see `LICENSE` and
 * `NOTICE` in this folder. The code here is an original TypeScript
 * implementation of the same concepts (new/learning/review queues, learning
 * and relearning steps, sibling burying, new/review mixing), adapted to a
 * game that counts questions instead of minutes.
 */

export {
  DEFAULT_ANKI_SETTINGS,
  ankiCardFromState,
  learningGapQuestions,
  reviewGapQuestions,
  type AnkiAnswerResult,
  type AnkiCard,
  type AnkiQueue,
  type AnkiRecord,
  type AnkiSettings,
} from './types';

export { LearningSteps } from './steps';
export { Intersperser } from './intersperser';
export { answerAnkiCard, fsrsIntervalDays, Rating, type AnkiAnswerContext } from './scheduler';
export {
  buildAnkiQueues,
  pickNextAnki,
  removeAnkiCard,
  requeueAnkiCard,
  type AnkiPick,
  type AnkiPickGroup,
  type AnkiQueues,
} from './queue';
export { burySiblings, siblingIds } from './bury';
