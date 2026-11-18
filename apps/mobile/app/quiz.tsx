import {
  bestQuizPercent,
  localDay,
  quizDueLabel,
  type LocalQuiz,
} from "@study-app/core";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { QuizBuilder } from "@/study/QuizBuilder";
import {
  buildQuizDetail,
  deleteLocalQuiz,
  questionIdsOf,
  readLocalQuizzes,
  recordLocalQuizResult,
} from "@/study/quizzes";
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
  // The quizzes the player made, and the one that is being played (if local).
  const [mine, setMine] = useState<LocalQuiz[]>([]);
  const [building, setBuilding] = useState(false);
  const localPlaying = useRef<string | null>(null);

  const loadMine = useCallback(async () => {
    setMine(await readLocalQuizzes());
  }, []);

  const startLocal = async (quiz: LocalQuiz) => {
    const detail = await buildQuizDetail(quiz);
    if (detail.questions.length === 0) {
      setError("That quiz has no questions left. Check its decks.");
      return;
    }
    localPlaying.current = quiz.id;
    shownAt.current = Date.now();
    setPhase({
      kind: "play",
      quiz: detail,
      index: 0,
      answers: [],
      choices: choicesOf(detail, 0),
    });
  };

  const studyFor = async (quiz: LocalQuiz) => {
    const ids = await questionIdsOf(quiz);
    if (ids.length === 0) {
      return;
    }
    router.push({
      pathname: "/fishing",
      params: { kind: "all", mastery: "0", track: "mc", ids: ids.join(",") },
    });
  };

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
      void loadMine();
    }, [refresh, loadMine]),
  );

  const start = async (id: string) => {
    localPlaying.current = null;
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
    // A quiz of the player stays on the phone; a quiz from Muse is reported.
    if (localPlaying.current === null) {
      await recordQuizAnswer(await openLocalStore(), {
        quizId: phase.quiz.id,
        cardId: q.cardId,
        chosen: choice,
        correct: played.correct,
        timeMs,
        answeredAt: Date.now(),
      });
    }
    const answers = [...phase.answers, played];
    const next = phase.index + 1;
    if (next >= phase.quiz.questions.length) {
      if (localPlaying.current !== null) {
        await recordLocalQuizResult(
          localPlaying.current,
          answers.filter((a) => a.correct).length,
          answers.length,
        );
      }
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
                : "Make a quiz and choose what is on it"
          }
        />
        <ScrollView contentContainerStyle={styles.body}>
          {phase.kind === "list" && building ? (
            <GlassCard style={styles.card} elevated={false}>
              <QuizBuilder
                onCancel={() => {
                  setBuilding(false);
                }}
                onDone={() => {
                  setBuilding(false);
                  void loadMine();
                }}
              />
            </GlassCard>
          ) : null}

          {phase.kind === "list" && !building ? (
            <>
              <GameButton
                label="NEW QUIZ"
                variant="primary"
                size="md"
                onPress={() => {
                  setBuilding(true);
                }}
              />

              {mine.length > 0 ? <Text style={styles.heading}>MY QUIZZES</Text> : null}
              {mine.map((quiz) => {
                const best = bestQuizPercent(quiz.results);
                return (
                  <GlassCard key={quiz.id} style={styles.card} elevated={false}>
                    <Text style={styles.title}>{quiz.title}</Text>
                    <Text style={styles.muted}>
                      {quizDueLabel(quiz.dueDay, localDay(new Date()))}
                      {best === null ? "" : ` · best ${best}%`}
                      {quiz.limit === null ? "" : ` · ${quiz.limit} questions`}
                    </Text>
                    <View style={styles.quizActions}>
                      <Pressable
                        accessibilityRole="button"
                        testID={`quiz-start-${quiz.id}`}
                        onPress={() => void startLocal(quiz)}
                        style={[styles.smallButton, styles.smallPrimary]}
                      >
                        <Text style={styles.smallText}>TAKE QUIZ</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        testID={`quiz-study-${quiz.id}`}
                        onPress={() => void studyFor(quiz)}
                        style={styles.smallButton}
                      >
                        <Text style={styles.smallText}>STUDY FOR IT</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${quiz.title}`}
                        onPress={() => {
                          void deleteLocalQuiz(quiz.id).then(loadMine);
                        }}
                        style={styles.smallButton}
                      >
                        <Text style={styles.smallText}>DELETE</Text>
                      </Pressable>
                    </View>
                  </GlassCard>
                );
              })}

              <Text style={styles.heading}>FROM MUSE</Text>
              {error !== null ? (
                <Text style={styles.muted}>{error}</Text>
              ) : null}
              {quizzes === null ? (
                <Text style={styles.muted}>Loading…</Text>
              ) : null}
              {quizzes !== null && quizzes.length === 0 && error === null ? (
                <Text style={styles.muted}>Nothing from Muse right now.</Text>
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
                  void loadMine();
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
  heading: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 12,
    letterSpacing: 2,
    marginTop: spacing.sm,
  },
  quizActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm },
  smallButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  smallPrimary: { backgroundColor: "#7b61ff" },
  smallText: { color: "#ffffff", fontFamily: fonts.title, fontSize: 11, letterSpacing: 1 },
});
