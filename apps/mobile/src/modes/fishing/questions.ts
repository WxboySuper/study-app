import { buildQuestionCards } from '@study-app/core';

/**
 * Builds the multiple choice questions of the mode.
 *
 * The rules live in `@study-app/core` (the choices of a card belong to the
 * card: the app never borrows the answers of the other cards of the set).
 * This module is the name the screens of the mode use.
 */
export { buildQuestionCards };
