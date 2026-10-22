import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { openLocalStore } from "@/db/local";
import { MathText } from "@/math/MathText";
import {
  fetchQuiz,
  listAssignedQuizzes,
  recordQuizAnswer,
  type QuizDetail,
  type QuizSummary,
} from "@/sync/quizzes";
import { colors, fonts, spacing } from "@/theme";
import { GameBackground, GameButton, GlassCard, ScreenHeader } from "@/ui";

/**
 * Quizzes that Muse assigned (docs/API.md §Quizzes).
 *
 * The list shows the assigned quizzes; a quiz is played once, one question
 * at a time, and every answer goes out as a `quiz_answer` sync event. The
 * results screen shows the score and each answer.
 */

interface Played {
  cardId: string;
  front: string;
  back: string;
  chosen: string;
  correct: boolean;
  timeMs: number;
}

type Phase =
  | { kind: "list" }
  | {
      kind: "play";
      quiz: QuizDetail;
      index: number;
      answers: Played[];
      choices: string[];
    }
  | { kind: "done"; quiz: QuizDetail; answers: Played[] };

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

function choicesOf(quiz: QuizDetail, index: number): string[] {
  const q = quiz.questions[index];
  return q === undefined
    ? []
    : shuffle([q.back, ...q.wrong.filter((w) => w !== q.back)]);
}

function dueLabel(dueAt: number | null): string {
  if (dueAt === null) return "No due date";
  return `Due ${new Date(dueAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export default function QuizRoute() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "list" });
  const shownAt = useRef(Date.now());

  const refresh = useCallback(async () => {
    const result = await listAssignedQuizzes();
    if (result.ok) {
      setQuizzes(result.value);
      setError(null);
    } else {
      setQuizzes([]);
      setError(
        result.error === "not_linked"
          ? "Link this device first to get quizzes."
          : "Could not load quizzes right now.",
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const start = async (id: string) => {
    const result = await fetchQuiz(id);
    if (!result.ok || result.value.questions.length === 0) {
      setError("Could not open that quiz.");
      return;
    }
    shownAt.current = Date.now();
    setPhase({
      kind: "play",
      quiz: result.value,
      index: 0,
      answers: [],
      choices: choicesOf(result.value, 0),
    });
  };

  const choose = async (choice: string) => {
    if (phase.kind !== "play") return;
    const q = phase.quiz.questions[phase.index];
    if (q === undefined) return;
    const timeMs = Date.now() - shownAt.current;
    const played: Played = {
      cardId: q.cardId,
      front: q.front,
      back: q.back,
      chosen: choice,
      correct: choice === q.back,
      timeMs,
    };
    await recordQuizAnswer(await openLocalStore(), {
      quizId: phase.quiz.id,
      cardId: q.cardId,
      chosen: choice,
      correct: played.correct,
      timeMs,
      answeredAt: Date.now(),
    });
    const answers = [...phase.answers, played];
    const next = phase.index + 1;
    if (next >= phase.quiz.questions.length) {
      setPhase({ kind: "done", quiz: phase.quiz, answers });
      return;
    }
    shownAt.current = Date.now();
    setPhase({
      ...phase,
      index: next,
      answers,
      choices: choicesOf(phase.quiz, next),
    });
  };

  const score = useMemo(
    () =>
      phase.kind === "done" ? phase.answers.filter((a) => a.correct).length : 0,
    [phase],
  );

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ScreenHeader
          title={
            phase.kind === "list" ? "QUIZZES" : phase.quiz.title.toUpperCase()
          }
          subtitle={
            phase.kind === "play"
              ? `Question ${phase.index + 1} of ${phase.quiz.questions.length}`
              : phase.kind === "done"
                ? `Score ${score}/${phase.quiz.questions.length}`
                : "Assigned by Muse"
          }
        />
        <ScrollView contentContainerStyle={styles.body}>
          {phase.kind === "list" ? (
            <>
              {error !== null ? (
                <Text style={styles.muted}>{error}</Text>
              ) : null}
              {quizzes === null ? (
                <Text style={styles.muted}>Loading…</Text>
              ) : null}
              {quizzes !== null && quizzes.length === 0 && error === null ? (
                <Text style={styles.muted}>No quizzes assigned. Nice!</Text>
              ) : null}
              {(quizzes ?? []).map((quiz) => (
                <Pressable
                  key={quiz.id}
                  testID={`quiz-${quiz.id}`}
                  accessibilityRole="button"
                  onPress={() => void start(quiz.id)}
                >
                  <GlassCard style={styles.card} elevated={false}>
                    <Text style={styles.title}>{quiz.title}</Text>
                    <Text style={styles.muted}>
                      {quiz.cardIds.length} questions · {dueLabel(quiz.dueAt)}
                    </Text>
                  </GlassCard>
                </Pressable>
              ))}
            </>
          ) : null}

          {phase.kind === "play" ? (
            <>
              <GlassCard style={styles.card} elevated={false}>
                <MathText
                  text={phase.quiz.questions[phase.index]?.front ?? ""}
                  style={styles.prompt}
                  color={colors.text}
                  fontSize={18}
                />
              </GlassCard>
              {phase.choices.map((choice, i) => (
                <Pressable
                  key={`${phase.index}-${i}`}
                  testID={`quiz-choice-${i}`}
                  accessibilityRole="button"
                  onPress={() => void choose(choice)}
                  style={({ pressed }) => [
                    styles.choice,
                    pressed && styles.pressed,
                  ]}
                >
                  <MathText
                    text={choice}
                    style={styles.choiceText}
                    color="#ffffff"
                    fontSize={16}
                    center
                  />
                </Pressable>
              ))}
            </>
          ) : null}

          {phase.kind === "done" ? (
            <>
              <Text style={styles.score}>
                {score}/{phase.quiz.questions.length}
              </Text>
              {phase.answers.map((a) => (
                <GlassCard
                  key={a.cardId}
                  style={styles.card}
                  elevated={false}
                  tint={a.correct ? colors.gold : colors.border}
                >
                  <MathText
                    text={a.front}
                    style={styles.answerPrompt}
                    color={colors.text}
                    fontSize={14}
                  />
                  <Text
                    style={[
                      styles.muted,
                      { color: a.correct ? "#34d399" : "#fb7185" },
                    ]}
                  >
                    {a.correct ? "✓" : "✗"} {a.chosen}
                    {a.correct ? "" : `  (answer: ${a.back})`} ·{" "}
                    {(a.timeMs / 1000).toFixed(1)} s
                  </Text>
                </GlassCard>
              ))}
              <GameButton
                label="BACK TO QUIZZES"
                variant="primary"
                size="md"
                onPress={() => {
                  setPhase({ kind: "list" });
                  void refresh();
                }}
              />
            </>
          ) : null}

          {phase.kind === "list" ? (
            <GameButton
              label="HOME"
              variant="ghost"
              size="md"
              onPress={() => router.back()}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </GameBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
  card: { padding: spacing.md },
  title: { color: colors.text, fontFamily: fonts.title, fontSize: 18 },
  muted: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  prompt: { color: colors.text, fontSize: 18 },
  choice: {
    minHeight: 56,
    borderRadius: 12,
    borderBottomWidth: 6,
    borderColor: "rgba(0,0,0,0.3)",
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  choiceText: {
    color: "#ffffff",
    fontFamily: fonts.title,
    fontSize: 16,
    textAlign: "center",
  },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 3 },
  score: {
    color: colors.gold,
    fontFamily: fonts.title,
    fontSize: 48,
    textAlign: "center",
  },
  answerPrompt: { color: colors.text, fontSize: 14 },
});
