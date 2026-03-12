import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';

const QUESTIONS = [
  {
    id: 'q1',
    question: 'What design pattern separates Model, View, and Controller?',
    options: ['Singleton', 'MVC', 'Factory', 'Observer'],
    correct: 1,
  },
  {
    id: 'q2',
    question: 'Which HTTP method is used to create a new resource in REST?',
    options: ['GET', 'PUT', 'POST', 'DELETE'],
    correct: 2,
  },
  {
    id: 'q3',
    question: 'Hibernate uses JPA annotations for entity mapping. True or False?',
    options: ['True', 'False'],
    correct: 0,
  },
];

export default function QuizGameplayScreen() {
  const router = useRouter();
  const { setQuizScore } = useAppContext();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [timer, setTimer] = useState(15);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const q = QUESTIONS[currentIndex];
  const isLast = currentIndex === QUESTIONS.length - 1;

  useEffect(() => {
    setTimer(15);
    setSelectedOption(null);
  }, [currentIndex]);

  useEffect(() => {
    if (selectedOption !== null) return;
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, selectedOption]);

  useEffect(() => {
    if (timer === 0 && selectedOption === null) {
      advanceQuestion(0);
    }
  }, [timer]);

  const advanceQuestion = (points: number) => {
    setScore((s) => s + points);
    if (isLast) {
      setQuizScore(score + points);
      router.replace('/results-page');
      return;
    }
    setTimeout(() => {
      setCurrentIndex((i) => i + 1);
    }, 1000);
  };

  const onSelectOption = (index: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(index);
    const isCorrect = index === q.correct;
    const points = isCorrect ? 10 : 0;
    advanceQuestion(points);
  };

  const getOptionStyle = (index: number) => {
    if (selectedOption === null) return styles.optionBtn;
    const isCorrect = index === q.correct;
    const isWrong = index === selectedOption && !isCorrect;
    if (isCorrect) return [styles.optionBtn, styles.optionCorrect];
    if (isWrong) return [styles.optionBtn, styles.optionWrong];
    return styles.optionBtn;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{currentIndex + 1}/{QUESTIONS.length}</Text>
        </View>
        <Text style={styles.scoreText}>Score: {score}</Text>
      </View>

      <View style={styles.timerBar}>
        <View
          style={[
            styles.timerFill,
            { width: `${(timer / 15) * 100}%` },
          ]}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.questionText}>{q.question}</Text>

        <View style={styles.optionsWrap}>
          {q.options.map((opt, i) => (
            <Pressable
              key={i}
              style={getOptionStyle(i)}
              onPress={() => onSelectOption(i)}
              disabled={selectedOption !== null}
            >
              <Text style={styles.optionText}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  badge: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
  },
  timerBar: {
    height: 6,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  questionText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.navy,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 32,
  },
  optionsWrap: { gap: 12 },
  optionBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  optionCorrect: {
    borderColor: COLORS.green,
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  optionWrong: {
    borderColor: COLORS.red,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
});
