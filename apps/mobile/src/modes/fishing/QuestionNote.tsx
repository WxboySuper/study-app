import type { FishingFeedback, FishingQuestion } from '@study-app/core';
import { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { fishingSprite } from './assets';

/**
 * The question of the fishing mode (docs/design/fishing.md §4).
 *
 * The card lives *inside* the scene: a parchment note unrolls from the taut
 * line above the water and the four answers hang from a rope at the bottom
 * of the screen as wooden lure tags. There is never a full screen quiz card.
 */

export interface QuestionNoteProps {
  /** `true` while the question is on the screen. */
  visible: boolean;
  /** The question that is asked. */
  question: FishingQuestion | null;
  /** The feedback of the last answer. */
  feedback: FishingFeedback | null;
  /** Called when the player picks an answer. */
  onAnswer: (choiceIndex: number) => void;
  /** `true` when the animations have to be reduced. */
  reduceMotion: boolean;
}

export function QuestionNote({ visible, question, feedback, onAnswer, reduceMotion }: QuestionNoteProps) {
  const unroll = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      unroll.value = visible ? 1 : 0;
      return;
    }

    unroll.value = visible
      ? withSpring(1, { damping: 14, stiffness: 120 })
      : withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) });
  }, [visible, reduceMotion, unroll]);

  const noteStyle = useAnimatedStyle(() => ({
    opacity: unroll.value,
    transform: [{ translateY: (1 - unroll.value) * -40 }, { scaleY: 0.6 + unroll.value * 0.4 }],
  }));

  const dimStyle = useAnimatedStyle(() => ({ opacity: unroll.value * 0.3 }));

  if (!visible || question === null) {
    return null;
  }

  const fontSize = question.prompt.length > 140 ? 16 : question.prompt.length > 70 ? 18 : 20;
  const parchment = fishingSprite('ui_parchment_note');

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} pointerEvents="none" />

      <Animated.View style={[styles.note, noteStyle]} pointerEvents="box-none">
        <View style={styles.paper}>
          {parchment === null ? null : (
            <Image source={parchment} resizeMode="stretch" style={styles.paperImage} />
          )}
          <ScrollView style={styles.promptScroll} contentContainerStyle={styles.promptContent}>
            <Text style={[styles.prompt, { fontSize }]}>{question.prompt}</Text>
            {question.bonus ? <Text style={styles.bonus}>bonus review</Text> : null}
          </ScrollView>
        </View>
      </Animated.View>

      <View style={styles.tags} pointerEvents="box-none">
        {question.choices.slice(0, 4).map((choice, index) => (
          <AnswerTag
            key={`${index}-${choice}`}
            label={choice}
            index={index}
            feedback={feedback}
            onPress={() => {
              onAnswer(index);
            }}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>
    </View>
  );
}

interface AnswerTagProps {
  label: string;
  index: number;
  feedback: FishingFeedback | null;
  onPress: () => void;
  reduceMotion: boolean;
}

function AnswerTag({ label, index, feedback, onPress, reduceMotion }: AnswerTagProps) {
  const press = useSharedValue(0);
  const shake = useSharedValue(0);

  const isCorrect = feedback !== null && index === feedback.answerIndex;
  const isWrong = feedback !== null && !feedback.correct && index === feedback.choiceIndex;

  useEffect(() => {
    if (feedback === null || reduceMotion) {
      shake.value = 0;
      return;
    }

    if (isWrong) {
      shake.value = withSequence(
        withTiming(-7, { duration: 55 }),
        withTiming(7, { duration: 55 }),
        withTiming(-4, { duration: 55 }),
        withTiming(0, { duration: 55 }),
      );
    }
  }, [feedback, isWrong, reduceMotion, shake]);

  const tagStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { scale: 1 - press.value * 0.06 }],
  }));

  const background = isCorrect
    ? '#2f9e44'
    : isWrong
      ? '#c92a2a'
      : feedback !== null
        ? 'rgba(87, 62, 40, 0.55)'
        : '#b08968';

  return (
    <Animated.View style={[styles.tagWrapper, tagStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        disabled={feedback !== null && !feedback.retry}
        onPressIn={() => {
          press.value = withTiming(1, { duration: 60 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 90 });
        }}
        style={({ pressed }) => [styles.tag, { backgroundColor: background }, pressed && styles.tagPressed]}
      >
        <View style={styles.hole} />
        <Text style={styles.tagLabel} numberOfLines={3}>
          {label}
        </Text>
        {isCorrect ? <Text style={styles.mark}>✓</Text> : null}
        {isWrong ? <Text style={styles.mark}>✗</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: '#000000',
  },
  note: {
    position: 'absolute',
    top: '12%',
    left: 14,
    right: 14,
  },
  paper: {
    backgroundColor: '#f4e3b2',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#c9a66b',
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 120,
    overflow: 'hidden',
  },
  paperImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  promptScroll: {
    maxHeight: 150,
  },
  promptContent: {
    paddingVertical: 2,
  },
  prompt: {
    color: '#3b2f14',
    fontWeight: '700',
    lineHeight: 26,
  },
  bonus: {
    marginTop: 6,
    color: '#8a6d3b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  tags: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 26,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagWrapper: {
    width: '48%',
    flexGrow: 1,
  },
  tag: {
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#6f4e37',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  tagPressed: {
    opacity: 0.85,
  },
  hole: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6f4e37',
  },
  tagLabel: {
    flex: 1,
    color: '#fdf6e3',
    fontSize: 16,
    fontWeight: '700',
  },
  mark: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
});
