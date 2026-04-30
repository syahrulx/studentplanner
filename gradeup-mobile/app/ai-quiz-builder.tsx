import { useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import {
  generateQuizFromNotes,
  setGeneratedQuizQuestions,
  getOpenAIKey,
  type QuizType,
  type QuizDifficulty,
} from '@/src/lib/studyApi';
import { extractPdfTextFromStoragePath } from '@/src/lib/pdfText';
import { handleMonthlyLimit } from '@/src/lib/aiLimitError';
import { invokeGenerateFlashcards } from '@/src/lib/invokeGenerateFlashcards';
import type { Note } from '@/src/types';

const PAD = 20;
const RADIUS = 20;
const RADIUS_SM = 14;

const QUIZ_TYPES: { key: QuizType; label: string; icon: string; desc: string }[] = [
  { key: 'mixed', label: 'Mixed', icon: 'shuffle', desc: 'All question types' },
  { key: 'mcq', label: 'Multiple Choice', icon: 'list', desc: '4 options per question' },
  { key: 'true_false', label: 'True / False', icon: 'check-circle', desc: 'Binary answers' },
  { key: 'short_answer', label: 'Short Answer', icon: 'edit-3', desc: 'Type your answer' },
];

const DIFFICULTIES: { key: QuizDifficulty; label: string; color: string }[] = [
  { key: 'easy', label: 'Easy', color: '#10b981' },
  { key: 'medium', label: 'Medium', color: '#f59e0b' },
  { key: 'hard', label: 'Hard', color: '#ef4444' },
];

const Q_COUNTS = [5, 10, 15, 20];
const TIMER_CHOICES = [
  { key: '20', label: '20s' },
  { key: '30', label: '30s' },
  { key: 'off', label: 'No timer' },
] as const;
type TimerChoice = (typeof TIMER_CHOICES)[number]['key'];

/** Check if extracted text looks like real educational content vs PDF garbage. */
function looksLikeRealContent(text: string): boolean {
  const words = text.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 10) return false;
  const realWords = words.filter(w => /^[a-zA-Z]{2,}$/.test(w));
  return realWords.length / words.length > 0.3;
}

/** Short label for loading UI (filename without extension when sensible). */
function noteLoadingLabel(note: Note): string {
  const raw = (note.attachmentFileName || note.title || 'PDF').trim() || 'PDF';
  return raw.replace(/\.pdf$/i, '').trim() || 'PDF';
}

/** Truncate long names in the middle so start and end stay visible in a pill button. */
function truncateMiddle(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  const edge = Math.max(4, Math.floor((maxLen - 1) / 2));
  return `${t.slice(0, edge)}…${t.slice(t.length - edge)}`;
}

export default function AIQuizBuilder() {
  const { courses, notes, user, handleSaveNote, language } = useApp();
  const theme = useTheme();

  const [selectedSubject, setSelectedSubject] = useState<string>(courses[0]?.id ?? '');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [quizType, setQuizType] = useState<QuizType>('mixed');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [timerChoice, setTimerChoice] = useState<TimerChoice>('30');
  const [loading, setLoading] = useState(false);
  /** Primary line stays short; optional detail shows file name with middle truncation. */
  const [loadingBanner, setLoadingBanner] = useState<{ title: string; detail?: string } | null>(null);
  const loadingPhaseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const topicsForSubject = useMemo(
    () => notes.filter((n) => n.subjectId === selectedSubject),
    [notes, selectedSubject],
  );

  const toggleTopic = (noteId: string) => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedTopicIds.size === topicsForSubject.length) {
      setSelectedTopicIds(new Set());
    } else {
      setSelectedTopicIds(new Set(topicsForSubject.map((n) => n.id)));
    }
  };

  const hasTopics = selectedTopicIds.size > 0;

  const handleGenerate = async () => {
    if (!hasTopics) return;
    if (!getOpenAIKey()) {
      Alert.alert('API Key Missing', 'Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file.');
      return;
    }

    const selectedNotes = topicsForSubject.filter((n) => selectedTopicIds.has(n.id));
    const contentParts: string[] = [];
    const failedPdfTitles: string[] = [];
    const extractionIssues: string[] = [];
    let attemptedPdfCount = 0;

    setLoading(true);
    setLoadingBanner({ title: 'Gathering note content…' });

    for (const note of selectedNotes) {
      // 1. Use plain text content if available
      const plainText = (note.content || '').trim();
      if (plainText.length > 0) {
        contentParts.push(plainText);
        continue;
      }

      // 2. Use cached extracted text from DB (instant — no API call)
      if (note.extractedText?.trim()) {
        contentParts.push(note.extractedText.trim());
        continue;
      }

      // 3. Fall back to live PDF extraction (slow path — only for uncached PDFs)
      if (!note.attachmentPath) continue;

      const nameHint = (note.attachmentFileName || note.title || note.attachmentPath || '').toLowerCase();
      const looksLikePdf =
        nameHint.endsWith('.pdf') || note.attachmentPath.toLowerCase().includes('.pdf');

      if (!looksLikePdf) continue;

      try {
        attemptedPdfCount++;
        setLoadingBanner({
          title: 'Reading PDF…',
          detail: truncateMiddle(noteLoadingLabel(note), 44),
        });
        const extracted = await Promise.race([
          extractPdfTextFromStoragePath(note.attachmentPath),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Aborted')), 120000)
          ),
        ]);
        const pdfText = extracted.text;
        if (pdfText.trim().length > 0 && looksLikeRealContent(pdfText)) {
          contentParts.push(pdfText);
          if (handleSaveNote) {
            handleSaveNote({ ...note, extractedText: pdfText, extractionError: undefined });
          }
        } else {
          // Fallback: if direct text extraction fails, try generating a small
          // flashcard batch from the PDF and reuse it as quiz source content.
          setLoadingBanner({
            title: 'Trying backup extraction…',
            detail: truncateMiddle(noteLoadingLabel(note), 44),
          });
          const backup = await invokeGenerateFlashcards({
            source: 'pdf_storage',
            storage_path: note.attachmentPath,
            bucket: 'note-attachments',
            note_id: note.id,
            count: 8,
          });
          if (!backup.error && (backup.data?.cards?.length ?? 0) > 0) {
            const backupText = backup.data!.cards
              .map((c) => `${c.front}\n${c.back}`)
              .join('\n\n');
            contentParts.push(backupText);
            if (handleSaveNote) {
              handleSaveNote({ ...note, extractionError: undefined });
            }
          } else {
            failedPdfTitles.push(note.title);
            const reason = pdfText.trim().length > 0
              ? 'extracted text looks like PDF metadata, not content'
              : (extracted.stage + (extracted.detail ? ` - ${extracted.detail}` : ''));
            const mergedReason = backup.error ? `${reason}; backup failed - ${backup.error}` : reason;
            extractionIssues.push(`${note.title}: ${mergedReason}`);
            if (handleSaveNote) handleSaveNote({ ...note, extractionError: mergedReason });
          }
        }
      } catch (err: any) {
        // Backup attempt in exception path too.
        try {
          setLoadingBanner({
            title: 'Trying backup extraction…',
            detail: truncateMiddle(noteLoadingLabel(note), 44),
          });
          const backup = await invokeGenerateFlashcards({
            source: 'pdf_storage',
            storage_path: note.attachmentPath,
            bucket: 'note-attachments',
            note_id: note.id,
            count: 8,
          });
          if (!backup.error && (backup.data?.cards?.length ?? 0) > 0) {
            const backupText = backup.data!.cards
              .map((c) => `${c.front}\n${c.back}`)
              .join('\n\n');
            contentParts.push(backupText);
            if (handleSaveNote) {
              handleSaveNote({ ...note, extractionError: undefined });
            }
            continue;
          }
          const msg = err?.message || 'unexpected exception in quiz builder';
          const merged = backup.error ? `${msg}; backup failed - ${backup.error}` : msg;
          failedPdfTitles.push(note.title);
          extractionIssues.push(`${note.title}: failed - ${merged}`);
          if (handleSaveNote) handleSaveNote({ ...note, extractionError: merged });
        } catch (backupErr: any) {
          failedPdfTitles.push(note.title);
          const msg = err?.message || 'unexpected exception in quiz builder';
          const backupMsg = backupErr?.message || 'backup extraction failed';
          const merged = `${msg}; ${backupMsg}`;
          extractionIssues.push(`${note.title}: failed - ${merged}`);
          if (handleSaveNote) handleSaveNote({ ...note, extractionError: merged });
        }
      }
    }

    // Last resort: try every attachment that wasn't already attempted
    if (contentParts.length === 0) {
      for (const note of selectedNotes) {
        if (!note.attachmentPath) continue;
        const nameHint = (note.attachmentFileName || note.title || note.attachmentPath || '').toLowerCase();
        if (nameHint.endsWith('.pdf') || note.attachmentPath.toLowerCase().includes('.pdf')) continue;
        try {
          attemptedPdfCount++;
          setLoadingBanner({
            title: 'Reading attachment…',
            detail: truncateMiddle(noteLoadingLabel(note), 44),
          });
          const extracted = await extractPdfTextFromStoragePath(note.attachmentPath);
          const pdfText = extracted.text;
          if (pdfText.trim().length > 0 && looksLikeRealContent(pdfText)) {
            contentParts.push(pdfText.trim());
            if (handleSaveNote) handleSaveNote({ ...note, extractedText: pdfText.trim(), extractionError: undefined });
          } else {
            const reason = `${extracted.stage}${extracted.detail ? ` - ${extracted.detail}` : ''}`;
            extractionIssues.push(`${note.title}: ${reason}`);
            if (handleSaveNote) handleSaveNote({ ...note, extractionError: reason });
          }
        } catch {
          // not a valid PDF — ignore
        }
      }
    }

    const contents = contentParts.filter(Boolean);
    if (!contents.length) {
      setLoading(false);
      setLoadingBanner(null);
      if (attemptedPdfCount > 0) {
        Alert.alert(
          'No Content',
          `Tried reading ${attemptedPdfCount} PDF attachment(s), but extracted text is still empty.\n\n${extractionIssues.slice(0, 2).join('\n') || 'No detailed extraction issue captured.'}`,
        );
      } else {
        Alert.alert('No Content', 'Selected notes have no text content to generate questions from.');
      }
      return;
    }
    setLoadingBanner({ title: 'Analyzing your notes…' });

    try {
      loadingPhaseTimeoutsRef.current.forEach(clearTimeout);
      loadingPhaseTimeoutsRef.current = [
        setTimeout(() => {
          setLoadingBanner((prev) => (prev ? { title: 'Writing questions…' } : null));
        }, 2000),
        setTimeout(() => {
          setLoadingBanner((prev) => (prev ? { title: 'Almost ready…' } : null));
        }, 5000),
      ];

      const questions = await generateQuizFromNotes(contents, questionCount, quizType, difficulty, user.id);

      if (!questions.length) {
        Alert.alert('Generation Failed', 'Could not generate questions. Try different notes or settings.');
        return;
      }

      await setGeneratedQuizQuestions(questions);
      if (failedPdfTitles.length > 0) {
        Alert.alert(
          'Some PDFs skipped',
          `Could not read text from ${failedPdfTitles.length} PDF(s). Quiz was generated from available content.`,
        );
      }
      router.push({
        pathname: '/quiz-mode-selection',
        params: {
          fromBuilder: '1',
          useGenerated: '1',
          total: String(questions.length),
          quizType,
          difficulty,
          timer: timerChoice,
          sourceType: 'notes',
          sourceId: selectedSubject,
        },
      } as any);
    } catch (e: any) {
      if (handleMonthlyLimit(e, language)) {
        // upgrade alert already shown
      } else {
        Alert.alert('Error', e?.message || 'Something went wrong generating the quiz.');
      }
    } finally {
      loadingPhaseTimeoutsRef.current.forEach(clearTimeout);
      loadingPhaseTimeoutsRef.current = [];
      setLoading(false);
      setLoadingBanner(null);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]}>AI Quiz Builder</Text>
          <Text style={[styles.headerSub, { color: theme.textSecondary }]}>Powered by AI</Text>
        </View>
      </View>

      {/* 1. Subject */}
      <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Subject</Text>
      <View style={[styles.groupBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectRow}>
          {courses.map((course) => {
            const active = selectedSubject === course.id;
            return (
              <Pressable
                key={course.id}
                style={[
                  styles.subjectPill,
                  active
                    ? { backgroundColor: theme.primary }
                    : { backgroundColor: theme.background },
                ]}
                onPress={() => { setSelectedSubject(course.id); setSelectedTopicIds(new Set()); }}
              >
                <Text style={[styles.subjectPillText, { color: active ? '#fff' : theme.textSecondary }]}>
                  {course.id}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Topics */}
      <View style={styles.sectionLabelRow}>
        <Text style={[styles.groupLabel, { color: theme.textSecondary, marginTop: 0 }]}>Notes</Text>
        <Pressable onPress={selectAll}>
          <Text style={[styles.selectAll, { color: theme.primary }]}>
            {selectedTopicIds.size === topicsForSubject.length && topicsForSubject.length > 0 ? 'Deselect All' : 'Select All'}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.groupBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {topicsForSubject.length === 0 ? (
          <View style={styles.emptyBox}>
            <Feather name="file-text" size={20} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No notes in this subject yet.</Text>
          </View>
        ) : (
          topicsForSubject.map((note, i) => {
            const selected = selectedTopicIds.has(note.id);
            const isLast = i === topicsForSubject.length - 1;
            return (
              <Pressable
                key={note.id}
                style={[
                  styles.noteRow,
                  !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                ]}
                onPress={() => toggleTopic(note.id)}
              >
                <View style={styles.noteBody}>
                  <Text style={[styles.noteTag, { color: theme.textSecondary }]}>{note.tag}</Text>
                  <Text style={[styles.noteTitle, { color: theme.text }]} numberOfLines={1}>{note.title}</Text>
                </View>
                <View style={[
                  styles.noteCheck,
                  selected
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { borderColor: theme.border },
                ]}>
                  {selected && <Feather name="check" size={12} color="#fff" />}
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* 3. Quiz Type */}
      <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Quiz Type</Text>
      <View style={[styles.groupBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {QUIZ_TYPES.map((qt, i) => {
          const active = quizType === qt.key;
          const isLast = i === QUIZ_TYPES.length - 1;
          return (
            <Pressable
              key={qt.key}
              style={[
                styles.settingRow,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
              ]}
              onPress={() => setQuizType(qt.key)}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: active ? `${theme.primary}15` : `${theme.textSecondary}12` }]}>
                <Feather name={qt.icon as any} size={15} color={active ? theme.primary : theme.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>{qt.label}</Text>
                <Text style={[styles.settingDesc, { color: theme.textSecondary }]}>{qt.desc}</Text>
              </View>
              {active && <Feather name="check" size={18} color={theme.primary} />}
            </Pressable>
          );
        })}
      </View>

      {/* 4. Difficulty — segmented control */}
      <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Difficulty</Text>
      <View style={[styles.segmentedWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {DIFFICULTIES.map((d) => {
          const active = difficulty === d.key;
          return (
            <Pressable
              key={d.key}
              style={[styles.segment, active && { backgroundColor: d.color }]}
              onPress={() => setDifficulty(d.key)}
            >
              <Text style={[styles.segmentText, active ? { color: '#fff', fontWeight: '700' } : { color: theme.textSecondary }]}>
                {d.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 5. Question Count */}
      <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Questions</Text>
      <View style={[styles.segmentedWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {Q_COUNTS.map((n) => {
          const active = questionCount === n;
          return (
            <Pressable
              key={n}
              style={[styles.segment, active && { backgroundColor: theme.primary }]}
              onPress={() => setQuestionCount(n)}
            >
              <Text style={[styles.segmentText, active ? { color: '#fff', fontWeight: '700' } : { color: theme.textSecondary }]}>
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 6. Timer */}
      <Text style={[styles.groupLabel, { color: theme.textSecondary }]}>Timer</Text>
      <View style={[styles.segmentedWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {TIMER_CHOICES.map((opt) => {
          const active = timerChoice === opt.key;
          return (
            <Pressable
              key={opt.key}
              style={[styles.segment, active && { backgroundColor: theme.primary }]}
              onPress={() => setTimerChoice(opt.key)}
            >
              <Text style={[styles.segmentText, active ? { color: '#fff', fontWeight: '700' } : { color: theme.textSecondary }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* CTA */}
      <View style={{ gap: 10, marginTop: 24 }}>
        <Pressable
          style={[styles.cta, { backgroundColor: hasTopics && !loading ? theme.primary : `${theme.textSecondary}40` }]}
          onPress={handleGenerate}
          disabled={!hasTopics || loading}
        >
          {loading ? (
            <View style={styles.ctaInner}>
              <ActivityIndicator color="#fff" size="small" />
              <View style={styles.ctaTextCol}>
                <Text style={styles.ctaText} numberOfLines={1}>
                  {loadingBanner?.title ?? 'Working…'}
                </Text>
                {loadingBanner?.detail ? (
                  <Text
                    style={styles.ctaDetail}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {loadingBanner.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.ctaInner}>
              <ThemeIcon name="sparkles" size={17} color="#fff" />
              <Text style={styles.ctaText}>{hasTopics ? 'Generate Quiz' : 'Select notes to begin'}</Text>
            </View>
          )}
        </Pressable>

        {selectedTopicIds.size > 0 && !loading && (
          <Text style={[styles.ctaSummary, { color: theme.textSecondary }]}>
            {selectedTopicIds.size} note{selectedTopicIds.size > 1 ? 's' : ''} · {questionCount} questions · {difficulty} · {timerChoice === 'off' ? 'no timer' : `${timerChoice}s`}
          </Text>
        )}
      </View>

      <View style={{ height: 56 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 60, paddingBottom: 24 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  backBtn: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  aiIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Group label — matches iOS Settings style
  groupLabel: {
    fontSize: 13, fontWeight: '600', letterSpacing: 0.1,
    marginBottom: 6, marginTop: 22, marginLeft: 2,
  },

  // iOS-style grouped card
  groupBox: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  // Subject pill strip
  subjectRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  subjectPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  subjectPillText: { fontSize: 14, fontWeight: '600' },

  // Section label row (Notes + Select All)
  sectionLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 22, marginBottom: 6, paddingHorizontal: 2,
  },
  selectAll: { fontSize: 13, fontWeight: '600' },

  // Note list rows
  noteRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  noteBody: { flex: 1, minWidth: 0 },
  noteTag: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2, textTransform: 'uppercase' },
  noteTitle: { fontSize: 15, fontWeight: '600' },
  noteCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },

  // Empty state
  emptyBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  emptyText: { fontSize: 14 },

  // Setting list rows (quiz type)
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  settingIconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '500' },
  settingDesc: { fontSize: 12, fontWeight: '400', marginTop: 1 },

  // Segmented control (difficulty, question count)
  segmentedWrap: {
    flexDirection: 'row', borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
    padding: 4, gap: 4,
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  segmentText: { fontSize: 14, fontWeight: '600' },

  // Generate button
  cta: { borderRadius: 14, overflow: 'hidden' },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  ctaTextCol: { flex: 1, minWidth: 0, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  ctaDetail: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    maxWidth: '100%',
  },
  ctaSummary: { textAlign: 'center', fontSize: 13, fontWeight: '500' },
});
