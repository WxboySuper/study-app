import {
  mathSources,
  plainText,
  type FishingFeedback,
  type FishingQuestion,
  type MasteryStatus,
} from '@study-app/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { artFor } from '@/content/art';
import { MathText } from '@/math/MathText';
import { fonts, radius } from '@/theme';
import { GameButton, Particles } from '@/ui';

/**
 * The question of the fishing mode (docs/design/fishing.md §4).
 *
 * The card lives *inside* the scene: a parchment note and four chunky,
 * coloured answer tiles. The tiles follow Blooket's order (orange, blue,
 * green, red) with a darker bottom edge, so the answer gate feels like a
 * game board instead of a quiz.
 *
 * A correct answer shows a green banner, turns the picked tile green with a
 * ✓ and greys the others out with a ✗. A wrong answer shows a red banner,
 * keeps the right answer green and counts the three second lockout down;
 * the tap that follows it is what makes the fish get away.
 *
 * A card without wrong answers of its own cannot be asked as a multiple
 * choice question: the note shows the question alone, the player taps to
 * reveal the answer and then grades itself ("Got it" / "Missed it").
 *
 * The answers are never cut off: a long answer gets a tile of its own width
 * (one column) and a smaller font, and the math of a question is drawn with
 * KaTeX.
 */
export interface QuestionNoteProps {
  /** `true` while the question is on the screen. */
  visible: boolean;
  /** The question that is asked. */
  question: FishingQuestion | null;
  /** The feedback of the last answer. */
  feedback: FishingFeedback | null;
  /**
   * `true` while the answer is held on the screen.
   *
   * The answers cannot be pressed and the note lets the taps through, so
   * a tap anywhere goes on.
   */
  locked?: boolean;
  /** When the wrong-answer lockout ends (epoch milliseconds). */
  lockoutUntil?: number | null;
  /** The mastery state of the card that is on the screen. */
  mastery?: MasteryStatus;
  /**
   * The streak of the card toward mastery ("Mastery 2/3"), shown by the dev
   * pill in mastery mode. `null` hides it.
   */
  masteryStreak?: { correct: number; required: number } | null;
  /** Called when the player picks an answer. */
  onAnswer: (choiceIndex: number) => void;
  /** Called when the player grades a self-graded card. */
  onSelfGrade?: (gotIt: boolean) => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

/**
 * An answer longer than this makes the tiles a single column.
 *
 * The tiles of a 2x2 board are wide enough for a short answer only: a long
 * one needs the whole width of the screen.
 */
const LONG_ANSWER_CHARS = 24;

/** The font size of the answer tiles. */
const ANSWER_FONT = 16;

/** How much the font shrinks when the answer is long. */
const FONT_STEP = 2;

/**
 * The dev pill of mastery mode: the streak of the current question toward
 * mastery. Flip to `false` (or delete it and the pill) to remove it.
 */
export const SHOW_MASTERY_DEV_PILL = true;

/** The Blooket colours of the four tiles, with their darker bottom edge. */
const TILE_COLORS = [
  { face: '#f5a623', edge: '#b87400' },
  { face: '#2f80ed', edge: '#1c4f96' },
  { face: '#1fbf75', edge: '#0b7a45' },
  { face: '#eb4335', edge: '#a3221c' },
] as const;

/** The colours of the feedback states. */
const FEEDBACK_COLORS = {
  good: '#1fbf75',
  goodEdge: '#0b7a45',
  bad: '#eb4335',
  badEdge: '#a3221c',
  muted: '#64748b',
  mutedEdge: '#3f4a5c',
} as const;

export function QuestionNote({
  visible,
  question,
  feedback,
  locked = false,
  lockoutUntil = null,
  mastery = 'unknown',
  masteryStreak = null,
  onAnswer,
  onSelfGrade,
  reduceMotion,
}: QuestionNoteProps) {
  const { height: windowHeight } = useWindowDimensions();
  const slide = useSharedValue(0);
  // The answer of a self-graded card is hidden until the player asks for it.
  const [revealed, setRevealed] = useState(false);
  // The clock of the wrong-answer lockout.
  const [clock, setClock] = useState(() => Date.now());
  // The trigger of the confetti burst of a correct answer.
  const [burst, setBurst] = useState(0);
  // The parchment of the question card (the art of the UI piece).
  const parchment = artFor('ui_parchment_note');
  // The size of the content box of the note: the art is stretched past it.
  const [noteSize, setNoteSize] = useState<{ width: number; height: number } | null>(null);
  const onNoteLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setNoteSize((current) =>
      current !== null &&
      Math.abs(current.width - width) < 1 &&
      Math.abs(current.height - height) < 1
        ? current
        : { width, height },
    );
  }, []);

  // Every new question starts hidden again.
  useEffect(() => {
    setRevealed(false);
  }, [question?.cardId]);

  useEffect(() => {
    if (reduceMotion) {
      slide.value = visible ? 1 : 0;
      return;
    }

    slide.value = visible
      ? withSpring(1, { damping: 16, stiffness: 130 })
      : withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) });
  }, [visible, reduceMotion, slide]);

  // The lockout is on: count the seconds down (and refresh the clock when it
  // starts, so a tap on a new wrong answer never shows a stale number).
  useEffect(() => {
    if (!locked || feedback?.correct !== false || lockoutUntil === null) {
      return undefined;
    }

    setClock(Date.now());
    const timer = setInterval(() => {
      setClock(Date.now());
    }, 200);

    return () => {
      clearInterval(timer);
    };
  }, [locked, feedback?.correct, lockoutUntil]);

  useEffect(() => {
    if (feedback?.correct === true) {
      setBurst((current) => current + 1);
    }
  }, [feedback]);

  const noteStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ translateY: (1 - slide.value) * 60 }],
  }));

  if (!visible || question === null) {
    return null;
  }

  const fontSize = promptFontSize(question.prompt);
  const promptMaxHeight = Math.max(100, Math.min(210, windowHeight * 0.24));

  // The answers decide the layout of the tiles: a long answer needs the
  // whole width of the screen and a smaller font.
  const layout = answerLayout(question.choices);
  const secondsLeft =
    lockoutUntil === null ? 0 : Math.max(0, Math.ceil((lockoutUntil - clock) / 1000));

  const badge = (
    <>
      <MasteryBadge status={mastery} />
      {SHOW_MASTERY_DEV_PILL && masteryStreak !== null ? (
        <View testID="mastery-dev-pill" style={styles.devPill}>
          <Text style={styles.devPillText}>
            Mastery {masteryStreak.correct}/{masteryStreak.required}
          </Text>
        </View>
      ) : null}
    </>
  );

  const body = (
    <>
      <View style={styles.noteHead}>
        <View style={styles.pin} />
        <Text style={styles.noteLabel}>STUDY NOTE</Text>
      </View>

      <ScrollView
        style={[styles.promptScroll, { maxHeight: promptMaxHeight }]}
        contentContainerStyle={styles.promptContent}
        showsVerticalScrollIndicator={false}
      >
        <MathText
          text={question.prompt}
          style={[styles.prompt, { fontSize, lineHeight: Math.round(fontSize * 1.24) }]}
          color="#3b2a12"
          fontSize={fontSize}
          center
        />
        {question.bonus ? <Text style={styles.bonus}>bonus review</Text> : null}
      </ScrollView>
    </>
  );

  // A card without wrong answers: the player reveals the answer and grades
  // itself.
  if (question.selfGrade) {
    return (
      <View style={styles.area} pointerEvents={locked ? 'none' : 'box-none'}>
        <View style={styles.noteTop}>{badge}</View>

        <Animated.View style={[styles.noteWrap, noteStyle]} pointerEvents="box-none">
          {parchment === null ? (
            <View style={[styles.note, styles.notePlain]}>{body}</View>
          ) : (
            <View style={styles.note} onLayout={onNoteLayout}>
              {noteSize === null ? null : (
                <Image
                  source={parchment}
                  resizeMode="stretch"
                  style={[styles.noteImage, parchmentFrame(noteSize)]}
                />
              )}
              {body}
            </View>
          )}
        </Animated.View>

        <View style={styles.answers} pointerEvents="box-none">
          {revealed ? (
            <>
              <ScrollView
                style={styles.revealScroll}
                contentContainerStyle={styles.revealContent}
              >
                <MathText
                  text={question.answer}
                  style={styles.revealAnswer}
                  color="#3b2a12"
                  fontSize={layout.fontSize + 3}
                  center
                />
              </ScrollView>
              {feedback === null ? (
                <View style={styles.gradeRow}>
                  <View style={styles.gradeButton}>
                    <GameButton
                      label="GOT IT"
                      variant="primary"
                      size="md"
                      onPress={() => {
                        onSelfGrade?.(true);
                      }}
                      accessibilityLabel="I knew the answer"
                    />
                  </View>
                  <View style={styles.gradeButton}>
                    <GameButton
                      label="MISSED IT"
                      variant="danger"
                      size="md"
                      onPress={() => {
                        onSelfGrade?.(false);
                      }}
                      accessibilityLabel="I did not know the answer"
                    />
                  </View>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.gradeButton}>
              <GameButton
                label="SHOW THE ANSWER"
                variant="secondary"
                size="md"
                onPress={() => {
                  setRevealed(true);
                }}
                accessibilityLabel="Show the answer"
              />
            </View>
          )}
        </View>
      </View>
    );
  }

  const showFeedback = feedback !== null && !feedback.retry;

  return (
    <View style={styles.area} pointerEvents={locked ? 'none' : 'box-none'}>
      <View style={styles.noteTop}>{badge}</View>

      <Animated.View style={[styles.noteWrap, noteStyle]} pointerEvents="box-none">
        {parchment === null ? (
          <View style={[styles.note, styles.notePlain]}>{body}</View>
        ) : (
          <View style={styles.note} onLayout={onNoteLayout}>
            {noteSize === null ? null : (
              <Image
                source={parchment}
                resizeMode="stretch"
                style={[styles.noteImage, parchmentFrame(noteSize)]}
              />
            )}
            {body}
          </View>
        )}
      </Animated.View>

      {showFeedback ? (
        <View
          style={[
            styles.feedbackBanner,
            feedback.correct ? styles.feedbackGood : styles.feedbackBad,
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.feedbackText}>
            {feedback.correct
              ? '✓  CORRECT!  TAP TO REEL'
              : secondsLeft > 0
                ? `✗  WRONG — WAIT ${secondsLeft} SECOND${secondsLeft === 1 ? '' : 'S'}`
                : '✗  WRONG — TAP TO CONTINUE'}
          </Text>
        </View>
      ) : null}

      <View style={styles.answers} pointerEvents="box-none">
        {question.choices.slice(0, 4).map((choice, index) => (
          <AnswerTile
            key={`${index}-${choice}`}
            label={choice}
            index={index}
            feedback={feedback}
            locked={locked}
            fontSize={layout.fontSize}
            wide={layout.columns === 1}
            onPress={() => {
              onAnswer(index);
            }}
          />
        ))}
      </View>

      {feedback?.correct === true && !reduceMotion ? (
        <Particles
          trigger={burst}
          count={34}
          colors={['#f5a623', '#2f80ed', '#1fbf75', '#eb4335', '#ffffff']}
          size={11}
          distance={210}
          gravity={280}
          duration={1200}
          style={styles.confetti}
        />
      ) : null}
    </View>
  );
}

/** The small mastery badge of the card that is on the screen. */
function MasteryBadge({ status }: { status: MasteryStatus }) {
  const meta = useMemo(() => {
    switch (status) {
      case 'mastered':
        return { label: 'Mastered', color: '#fbbf24', dot: '#f59e0b' };
      case 'familiar':
        return { label: 'Familiar', color: '#7dd3fc', dot: '#38bdf8' };
      default:
        return { label: 'Unknown', color: '#cbd5e1', dot: '#94a3b8' };
    }
  }, [status]);

  return (
    <View
      style={styles.masteryBadge}
      accessible
      accessibilityLabel={`Mastery: ${meta.label}`}
    >
      <View style={[styles.masteryDot, { backgroundColor: meta.dot }]} />
      <Text style={[styles.masteryText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

/**
 * The font size of the question.
 *
 * The prompt gets smaller as it gets longer, and a prompt with math gets
 * smaller again: KaTeX cannot break a formula across two lines, so a long
 * formula has to fit in the width of the parchment on its own. A very long
 * prompt scrolls instead of being cut off.
 */
function promptFontSize(prompt: string): number {
  const math = mathSources(prompt).join(' ').length;
  const weight = prompt.length + math * 2;

  if (weight > 300) {
    return 12;
  }
  if (weight > 200) {
    return 13;
  }
  if (weight > 140) {
    return 14;
  }
  if (weight > 90) {
    return 16;
  }
  return 19;
}

/**
 * The layout of the answer tiles.
 *
 * A short answer gets a 2x2 grid. An answer longer than
 * {@link LONG_ANSWER_CHARS} characters gets a tile of its own (one column),
 * and the font shrinks a step for every 60 extra characters.
 *
 * The length of an answer with math is the length of its text plus the
 * length of its LaTeX: a long formula is a long answer too.
 */
function answerLayout(choices: readonly string[]): { columns: 1 | 2; fontSize: number } {
  let longest = 0;

  for (const choice of choices) {
    longest = Math.max(longest, answerLength(choice));
  }

  let fontSize = ANSWER_FONT;
  if (longest > 60) {
    fontSize -= FONT_STEP;
  }
  if (longest > 120) {
    fontSize -= FONT_STEP;
  }

  return { columns: longest > LONG_ANSWER_CHARS ? 1 : 2, fontSize: Math.max(11, fontSize) };
}

/** How long an answer is: its text plus its LaTeX. */
function answerLength(answer: string): number {
  return plainText(answer).length + mathSources(answer).join(' ').length;
}

interface AnswerTileProps {
  label: string;
  index: number;
  feedback: FishingFeedback | null;
  /** `true` while the answer is held on the screen. */
  locked: boolean;
  /** The size of the label, in points. */
  fontSize: number;
  /** `true` when the tile takes the whole width (a long answer). */
  wide: boolean;
  onPress: () => void;
}

/**
 * One answer: a chunky coloured tile with a darker bottom edge.
 *
 * The four tiles keep Blooket's colours until the answer comes in. Then the
 * right answer turns green with a ✓, and (after a correct answer) every
 * other tile turns grey with a ✗ so the board reads at a glance.
 */
function AnswerTile({
  label,
  index,
  feedback,
  locked,
  fontSize,
  wide,
  onPress,
}: AnswerTileProps) {
  const answered = feedback !== null && !feedback.retry;
  const isCorrect = feedback !== null && answered && index === feedback.answerIndex;
  const isWrong =
    feedback !== null && answered && !feedback.correct && index === feedback.choiceIndex;
  const correctAnswer = feedback !== null && feedback.correct;
  const palette = TILE_COLORS[index % TILE_COLORS.length]!;

  let face: string = palette.face;
  let edge: string = palette.edge;
  let mark: string | null = null;

  if (answered) {
    if (isCorrect) {
      face = FEEDBACK_COLORS.good;
      edge = FEEDBACK_COLORS.goodEdge;
      mark = '✓';
    } else if (correctAnswer) {
      face = FEEDBACK_COLORS.muted;
      edge = FEEDBACK_COLORS.mutedEdge;
      mark = '✗';
    } else if (isWrong) {
      face = FEEDBACK_COLORS.bad;
      edge = FEEDBACK_COLORS.badEdge;
      mark = '✗';
    } else {
      face = FEEDBACK_COLORS.muted;
      edge = FEEDBACK_COLORS.mutedEdge;
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled: locked || (feedback !== null && !feedback.retry),
        selected: isCorrect,
      }}
      disabled={locked || (feedback !== null && !feedback.retry)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.answer,
        wide ? styles.answerWide : null,
        { backgroundColor: face, borderBottomColor: edge },
        answered && !isCorrect && !isWrong ? styles.answerDimmed : null,
        pressed && !(locked || answered) ? styles.answerPressed : null,
      ]}
    >
      <View style={styles.answerRow}>
        <View style={styles.answerLabelWrap}>
          <MathText
            text={label}
            style={[styles.answerLabel, { fontSize }]}
            color="#ffffff"
            fontSize={fontSize}
            center
          />
        </View>
        {mark === null ? null : (
          <Text style={styles.markText} pointerEvents="none">
            {mark}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/**
 * The frame of the parchment art around a content box.
 *
 * The art is a square with a torn, transparent margin (about 14-18 % at the
 * top and 13 % at the bottom). It is stretched past the box so the solid
 * paper covers the whole box whatever its height: the text never sits on the
 * transparent edge, however tall the question is.
 */
function parchmentFrame(size: { width: number; height: number }) {
  const art = size.height / 0.66;
  return { width: size.width, top: -art * 0.19, height: art };
}

const styles = StyleSheet.create({
  area: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  noteTop: {
    width: '100%',
    maxWidth: 520,
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  masteryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(8, 16, 34, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  masteryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  devPill: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#1e293b',
  },
  devPillText: {
    color: '#f8fafc',
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  masteryText: {
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  noteWrap: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    // Room for the torn margin of the art drawn past the content box.
    marginTop: 26,
    marginBottom: 20,
  },
  note: {
    width: '100%',
    maxWidth: 520,
    minHeight: 96,
    // The parchment art has a transparent, torn border (roughly a tenth of
    // its width on each side): the inner padding has to clear it, or the
    // text ends up on the ragged edge of the paper.
    paddingLeft: 52,
    paddingRight: 52,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 6,
    // The paper grows with its content; nothing is clipped.
    overflow: 'visible',
  },
  noteImage: {
    position: 'absolute',
    left: 0,
    borderRadius: 14,
  },
  notePlain: {
    borderRadius: 14,
    backgroundColor: '#f4e3b2',
  },
  noteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#8d5b34',
  },
  noteLabel: {
    color: '#7a5a2e',
    fontFamily: fonts.titleSemi,
    fontSize: 9,
    letterSpacing: 2,
  },
  promptScroll: {
    width: '100%',
    flexGrow: 0,
  },
  promptContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  prompt: {
    width: '100%',
    color: '#3b2a12',
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
    flexShrink: 1,
  },
  bonus: {
    marginTop: 4,
    color: '#6b4f22',
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    fontStyle: 'italic',
  },
  feedbackBanner: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radius.chip,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackGood: {
    backgroundColor: FEEDBACK_COLORS.good,
    borderBottomWidth: 5,
    borderBottomColor: FEEDBACK_COLORS.goodEdge,
  },
  feedbackBad: {
    backgroundColor: FEEDBACK_COLORS.bad,
    borderBottomWidth: 5,
    borderBottomColor: FEEDBACK_COLORS.badEdge,
  },
  feedbackText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 13,
    letterSpacing: 0.8,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.28)',
    textShadowRadius: 3,
  },
  answers: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  answer: {
    position: 'relative',
    width: '48%',
    flexGrow: 1,
    minHeight: 74,
    borderRadius: 12,
    borderBottomWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  answerWide: {
    width: '100%',
    flexGrow: 0,
  },
  answerDimmed: {
    opacity: 0.72,
  },
  answerPressed: {
    transform: [{ translateY: 4 }],
    borderBottomWidth: 4,
  },
  answerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  answerLabelWrap: {
    flexShrink: 1,
  },
  answerLabel: {
    color: '#ffffff',
    fontFamily: fonts.title,
    letterSpacing: 0.6,
    textAlign: 'center',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.24)',
    textShadowRadius: 3,
  },
  markText: {
    flexShrink: 0,
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 19,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 4,
  },
  revealScroll: {
    width: '100%',
    maxHeight: 130,
  },
  revealContent: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  revealAnswer: {
    color: '#3b2a12',
    fontFamily: fonts.title,
    fontSize: 20,
    textAlign: 'center',
  },
  gradeRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  gradeButton: {
    flex: 1,
    justifyContent: 'center',
  },
  confetti: {
    ...StyleSheet.absoluteFill,
  },
});
