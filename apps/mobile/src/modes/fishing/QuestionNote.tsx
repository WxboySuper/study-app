import {
  mathSources,
  plainText,
  type FishingFeedback,
  type FishingQuestion,
} from '@study-app/core';
import { useEffect, useState } from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { artFor } from '@/content/art';
import { MathText } from '@/math/MathText';
import { colors, fonts, radius } from '@/theme';
import { GameButton, Particles } from '@/ui';

/**
 * The question of the fishing mode (docs/design/fishing.md §4).
 *
 * The card lives *inside* the scene: a parchment note slides up from the
 * water and the answers sit below it as chunky buttons. The right answer
 * flashes green with a burst of sparks, the wrong one flashes red.
 *
 * After the answer the note stays on the screen for a moment: the answer
 * the player picked and the right answer keep their colours, so the card
 * can be reread. The buttons are switched off while the answer is held.
 *
 * A card without wrong answers of its own cannot be asked as a multiple
 * choice question: the note shows the question alone, the player taps to
 * reveal the answer and then grades itself ("Got it" / "Missed it").
 *
 * The answers are never cut off: a long answer gets a button of its own
 * width (one column) and a smaller font, and the math of a question is
 * drawn with KaTeX.
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
  /** Called when the player picks an answer. */
  onAnswer: (choiceIndex: number) => void;
  /** Called when the player grades a self-graded card. */
  onSelfGrade?: (gotIt: boolean) => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

/**
 * An answer longer than this makes the buttons a single column.
 *
 * The buttons of a 2x2 grid are wide enough for a short answer only: a long
 * one needs the whole width of the screen.
 */
const LONG_ANSWER_CHARS = 24;

/** The font size of the answer buttons. */
const ANSWER_FONT = 15;

/** How much the font shrinks when the answer is long. */
const FONT_STEP = 2;

export function QuestionNote({
  visible,
  question,
  feedback,
  locked = false,
  onAnswer,
  onSelfGrade,
  reduceMotion,
}: QuestionNoteProps) {
  const slide = useSharedValue(0);
  // The answer of a self-graded card is hidden until the player asks for it.
  const [revealed, setRevealed] = useState(false);
  // The parchment of the question card (the art of the UI piece).
  const parchment = artFor('ui_parchment_note');

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

  const noteStyle = useAnimatedStyle(() => ({
    opacity: slide.value,
    transform: [{ translateY: (1 - slide.value) * 60 }],
  }));

  const dimStyle = useAnimatedStyle(() => ({ opacity: slide.value * 0.35 }));

  if (!visible || question === null) {
    return null;
  }

  const fontSize = question.prompt.length > 140 ? 15 : question.prompt.length > 70 ? 17 : 19;

  // The answers decide the layout of the buttons: a long answer needs the
  // whole width of the screen and a smaller font.
  const layout = answerLayout(question.choices);

  const body = (
    <>
      <View style={styles.noteHead}>
        <View style={styles.pin} />
        <Text style={styles.noteLabel}>STUDY NOTE</Text>
      </View>

      <ScrollView style={styles.promptScroll} contentContainerStyle={styles.promptContent}>
        <MathText
          text={question.prompt}
          style={[styles.prompt, { fontSize }]}
          color="#3b2a12"
          fontSize={fontSize}
        />
        {question.bonus ? <Text style={styles.bonus}>bonus review</Text> : null}
      </ScrollView>
    </>
  );

  // A card without wrong answers: the player reveals the answer and grades
  // itself.
  if (question.selfGrade) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents={locked ? 'none' : 'box-none'}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} pointerEvents="none" />

        <Animated.View style={[styles.noteWrap, noteStyle]} pointerEvents="box-none">
          {parchment === null ? (
            <View style={[styles.note, styles.notePlain]}>{body}</View>
          ) : (
            <ImageBackground
              source={parchment}
              resizeMode="stretch"
              style={styles.note}
              imageStyle={styles.noteImage}
            >
              {body}
            </ImageBackground>
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
                  color="#fff8e7"
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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={locked ? 'none' : 'box-none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} pointerEvents="none" />

      <Animated.View style={[styles.noteWrap, noteStyle]} pointerEvents="box-none">
        {parchment === null ? (
          <View style={[styles.note, styles.notePlain]}>{body}</View>
        ) : (
          <ImageBackground
            source={parchment}
            resizeMode="stretch"
            style={styles.note}
            imageStyle={styles.noteImage}
          >
            {body}
          </ImageBackground>
        )}
      </Animated.View>

      <View style={styles.answers} pointerEvents="box-none">
        {question.choices.slice(0, 4).map((choice, index) => (
          <AnswerButton
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
    </View>
  );
}

/**
 * The layout of the answer buttons.
 *
 * A short answer gets a 2x2 grid. An answer longer than
 * {@link LONG_ANSWER_CHARS} characters gets a button of its own (one
 * column), and the font shrinks a step for every 60 extra characters.
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

interface AnswerButtonProps {
  label: string;
  index: number;
  feedback: FishingFeedback | null;
  /** `true` while the answer is held on the screen. */
  locked: boolean;
  /** The size of the label, in points. */
  fontSize: number;
  /** `true` when the button takes the whole width (a long answer). */
  wide: boolean;
  onPress: () => void;
}

/** One answer: a chunky button that flashes when it is right or wrong. */
function AnswerButton({
  label,
  index,
  feedback,
  locked,
  fontSize,
  wide,
  onPress,
}: AnswerButtonProps) {
  const [burst, setBurst] = useState(0);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  const press = useSharedValue(0);

  const isCorrect = feedback !== null && index === feedback.answerIndex;
  const isWrong = feedback !== null && !feedback.correct && index === feedback.choiceIndex;
  const answered = feedback !== null;

  useEffect(() => {
    if (feedback === null) {
      shake.value = 0;
      flash.value = 0;
      return;
    }

    if (isWrong) {
      shake.value = withSequence(
        withTiming(-8, { duration: 55 }),
        withTiming(8, { duration: 55 }),
        withTiming(-4, { duration: 55 }),
        withTiming(0, { duration: 55 }),
      );
    }

    if (isCorrect || isWrong) {
      flash.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 520 }),
      );
      setBurst((current) => current + 1);
    }
  }, [feedback, isCorrect, isWrong, shake, flash]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { scale: 1 - press.value * 0.04 }],
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value * 0.85,
  }));

  return (
    <Animated.View style={[styles.answer, wide === true ? styles.answerWide : null, shakeStyle]}>
      <GameButton
        variant={answered ? 'ghost' : 'primary'}
        size="md"
        wrap
        disabled={locked || (answered && !feedback.retry)}
        onPress={onPress}
        textStyle={[styles.answerLabel, { fontSize }]}
        accessibilityLabel={label}
      >
        <MathText
          text={label}
          style={[styles.answerLabel, { fontSize }]}
          color="#ffffff"
          fontSize={fontSize}
          center
        />
      </GameButton>

      {/*
        The colour of the answer: it stays on the screen while the answer is
        held, so the player can reread the card.
      */}
      {isCorrect ? <View style={[styles.tint, styles.tintGood]} pointerEvents="none" /> : null}
      {isWrong ? <View style={[styles.tint, styles.tintBad]} pointerEvents="none" /> : null}
      {isCorrect ? <View style={[styles.outline, styles.outlineGood]} pointerEvents="none" /> : null}
      {isWrong ? <View style={[styles.outline, styles.outlineBad]} pointerEvents="none" /> : null}

      {isCorrect ? (
        <>
          <Animated.View style={[styles.flash, styles.flashGood, flashStyle]} pointerEvents="none" />
          <View style={styles.markGood} pointerEvents="none">
            <Text style={styles.markText}>✓</Text>
          </View>
          <Particles
            trigger={burst}
            count={16}
            colors={['#86efac', '#22c55e', '#ffffff']}
            size={10}
            distance={110}
            gravity={240}
            duration={800}
            style={styles.burst}
          />
        </>
      ) : null}

      {isWrong ? (
        <>
          <Animated.View style={[styles.flash, styles.flashBad, flashStyle]} pointerEvents="none" />
          <View style={styles.markBad} pointerEvents="none">
            <Text style={styles.markText}>✗</Text>
          </View>
          <Particles
            trigger={burst}
            count={14}
            colors={['#fda4af', '#ef476f', '#ffffff']}
            size={9}
            distance={100}
            gravity={260}
            duration={800}
            style={styles.burst}
          />
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: '#000000',
  },
  noteWrap: {
    position: 'absolute',
    top: '13%',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  note: {
    width: '100%',
    maxWidth: 560,
    height: 300,
    paddingLeft: 56,
    paddingRight: 18,
    paddingTop: 42,
    paddingBottom: 24,
    gap: 8,
  },
  noteImage: {
    borderRadius: 14,
  },
  notePlain: {
    borderRadius: 14,
    backgroundColor: '#f4e3b2',
  },
  noteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8d5b34',
  },
  noteLabel: {
    color: '#7a5a2e',
    fontFamily: fonts.titleSemi,
    fontSize: 10,
    letterSpacing: 2,
  },
  promptScroll: {
    maxHeight: 140,
  },
  promptContent: {
    paddingVertical: 2,
  },
  prompt: {
    color: '#3b2a12',
    fontFamily: fonts.bodyBold,
    lineHeight: 25,
  },
  bonus: {
    marginTop: 6,
    color: '#6b4f22',
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    fontStyle: 'italic',
  },
  answers: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 26,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  answer: {
    width: '48%',
    flexGrow: 1,
    justifyContent: 'center',
  },
  answerWide: {
    width: '100%',
    flexGrow: 0,
  },
  answerLabel: {
    fontFamily: fonts.title,
    letterSpacing: 1,
    fontSize: 15,
    textAlign: 'center',
    flexShrink: 1,
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
    color: '#fff8e7',
    fontFamily: fonts.title,
    fontSize: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(4, 10, 24, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  tint: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.button,
  },
  tintGood: {
    backgroundColor: 'rgba(34, 197, 94, 0.22)',
  },
  tintBad: {
    backgroundColor: 'rgba(239, 71, 111, 0.22)',
  },
  outline: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.button,
    borderWidth: 3,
  },
  outlineGood: {
    borderColor: '#4ade80',
  },
  outlineBad: {
    borderColor: '#fb7185',
  },
  flash: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.button,
  },
  flashGood: {
    backgroundColor: colors.success,
  },
  flashBad: {
    backgroundColor: colors.danger,
  },
  markGood: {
    position: 'absolute',
    right: 8,
    top: 4,
  },
  markBad: {
    position: 'absolute',
    right: 8,
    top: 4,
  },
  markText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 20,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  burst: {
    top: -20,
    bottom: -20,
  },
});
