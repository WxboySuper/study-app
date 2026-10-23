import {
  EMPTY_MATH_BUFFER,
  gradeMathAnswer,
  mathAnswerToTex,
  mathBackspace,
  mathInsert,
  mathMove,
  mathParts,
  type FishingFeedback,
  type MathBuffer,
  type MathSpec,
} from '@study-app/core';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MathText } from '@/math/MathText';
import { MathView } from '@/math/MathView';
import { fonts } from '@/theme';
import { GameButton } from '@/ui';

/**
 * The typed answer of a math question: a live KaTeX preview over a custom,
 * thumb-reachable math keyboard.
 *
 * A question with steps asks them one by one; each step is graded on its own
 * (✓ / ✗ with the right answer) and the question is right only when every
 * step and the final answer are right. The result goes to `onSubmit`, which
 * feeds the same Mastery/Normal grading as a tapped answer (the time is the
 * time of the whole question).
 */
export interface MathAnswerPanelProps {
  /** The id of the question (a new question resets the panel). */
  questionId: string;
  spec: MathSpec;
  feedback: FishingFeedback | null;
  locked: boolean;
  onSubmit: (correct: boolean) => void;
}

interface Key {
  label: string;
  /** What the key types (`|` is where the cursor lands). */
  insert: string;
  /** A wider, darker operator key. */
  op?: boolean;
  a11y?: string;
}

const k = (label: string, insert = label, op = false, a11y?: string): Key => ({
  label,
  insert,
  op,
  ...(a11y === undefined ? {} : { a11y }),
});

/** The number pad (page 1). */
const PAD: Key[][] = [
  [k('7'), k('8'), k('9'), k('÷', '/', true, 'divide'), k('(', '(', true), k(')', ')', true)],
  [k('4'), k('5'), k('6'), k('×', '*', true, 'times'), k('x'), k('^', '^', true, 'power')],
  [k('1'), k('2'), k('3'), k('−', '-', true, 'minus'), k('y'), k('a/b', '(|)/()', true, 'fraction')],
  [k('0'), k('.'), k('π', 'pi', false, 'pi'), k('+', '+', true, 'plus'), k('t'), k('√', 'sqrt(|)', true, 'square root')],
];

/** The functions and calculus (page 2). */
const FUNCS: Key[][] = [
  [k('sin', 'sin(|)'), k('cos', 'cos(|)'), k('tan', 'tan(|)'), k('ln', 'ln(|)'), k('log', 'log(|)'), k('e', 'e')],
  [k('sec', 'sec(|)'), k('csc', 'csc(|)'), k('cot', 'cot(|)'), k('asin', 'asin(|)'), k('acos', 'acos(|)'), k('atan', 'atan(|)')],
  [
    k('∫', 'int(|, x)', true, 'integral'),
    k('∫ₐᵇ', 'int(|, x, , )', true, 'definite integral'),
    k('d/dx', 'diff(|, x)', true, 'derivative'),
    k('∂/∂x', 'pdiff(|, x)', true, 'partial derivative'),
    k(',', ', ', true, 'comma'),
    k('+C', ' + C', true, 'plus C'),
  ],
  [k('x'), k('y'), k('t'), k('^', '^', true, 'power'), k('(', '(', true), k(')', ')', true)],
];

export function MathAnswerPanel({ questionId, spec, feedback, locked, onSubmit }: MathAnswerPanelProps) {
  const parts = useMemo(() => mathParts(spec), [spec]);
  const [part, setPart] = useState(0);
  const [buffer, setBuffer] = useState<MathBuffer>(EMPTY_MATH_BUFFER);
  const [results, setResults] = useState<boolean[]>([]);
  // A graded step that is held on the screen until the player goes on.
  const [stepResult, setStepResult] = useState<boolean | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [page, setPage] = useState<0 | 1>(0);

  // A new question, or a Second Chance retry, starts over.
  const retry = feedback?.retry === true;
  useEffect(() => {
    setPart(0);
    setBuffer(EMPTY_MATH_BUFFER);
    setResults([]);
    setStepResult(null);
    setInvalid(false);
    setPage(0);
  }, [questionId, retry]);

  const current = parts[Math.min(part, parts.length - 1)]!;
  const answered = feedback !== null && !feedback.retry;
  const disabled = locked || answered || stepResult !== null;
  const tex = mathAnswerToTex(buffer.text);
  const isStep = part < parts.length - 1;

  const press = (key: Key) => {
    setInvalid(false);
    setBuffer((b) => mathInsert(b, key.insert));
  };

  const check = () => {
    if (buffer.text.trim() === '') return;
    const grade = gradeMathAnswer(current.answers, buffer.text, {
      kind: current.kind,
      constant: current.constant,
    });
    if (grade.invalid) {
      setInvalid(true);
      return;
    }
    const next = [...results, grade.correct];
    setResults(next);
    if (isStep) {
      setStepResult(grade.correct);
      return;
    }
    onSubmit(next.every(Boolean));
  };

  const nextStep = () => {
    setStepResult(null);
    setBuffer(EMPTY_MATH_BUFFER);
    setPart((p) => p + 1);
  };

  const shownResult = stepResult ?? (answered ? (results[results.length - 1] ?? feedback.correct) : null);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {parts.length > 1 ? (
        <View style={styles.steps}>
          {parts.map((_, index) => (
            <View
              key={index}
              style={[
                styles.stepDot,
                index === part ? styles.stepDotNow : null,
                results[index] === true ? styles.stepDotGood : null,
                results[index] === false ? styles.stepDotBad : null,
              ]}
            />
          ))}
          <Text style={styles.stepLabel}>
            {isStep ? `STEP ${part + 1} OF ${parts.length - 1}` : 'FINAL ANSWER'}
          </Text>
        </View>
      ) : null}

      {current.prompt !== null ? (
        <MathText text={current.prompt} style={styles.stepPrompt} color="#fde68a" fontSize={14} center />
      ) : current.kind === 'setup' ? (
        <Text style={styles.stepPrompt}>SET IT UP — DON&apos;T SOLVE</Text>
      ) : null}

      <View
        style={[
          styles.display,
          shownResult === true ? styles.displayGood : null,
          shownResult === false || invalid ? styles.displayBad : null,
        ]}
        accessibilityLabel={`Your answer: ${buffer.text || 'empty'}`}
      >
        <View style={styles.preview}>
          {tex === null || tex === '' ? (
            <Text style={styles.placeholder}>{buffer.text === '' ? 'Type your answer…' : buffer.text}</Text>
          ) : (
            <MathView source={tex} displayMode={false} color="#ffffff" fontSize={20} />
          )}
        </View>
        <Text style={styles.raw} numberOfLines={1}>
          {buffer.text.slice(0, buffer.cursor)}
          <Text style={styles.caret}>|</Text>
          {buffer.text.slice(buffer.cursor)}
        </Text>
        {invalid ? <Text style={styles.hint}>Can&apos;t read that yet — check the brackets.</Text> : null}
        {shownResult === false ? (
          <View style={styles.expected}>
            <Text style={styles.hint}>Answer: </Text>
            <ExpectedTex answer={current.answers[0] ?? ''} />
          </View>
        ) : null}
      </View>

      {stepResult !== null ? (
        <GameButton
          label={stepResult ? '✓  NICE — NEXT STEP' : '✗  NEXT STEP'}
          variant={stepResult ? 'primary' : 'danger'}
          size="md"
          onPress={nextStep}
          accessibilityLabel="Next step"
        />
      ) : null}

      {answered || stepResult !== null ? null : (
        <View style={styles.keyboard}>
          {(page === 0 ? PAD : FUNCS).map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((key, c) => (
                <KeyButton key={`${r}-${c}`} label={key.label} a11y={key.a11y} op={key.op === true} disabled={disabled} onPress={() => press(key)} />
              ))}
            </View>
          ))}
          <View style={styles.row}>
            <KeyButton label={page === 0 ? 'ƒ ∫' : '123'} a11y="switch keys" op disabled={disabled} onPress={() => setPage(page === 0 ? 1 : 0)} />
            <KeyButton label="◀" a11y="cursor left" op disabled={disabled} onPress={() => setBuffer((b) => mathMove(b, -1))} />
            <KeyButton label="▶" a11y="cursor right" op disabled={disabled} onPress={() => setBuffer((b) => mathMove(b, 1))} />
            <KeyButton label="⌫" a11y="delete" op disabled={disabled} onPress={() => { setInvalid(false); setBuffer((b) => mathBackspace(b)); }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Check the answer"
              disabled={disabled || buffer.text.trim() === ''}
              onPress={check}
              style={({ pressed }) => [styles.key, styles.checkKey, pressed ? styles.keyPressed : null, buffer.text.trim() === '' ? styles.keyDim : null]}
            >
              <Text style={styles.checkText}>{isStep ? 'CHECK STEP' : 'CHECK'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/** The right answer, drawn with KaTeX when it can be read. */
function ExpectedTex({ answer }: { answer: string }) {
  const tex = mathAnswerToTex(answer);
  return tex === null || tex === '' ? (
    <Text style={styles.hint}>{answer}</Text>
  ) : (
    <MathView source={tex} displayMode={false} color="#fde68a" fontSize={15} />
  );
}

function KeyButton({
  label,
  a11y,
  op,
  disabled,
  onPress,
}: {
  label: string;
  a11y?: string;
  op: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.key, op ? styles.keyOp : null, pressed ? styles.keyPressed : null]}
    >
      <Text style={[styles.keyText, label.length > 3 ? styles.keyTextSmall : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', maxWidth: 520, gap: 6 },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)' },
  stepDotNow: { backgroundColor: '#fbbf24', transform: [{ scale: 1.25 }] },
  stepDotGood: { backgroundColor: '#1fbf75' },
  stepDotBad: { backgroundColor: '#eb4335' },
  stepLabel: { marginLeft: 6, color: '#fde68a', fontFamily: fonts.titleSemi, fontSize: 10, letterSpacing: 1.4 },
  stepPrompt: { color: '#fde68a', fontFamily: fonts.bodyBold, fontSize: 13, textAlign: 'center', letterSpacing: 0.6 },
  display: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(8,16,34,0.78)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    gap: 2,
  },
  displayGood: { borderColor: '#1fbf75' },
  displayBad: { borderColor: '#eb4335' },
  preview: { minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  placeholder: { color: 'rgba(255,255,255,0.55)', fontFamily: fonts.bodySemi, fontSize: 16 },
  raw: { color: 'rgba(255,255,255,0.6)', fontFamily: fonts.bodySemi, fontSize: 11, textAlign: 'center' },
  caret: { color: '#fbbf24', fontFamily: fonts.title },
  hint: { color: '#fde68a', fontFamily: fonts.bodySemi, fontSize: 12, textAlign: 'center' },
  expected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  keyboard: { gap: 5 },
  row: { flexDirection: 'row', gap: 5 },
  key: {
    flex: 1,
    height: 42,
    borderRadius: 9,
    borderBottomWidth: 4,
    borderBottomColor: '#1c4f96',
    backgroundColor: '#2f80ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyOp: { backgroundColor: '#334155', borderBottomColor: '#1e293b' },
  keyPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
  keyDim: { opacity: 0.55 },
  keyText: { color: '#ffffff', fontFamily: fonts.title, fontSize: 17 },
  keyTextSmall: { fontSize: 12 },
  checkKey: { flex: 2, backgroundColor: '#1fbf75', borderBottomColor: '#0b7a45' },
  checkText: { color: '#ffffff', fontFamily: fonts.title, fontSize: 14, letterSpacing: 1 },
});
