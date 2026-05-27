import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput,
  Switch, Alert, Modal, Platform, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import type { SubjectGradeConfig, GradeAssessment, GradingScheme, GradeRow } from '@/src/types';
import {
  calculateGrade, validateAssessmentWeights, gradeColor,
  UITM_GRADE_TABLE, GENERIC_4_GRADE_TABLE, GENERIC_5_GRADE_TABLE,
  SCHEME_LABELS, getGradeTable,
} from '@/src/lib/gradeCalculator';
import { getSubjectGradeConfig, saveSubjectGradeConfig } from '@/src/lib/gradeStorage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function fmt(n: number, dp = 1) { return isNaN(n) ? '0' : n.toFixed(dp); }

function makeDefault(subjectId: string): SubjectGradeConfig {
  return {
    subjectId,
    gradingScheme: 'uitm',
    hasFinalExam: true,
    carryWeight: 40,
    finalWeight: 60,
    assessments: [],
    finalExamScored: null,
    finalExamMaxScore: 100,
  };
}

const PRESETS: { key: GradingScheme; label: string; rows: GradeRow[] }[] = [
  { key: 'uitm',      label: 'UiTM Malaysia',  rows: UITM_GRADE_TABLE },
  { key: 'generic_4', label: 'Generic 4.0 GPA', rows: GENERIC_4_GRADE_TABLE },
  { key: 'generic_5', label: 'Generic 5.0 GPA', rows: GENERIC_5_GRADE_TABLE },
];

// ─── Reusable group / row components (matching add-task style) ─────────────────

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={[sl.label, { color }]}>{label}</Text>
  );
}

const sl = StyleSheet.create({
  label: {
    fontSize: 13, fontWeight: '600', letterSpacing: 0.2,
    marginBottom: 6, marginLeft: 4, marginTop: 22,
    textTransform: 'uppercase',
  },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SubjectGradeScreen() {
  const { subjectId: rawParam } = useLocalSearchParams<{ subjectId: string }>();
  const subjectId = typeof rawParam === 'string' ? rawParam : Array.isArray(rawParam) ? rawParam[0] : '';
  const { user, courses } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dark = theme.background === '#000000' || theme.background.startsWith('#0') || theme.background === '#121212';

  const course = useMemo(() => courses.find(c => c.id === subjectId), [courses, subjectId]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<SubjectGradeConfig>(makeDefault(subjectId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Custom grade rows (fully editable clone of the chosen scheme)
  const [customRows, setCustomRows] = useState<GradeRow[]>([]);
  const [useCustom, setUseCustom] = useState(false);

  // Modals
  const [schemeSheet, setSchemeSheet] = useState(false);
  const [gradeEditorOpen, setGradeEditorOpen] = useState(false);
  const [addAssessOpen, setAddAssessOpen] = useState(false);
  const [editAssess, setEditAssess] = useState<GradeAssessment | null>(null);

  // Assessment form
  const [fName, setFName] = useState('');
  const [fWeight, setFWeight] = useState('');
  const [fMax, setFMax] = useState('100');
  const [fScored, setFScored] = useState('');

  // Grade editor form (for adding a custom row)
  const [gLetter, setGLetter] = useState('');
  const [gMin, setGMin] = useState('');
  const [gPoint, setGPoint] = useState('');
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !subjectId) { setLoading(false); return; }
    getSubjectGradeConfig(user.id, subjectId).then(c => {
      const loaded = c ?? makeDefault(subjectId);
      setConfig(loaded);
      setCustomRows(getGradeTable(loaded.gradingScheme));
      setLoading(false);
    });
  }, [user?.id, subjectId]);

  // ── Save (auto) ────────────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function update(partial: Partial<SubjectGradeConfig>) {
    const next = { ...config, ...partial };
    setConfig(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!user?.id) return;
      setSaving(true);
      await saveSubjectGradeConfig(user.id, next);
      setSaving(false);
    }, 600);
  }

  // ── Active grade table (preset or custom) ───────────────────────────────────
  const activeRows = useMemo(() => {
    if (useCustom) return [...customRows].sort((a, b) => b.minPercent - a.minPercent);
    return getGradeTable(config.gradingScheme);
  }, [useCustom, customRows, config.gradingScheme]);

  // ── Calculation ─────────────────────────────────────────────────────────────
  const result = useMemo(() => calculateGrade(config), [config]);
  const { total: wTotal, valid: wValid, remaining: wRemaining } = useMemo(
    () => validateAssessmentWeights(config.assessments), [config.assessments]);

  const gc = gradeColor(result.grade.letter);

  // ── Assessment helpers ─────────────────────────────────────────────────────
  function openAddAssess(existing?: GradeAssessment) {
    if (existing) {
      setEditAssess(existing);
      setFName(existing.name);
      setFWeight(String(existing.weight));
      setFMax(String(existing.maxScore));
      setFScored(existing.scored !== null ? String(existing.scored) : '');
    } else {
      setEditAssess(null);
      setFName('');
      const rem = validateAssessmentWeights(config.assessments).remaining;
      setFWeight(rem > 0 ? String(Math.round(rem)) : '');
      setFMax('100');
      setFScored('');
    }
    setAddAssessOpen(true);
  }

  function saveAssessment() {
    const name = fName.trim();
    const weight = parseFloat(fWeight);
    const maxScore = parseFloat(fMax);
    const scored = fScored.trim() ? parseFloat(fScored) : null;
    if (!name) return Alert.alert('Name required');
    if (!weight || weight <= 0 || weight > 100) return Alert.alert('Weight must be 1–100');
    if (!maxScore || maxScore <= 0) return Alert.alert('Max score must be > 0');

    let next: GradeAssessment[];
    if (editAssess) {
      next = config.assessments.map(a => a.id === editAssess.id
        ? { ...a, name, weight, maxScore, scored } : a);
    } else {
      next = [...config.assessments, { id: uid(), name, weight, maxScore, scored }];
    }
    const { total } = validateAssessmentWeights(next);
    if (total > 100.01) return Alert.alert('Weight exceeds 100%', `Total is ${fmt(total)}%. Reduce weight.`);
    setAddAssessOpen(false);
    update({ assessments: next });
  }

  function deleteAssessment(id: string) {
    Alert.alert('Remove', 'Remove this component?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () =>
        update({ assessments: config.assessments.filter(a => a.id !== id) }) },
    ]);
  }

  function scoreChange(id: string, raw: string) {
    const val = raw.trim() === '' ? null : parseFloat(raw);
    update({ assessments: config.assessments.map(a => a.id === id ? { ...a, scored: val } : a) });
  }

  // ── Grade scheme helpers ────────────────────────────────────────────────────
  function applyPreset(scheme: GradingScheme) {
    const rows = getGradeTable(scheme);
    setCustomRows(rows);
    setUseCustom(false);
    update({ gradingScheme: scheme });
    setSchemeSheet(false);
  }

  function openGradeEditor() {
    setSchemeSheet(false);
    setTimeout(() => setGradeEditorOpen(true), 300);
  }

  function startEditRow(idx: number) {
    const row = customRows[idx];
    setEditingRowIdx(idx);
    setGLetter(row.letter);
    setGMin(String(row.minPercent));
    setGPoint(String(row.point));
  }

  function saveGradeRow() {
    if (editingRowIdx === null) return;
    const letter = gLetter.trim();
    const min = parseFloat(gMin);
    const point = parseFloat(gPoint);
    if (!letter) return Alert.alert('Letter required');
    if (isNaN(min) || min < 0 || min > 100) return Alert.alert('Min % must be 0–100');
    if (isNaN(point) || point < 0) return Alert.alert('GPA point must be ≥ 0');
    const next = [...customRows];
    next[editingRowIdx] = { ...next[editingRowIdx], letter, minPercent: min, point };
    // Recalculate maxPercent for all rows (sorted descending by minPercent)
    const sorted = [...next].sort((a, b) => b.minPercent - a.minPercent).map((r, i, arr) => ({
      ...r, maxPercent: i === 0 ? 100 : arr[i - 1].minPercent - 1,
    }));
    setCustomRows(sorted);
    setUseCustom(true);
    setEditingRowIdx(null);
    setGLetter(''); setGMin(''); setGPoint('');
  }

  function addGradeRow() {
    setEditingRowIdx(customRows.length);
    setGLetter('');
    setGMin('');
    setGPoint('');
  }

  function deleteGradeRow(idx: number) {
    const next = customRows.filter((_, i) => i !== idx);
    setCustomRows(next);
    setUseCustom(true);
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[ss.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const cardBg = theme.card;
  const border = theme.border;
  const txt = theme.text;
  const sub = theme.textSecondary;
  const pri = theme.primary;

  return (
    <View style={[ss.root, { backgroundColor: theme.background }]}>
      {/* ── Navigation Bar ──────────────────────────────────────────────── */}
      <View style={[ss.navbar, { paddingTop: insets.top + 8, backgroundColor: theme.background, borderBottomColor: border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [ss.navBtn, pressed && { opacity: 0.6 }]}>
          <Feather name="chevron-left" size={24} color={pri} />
          <Text style={[ss.navBack, { color: pri }]}>Back</Text>
        </Pressable>
        <View style={ss.navCenter}>
          <Text style={[ss.navTitle, { color: txt }]} numberOfLines={1}>{subjectId}</Text>
          {course && <Text style={[ss.navSub, { color: sub }]} numberOfLines={1}>{course.name}</Text>}
        </View>
        <View style={ss.navRight}>
          {saving
            ? <ActivityIndicator size="small" color={sub} />
            : <Text style={[ss.navSaved, { color: sub }]}>Saved</Text>
          }
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 48 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Grade Hero ─────────────────────────────────────────────── */}
          <View style={[ss.hero, { backgroundColor: gc + (dark ? '22' : '12'), borderColor: gc + '30' }]}>
            <View style={ss.heroMain}>
              <View style={[ss.heroGradeBubble, { backgroundColor: gc }]}>
                <Text style={ss.heroGradeLetter}>{result.grade.letter}</Text>
              </View>
              <View style={ss.heroInfo}>
                <Text style={[ss.heroScore, { color: txt }]}>{fmt(result.totalScore)}%</Text>
                <Text style={[ss.heroGPA, { color: sub }]}>{fmt(result.grade.point, 2)} GPA</Text>
                <View style={[ss.heroBar, { backgroundColor: border }]}>
                  <View style={[ss.heroBarFill, { width: `${Math.min(result.totalScore, 100)}%` as any, backgroundColor: gc }]} />
                </View>
              </View>
            </View>
            <View style={[ss.heroChips, { borderTopColor: gc + '22' }]}>
              <View style={ss.heroChip}>
                <Text style={[ss.heroChipLabel, { color: sub }]}>Carry ({config.carryWeight}%)</Text>
                <Text style={[ss.heroChipVal, { color: txt }]}>{fmt(result.carryEarned)} pts</Text>
              </View>
              {config.hasFinalExam && (
                <>
                  <View style={[ss.heroChipDivider, { backgroundColor: gc + '22' }]} />
                  <View style={ss.heroChip}>
                    <Text style={[ss.heroChipLabel, { color: sub }]}>Final ({config.finalWeight}%)</Text>
                    <Text style={[ss.heroChipVal, { color: txt }]}>{fmt(result.finalContribution)} pts</Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* ── Grading Scheme ─────────────────────────────────────────── */}
          <SectionLabel label="Grading Scheme" color={sub} />
          <View style={[ss.group, { backgroundColor: cardBg }]}>
            <Pressable
              style={({ pressed }) => [ss.row, pressed && { opacity: 0.7 }]}
              onPress={() => setSchemeSheet(true)}
            >
              <View style={[ss.rowIconWrap, { backgroundColor: pri + '15' }]}>
                <Feather name="award" size={16} color={pri} />
              </View>
              <View style={ss.rowBody}>
                <Text style={[ss.rowLabel, { color: txt }]}>
                  {useCustom ? 'Custom' : SCHEME_LABELS[config.gradingScheme]}
                </Text>
                <Text style={[ss.rowSub, { color: sub }]}>
                  {useCustom ? `${customRows.length} grade levels` : 'Tap to change or customise'}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={sub} />
            </Pressable>
          </View>

          {/* ── Weight Split ───────────────────────────────────────────── */}
          <SectionLabel label="Weight Split" color={sub} />
          <View style={[ss.group, { backgroundColor: cardBg }]}>
            {/* Has Final Exam */}
            <View style={[ss.row, ss.rowDivider, { borderBottomColor: border }]}>
              <View style={[ss.rowIconWrap, { backgroundColor: '#6366f115' }]}>
                <Feather name="file-text" size={16} color="#6366f1" />
              </View>
              <Text style={[ss.rowLabel, { color: txt, flex: 1 }]}>Has Final Exam</Text>
              <Switch
                value={config.hasFinalExam}
                onValueChange={v => update({
                  hasFinalExam: v,
                  carryWeight: v ? 40 : 100,
                  finalWeight: v ? 60 : 0,
                })}
                trackColor={{ true: pri, false: border }}
                thumbColor="#fff"
              />
            </View>

            {/* Carry weight stepper */}
            <View style={[ss.row, config.hasFinalExam ? [ss.rowDivider, { borderBottomColor: border }] : null]}>
              <View style={[ss.rowIconWrap, { backgroundColor: '#f59e0b15' }]}>
                <Feather name="percent" size={16} color="#f59e0b" />
              </View>
              <Text style={[ss.rowLabel, { color: txt, flex: 1 }]}>Carry Marks</Text>
              {config.hasFinalExam ? (
                <View style={ss.stepper}>
                  <Pressable
                    style={[ss.stepBtn, { backgroundColor: border }]}
                    onPress={() => { const w = Math.max(0, config.carryWeight - 5); update({ carryWeight: w, finalWeight: 100 - w }); }}
                  >
                    <Feather name="minus" size={14} color={txt} />
                  </Pressable>
                  <Text style={[ss.stepVal, { color: txt }]}>{config.carryWeight}%</Text>
                  <Pressable
                    style={[ss.stepBtn, { backgroundColor: border }]}
                    onPress={() => { const w = Math.min(100, config.carryWeight + 5); update({ carryWeight: w, finalWeight: 100 - w }); }}
                  >
                    <Feather name="plus" size={14} color={txt} />
                  </Pressable>
                </View>
              ) : (
                <Text style={[ss.rowVal, { color: sub }]}>100%</Text>
              )}
            </View>

            {/* Final weight (derived) */}
            {config.hasFinalExam && (
              <View style={ss.row}>
                <View style={[ss.rowIconWrap, { backgroundColor: '#ec489915' }]}>
                  <Feather name="book-open" size={16} color="#ec4899" />
                </View>
                <Text style={[ss.rowLabel, { color: txt, flex: 1 }]}>Final Exam</Text>
                <Text style={[ss.rowVal, { color: sub }]}>{config.finalWeight}%</Text>
              </View>
            )}
          </View>

          {/* ── Carry Mark Assessments ─────────────────────────────────── */}
          <View style={ss.sectionHeaderRow}>
            <SectionLabel label="Carry Marks" color={sub} />
            {config.assessments.length > 0 && !wValid && (
              <Text style={[ss.warnText, { color: '#f59e0b' }]}>
                {wTotal > 100 ? `Over ${fmt(wTotal - 100)}%` : `${fmt(wRemaining)}% left`}
              </Text>
            )}
          </View>

          <View style={[ss.group, { backgroundColor: cardBg }]}>
            {config.assessments.length === 0 ? (
              <View style={ss.emptyAssess}>
                <Feather name="list" size={22} color={sub} />
                <Text style={[ss.emptyAssessText, { color: sub }]}>No components yet</Text>
                <Text style={[ss.emptyAssessHint, { color: sub }]}>
                  Add your tests, assignments, quizzes…
                </Text>
              </View>
            ) : (
              config.assessments.map((a, idx) => {
                const isLast = idx === config.assessments.length - 1;
                const pct = a.scored !== null && a.maxScore > 0 ? (a.scored / a.maxScore) * 100 : null;
                const agc = pct !== null ? gradeColor(
                  activeRows.find(r => pct >= r.minPercent)?.letter ?? 'F'
                ) : sub;
                return (
                  <View
                    key={a.id}
                    style={!isLast ? [ss.assessRow, ss.rowDivider, { borderBottomColor: border }] : ss.assessRow}
                  >
                    <Pressable
                      style={ss.assessLeft}
                      onPress={() => openAddAssess(a)}
                      onLongPress={() => deleteAssessment(a.id)}
                    >
                      <View style={ss.assessNameRow}>
                        <Text style={[ss.assessName, { color: txt }]} numberOfLines={1}>{a.name}</Text>
                        <View style={[ss.weightBadge, { backgroundColor: pri + '15' }]}>
                          <Text style={[ss.weightBadgeText, { color: pri }]}>{a.weight}%</Text>
                        </View>
                      </View>
                      {pct !== null && (
                        <View style={ss.miniBarWrap}>
                          <View style={[ss.miniBarBg, { backgroundColor: border }]}>
                            <View style={[ss.miniBarFill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: agc }]} />
                          </View>
                          <Text style={[ss.miniBarPct, { color: agc }]}>{fmt(pct)}%</Text>
                        </View>
                      )}
                    </Pressable>
                    <View style={ss.scoreCell}>
                      <TextInput
                        style={[ss.scoreBox, { color: txt, backgroundColor: dark ? border + '60' : theme.backgroundSecondary, borderColor: border }]}
                        value={a.scored !== null ? String(a.scored) : ''}
                        onChangeText={v => scoreChange(a.id, v)}
                        keyboardType="decimal-pad"
                        placeholder="–"
                        placeholderTextColor={border}
                        returnKeyType="done"
                      />
                      <Text style={[ss.scoreSlash, { color: sub }]}>/{a.maxScore}</Text>
                    </View>
                  </View>
                );
              })
            )}

            {/* Add row */}
            <Pressable
              style={({ pressed }) => [ss.addRow, { borderTopColor: border }, pressed && { opacity: 0.6 }]}
              onPress={() => openAddAssess()}
            >
              <Feather name="plus-circle" size={18} color={pri} />
              <Text style={[ss.addRowText, { color: pri }]}>Add Component</Text>
            </Pressable>
          </View>

          {/* ── Final Exam Score ──────────────────────────────────────── */}
          {config.hasFinalExam && (
            <>
              <SectionLabel label="Final Exam Score" color={sub} />
              <View style={[ss.group, { backgroundColor: cardBg }]}>
                <View style={[ss.row, ss.rowDivider, { borderBottomColor: border }]}>
                  <View style={[ss.rowIconWrap, { backgroundColor: '#ec489915' }]}>
                    <Feather name="edit-3" size={16} color="#ec4899" />
                  </View>
                  <Text style={[ss.rowLabel, { color: txt, flex: 1 }]}>Score</Text>
                  <View style={ss.scoreCell}>
                    <TextInput
                      style={[ss.scoreBox, ss.scoreBoxLg, { color: txt, backgroundColor: dark ? border + '60' : theme.backgroundSecondary, borderColor: border }]}
                      value={config.finalExamScored !== null ? String(config.finalExamScored) : ''}
                      onChangeText={v => update({ finalExamScored: v.trim() ? parseFloat(v) : null })}
                      keyboardType="decimal-pad"
                      placeholder="–"
                      placeholderTextColor={border}
                      returnKeyType="done"
                    />
                    <Text style={[ss.scoreSlash, { color: sub }]}>/{config.finalExamMaxScore}</Text>
                  </View>
                </View>
                <View style={ss.row}>
                  <View style={[ss.rowIconWrap, { backgroundColor: '#8b5cf615' }]}>
                    <Feather name="maximize-2" size={16} color="#8b5cf6" />
                  </View>
                  <Text style={[ss.rowLabel, { color: txt, flex: 1 }]}>Full Marks</Text>
                  <TextInput
                    style={[ss.scoreBox, { color: txt, backgroundColor: dark ? border + '60' : theme.backgroundSecondary, borderColor: border }]}
                    value={String(config.finalExamMaxScore)}
                    onChangeText={v => update({ finalExamMaxScore: parseFloat(v) || 100 })}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </View>
              </View>
            </>
          )}

          {/* ── What do I need? ─────────────────────────────────────── */}
          {config.hasFinalExam && (
            <>
              <SectionLabel label="What do I need in final?" color={sub} />
              <View style={[ss.group, { backgroundColor: cardBg }]}>
                {result.requiredForGrades.map((r, idx, arr) => {
                  const gc2 = gradeColor(r.grade);
                  const isCurrent = result.grade.letter === r.grade;
                  return (
                    <View
                      key={r.grade}
                      style={[
                        ss.needRow,
                        idx !== arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border },
                        isCurrent && { backgroundColor: gc2 + '0D' },
                      ]}
                    >
                      <View style={[ss.needGrade, { backgroundColor: gc2 + '18' }]}>
                        <Text style={[ss.needGradeLetter, { color: gc2 }]}>{r.grade}</Text>
                      </View>
                      <Text style={[ss.needGPA, { color: sub }]}>{fmt(r.point, 2)}</Text>
                      <View style={ss.needRight}>
                        {r.achievable ? (
                          <Text style={[ss.needScore, { color: isCurrent ? gc2 : txt }]}>{fmt(r.required)}%</Text>
                        ) : (
                          <View style={[ss.notChip, { backgroundColor: '#ef444415' }]}>
                            <Feather name="x" size={12} color="#ef4444" />
                            <Text style={ss.notChipText}>Not achievable</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Grade Table Preview ──────────────────────────────────── */}
          <SectionLabel label="Grade Table" color={sub} />
          <View style={[ss.group, { backgroundColor: cardBg }]}>
            {activeRows.map((g, idx, arr) => {
              const isCurrent = result.grade.letter === g.letter;
              const gc3 = gradeColor(g.letter);
              return (
                <View
                  key={`${g.letter}-${idx}`}
                  style={[
                    ss.gradeRow,
                    idx !== arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border },
                    isCurrent && { backgroundColor: gc3 + '0F' },
                  ]}
                >
                  <Text style={[ss.gradeRowLetter, { color: gc3, fontWeight: isCurrent ? '800' : '700' }]}>{g.letter}</Text>
                  <Text style={[ss.gradeRowRange, { color: sub }]}>{g.minPercent}–{g.maxPercent}%</Text>
                  <Text style={[ss.gradeRowPts, { color: isCurrent ? gc3 : txt, fontWeight: isCurrent ? '800' : '600' }]}>{fmt(g.point, 2)}</Text>
                  {isCurrent && <Feather name="check" size={14} color={gc3} style={{ marginLeft: 6 }} />}
                </View>
              );
            })}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ═══════════════════════════════════════════════════════════════════
          Scheme picker bottom sheet
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={schemeSheet} transparent animationType="slide" onRequestClose={() => setSchemeSheet(false)}>
        <View style={ss.sheetOverlay}>
          <Pressable style={ss.sheetBackdrop} onPress={() => setSchemeSheet(false)} />
          <View style={[ss.sheet, { backgroundColor: cardBg, paddingBottom: insets.bottom + 16 }]}>
            <View style={[ss.sheetHandle, { backgroundColor: border }]} />
            <Text style={[ss.sheetTitle, { color: txt }]}>Grading Scheme</Text>
            <Text style={[ss.sheetHint, { color: sub }]}>Choose a preset or customise your own grade table.</Text>

            {PRESETS.map(p => (
              <Pressable
                key={p.key}
                style={({ pressed }) => [ss.schemeOpt, { borderColor: border }, pressed && { opacity: 0.7 },
                  config.gradingScheme === p.key && !useCustom && { borderColor: pri, backgroundColor: pri + '0A' }]}
                onPress={() => applyPreset(p.key)}
              >
                <View style={ss.schemeOptLeft}>
                  <Text style={[ss.schemeOptLabel, { color: txt }]}>{p.label}</Text>
                  <Text style={[ss.schemeOptSub, { color: sub }]}>
                    {p.rows.slice(0, 4).map(r => `${r.letter} ${fmt(r.point, 2)}`).join(' · ')} …
                  </Text>
                </View>
                {config.gradingScheme === p.key && !useCustom && (
                  <Feather name="check-circle" size={18} color={pri} />
                )}
              </Pressable>
            ))}

            <Pressable
              style={({ pressed }) => [ss.schemeOpt, { borderColor: border }, pressed && { opacity: 0.7 },
                useCustom && { borderColor: pri, backgroundColor: pri + '0A' }]}
              onPress={openGradeEditor}
            >
              <View style={ss.schemeOptLeft}>
                <Text style={[ss.schemeOptLabel, { color: txt }]}>Custom</Text>
                <Text style={[ss.schemeOptSub, { color: sub }]}>
                  {useCustom ? `${customRows.length} grade levels (editable)` : 'Build your own grade table'}
                </Text>
              </View>
              <Feather name={useCustom ? 'check-circle' : 'edit-2'} size={18} color={useCustom ? pri : sub} />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          Full custom grade editor
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={gradeEditorOpen} transparent animationType="slide" onRequestClose={() => setGradeEditorOpen(false)}>
        <View style={ss.sheetOverlay}>
          <Pressable style={ss.sheetBackdrop} onPress={() => setGradeEditorOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={ss.sheetKAV}>
            <View style={[ss.sheetLarge, { backgroundColor: cardBg, paddingBottom: insets.bottom + 16 }]}>
              <View style={[ss.sheetHandle, { backgroundColor: border }]} />
              <View style={ss.sheetHeaderRow}>
                <Text style={[ss.sheetTitle, { color: txt }]}>Custom Grade Table</Text>
                <Pressable
                  onPress={() => { setUseCustom(true); setGradeEditorOpen(false); }}
                  style={({ pressed }) => [ss.doneBtn, { backgroundColor: pri }, pressed && { opacity: 0.85 }]}
                >
                  <Text style={ss.doneBtnText}>Done</Text>
                </Pressable>
              </View>
              <Text style={[ss.sheetHint, { color: sub }]}>
                Tap a row to edit. Long-press to delete. Min % is the lowest mark to get that grade.
              </Text>

              <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                {/* Header */}
                <View style={[ss.gradeEditorHeader, { borderBottomColor: border }]}>
                  <Text style={[ss.gradeEditorHeaderCell, { flex: 1, color: sub }]}>Grade</Text>
                  <Text style={[ss.gradeEditorHeaderCell, { flex: 2, color: sub }]}>Min %</Text>
                  <Text style={[ss.gradeEditorHeaderCell, { flex: 2, color: sub }]}>GPA Pt</Text>
                  <View style={{ width: 28 }} />
                </View>

                {[...customRows].sort((a, b) => b.minPercent - a.minPercent).map((row, idx) => {
                  const isEditing = editingRowIdx === idx;
                  return (
                    <View key={idx} style={[ss.gradeEditorRow, { borderBottomColor: border }]}>
                      {isEditing ? (
                        <>
                          <TextInput
                            style={[ss.gradeEditCell, { flex: 1, color: txt, borderColor: pri, backgroundColor: theme.backgroundSecondary }]}
                            value={gLetter} onChangeText={setGLetter}
                            placeholder="A+" placeholderTextColor={border}
                            autoFocus returnKeyType="next" autoCapitalize="characters"
                          />
                          <TextInput
                            style={[ss.gradeEditCell, { flex: 2, color: txt, borderColor: pri, backgroundColor: theme.backgroundSecondary }]}
                            value={gMin} onChangeText={setGMin}
                            placeholder="75" placeholderTextColor={border}
                            keyboardType="decimal-pad" returnKeyType="next"
                          />
                          <TextInput
                            style={[ss.gradeEditCell, { flex: 2, color: txt, borderColor: pri, backgroundColor: theme.backgroundSecondary }]}
                            value={gPoint} onChangeText={setGPoint}
                            placeholder="3.67" placeholderTextColor={border}
                            keyboardType="decimal-pad" returnKeyType="done"
                            onSubmitEditing={saveGradeRow}
                          />
                          <Pressable onPress={saveGradeRow} style={ss.gradeRowSaveBtn}>
                            <Feather name="check" size={16} color={pri} />
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable style={{ flex: 1 }} onPress={() => startEditRow(idx)} onLongPress={() => deleteGradeRow(idx)}>
                            <Text style={[ss.gradeEditorCell, { color: gradeColor(row.letter), fontWeight: '700' }]}>{row.letter}</Text>
                          </Pressable>
                          <Pressable style={{ flex: 2 }} onPress={() => startEditRow(idx)}>
                            <Text style={[ss.gradeEditorCell, { color: txt }]}>{row.minPercent}%</Text>
                          </Pressable>
                          <Pressable style={{ flex: 2 }} onPress={() => startEditRow(idx)}>
                            <Text style={[ss.gradeEditorCell, { color: txt }]}>{fmt(row.point, 2)}</Text>
                          </Pressable>
                          <Pressable onPress={() => deleteGradeRow(idx)} hitSlop={8}>
                            <Feather name="trash-2" size={15} color="#ef4444" />
                          </Pressable>
                        </>
                      )}
                    </View>
                  );
                })}

                {/* Add new grade row */}
                {editingRowIdx === customRows.length ? (
                  <View style={[ss.gradeEditorRow, { borderBottomColor: border }]}>
                    <TextInput
                      style={[ss.gradeEditCell, { flex: 1, color: txt, borderColor: pri, backgroundColor: theme.backgroundSecondary }]}
                      value={gLetter} onChangeText={setGLetter}
                      placeholder="A+" placeholderTextColor={border}
                      autoFocus returnKeyType="next" autoCapitalize="characters"
                    />
                    <TextInput
                      style={[ss.gradeEditCell, { flex: 2, color: txt, borderColor: pri, backgroundColor: theme.backgroundSecondary }]}
                      value={gMin} onChangeText={setGMin}
                      placeholder="90" placeholderTextColor={border}
                      keyboardType="decimal-pad" returnKeyType="next"
                    />
                    <TextInput
                      style={[ss.gradeEditCell, { flex: 2, color: txt, borderColor: pri, backgroundColor: theme.backgroundSecondary }]}
                      value={gPoint} onChangeText={setGPoint}
                      placeholder="4.00" placeholderTextColor={border}
                      keyboardType="decimal-pad" returnKeyType="done"
                      onSubmitEditing={() => {
                        const letter = gLetter.trim();
                        const min = parseFloat(gMin);
                        const point = parseFloat(gPoint);
                        if (!letter || isNaN(min) || isNaN(point)) return;
                        const next = [...customRows, { letter, minPercent: min, maxPercent: 100, point }];
                        const sorted = [...next].sort((a, b) => b.minPercent - a.minPercent).map((r, i, arr) => ({
                          ...r, maxPercent: i === 0 ? 100 : arr[i - 1].minPercent - 1,
                        }));
                        setCustomRows(sorted);
                        setUseCustom(true);
                        setEditingRowIdx(null);
                        setGLetter(''); setGMin(''); setGPoint('');
                      }}
                    />
                    <Pressable onPress={() => {
                      const letter = gLetter.trim();
                      const min = parseFloat(gMin);
                      const point = parseFloat(gPoint);
                      if (!letter || isNaN(min) || isNaN(point)) return;
                      const next = [...customRows, { letter, minPercent: min, maxPercent: 100, point }];
                      const sorted = [...next].sort((a, b) => b.minPercent - a.minPercent).map((r, i, arr) => ({
                        ...r, maxPercent: i === 0 ? 100 : arr[i - 1].minPercent - 1,
                      }));
                      setCustomRows(sorted);
                      setUseCustom(true);
                      setEditingRowIdx(null);
                      setGLetter(''); setGMin(''); setGPoint('');
                    }} style={ss.gradeRowSaveBtn}>
                      <Feather name="check" size={16} color={pri} />
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>

              <Pressable
                style={({ pressed }) => [ss.addGradeRowBtn, { borderColor: pri + '40', backgroundColor: pri + '0A' }, pressed && { opacity: 0.7 }]}
                onPress={addGradeRow}
              >
                <Feather name="plus" size={16} color={pri} />
                <Text style={[ss.addGradeRowText, { color: pri }]}>Add Grade Level</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          Add / Edit Assessment Sheet
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={addAssessOpen} transparent animationType="slide" onRequestClose={() => setAddAssessOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[ss.sheetOverlay, { justifyContent: 'flex-end' }]} onPress={() => setAddAssessOpen(false)}>
            <Pressable
              style={[ss.sheet, { backgroundColor: cardBg, paddingBottom: insets.bottom + 16 }]}
              onPress={() => {}}
            >
              <View style={[ss.sheetHandle, { backgroundColor: border }]} />
              <Text style={[ss.sheetTitle, { color: txt }]}>
                {editAssess ? 'Edit Component' : 'Add Component'}
              </Text>
              <Text style={[ss.sheetHint, { color: sub }]}>e.g. Test 1, Assignment 2, Lab Report</Text>

              {/* Name */}
              <Text style={[ss.fieldLabel, { color: sub }]}>Name</Text>
              <TextInput
                style={[ss.fieldInput, { color: txt, backgroundColor: theme.backgroundSecondary, borderColor: border }]}
                value={fName} onChangeText={setFName}
                placeholder="Mid-Semester Test" placeholderTextColor={border}
                autoFocus returnKeyType="next"
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.fieldLabel, { color: sub }]}>Weight (%)</Text>
                  <TextInput
                    style={[ss.fieldInput, { color: txt, backgroundColor: theme.backgroundSecondary, borderColor: border }]}
                    value={fWeight} onChangeText={setFWeight}
                    placeholder="30" placeholderTextColor={border}
                    keyboardType="decimal-pad" returnKeyType="next"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.fieldLabel, { color: sub }]}>Max Score</Text>
                  <TextInput
                    style={[ss.fieldInput, { color: txt, backgroundColor: theme.backgroundSecondary, borderColor: border }]}
                    value={fMax} onChangeText={setFMax}
                    placeholder="100" placeholderTextColor={border}
                    keyboardType="decimal-pad" returnKeyType="next"
                  />
                </View>
              </View>

              <Text style={[ss.fieldLabel, { color: sub }]}>Score <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
              <TextInput
                style={[ss.fieldInput, { color: txt, backgroundColor: theme.backgroundSecondary, borderColor: border }]}
                value={fScored} onChangeText={setFScored}
                placeholder="Leave blank if not yet available"
                placeholderTextColor={border}
                keyboardType="decimal-pad" returnKeyType="done"
                onSubmitEditing={saveAssessment}
              />

              <Pressable
                style={({ pressed }) => [ss.primaryBtn, { backgroundColor: pri }, pressed && { opacity: 0.88 }]}
                onPress={saveAssessment}
              >
                <Text style={ss.primaryBtnText}>{editAssess ? 'Save Changes' : 'Add Component'}</Text>
              </Pressable>

              {editAssess && (
                <Pressable
                  style={({ pressed }) => [ss.ghostBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => { setAddAssessOpen(false); deleteAssessment(editAssess.id); }}
                >
                  <Text style={ss.ghostBtnDanger}>Remove Component</Text>
                </Pressable>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Nav
  navbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 8 },
  navBack: { fontSize: 17, fontWeight: '400' },
  navCenter: { flex: 1, alignItems: 'center' },
  navTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  navSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  navRight: { width: 56, alignItems: 'flex-end' },
  navSaved: { fontSize: 12, fontWeight: '500' },

  scroll: { paddingHorizontal: 16 },

  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  warnText: { fontSize: 12, fontWeight: '600', marginBottom: 8 },

  // Hero
  hero: {
    borderRadius: 20, borderWidth: 1,
    marginTop: 16, marginBottom: 4,
    overflow: 'hidden',
  },
  heroMain: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 18 },
  heroGradeBubble: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  heroGradeLetter: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  heroInfo: { flex: 1 },
  heroScore: { fontSize: 34, fontWeight: '800', letterSpacing: -1, lineHeight: 38 },
  heroGPA: { fontSize: 14, fontWeight: '600', marginTop: 2, marginBottom: 8 },
  heroBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  heroBarFill: { height: '100%', borderRadius: 3 },
  heroChips: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 12, paddingHorizontal: 18 },
  heroChip: { flex: 1, alignItems: 'center' },
  heroChipLabel: { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  heroChipVal: { fontSize: 15, fontWeight: '700' },
  heroChipDivider: { width: 1, marginHorizontal: 16 },

  // Group / Row (Apple style)
  group: {
    borderRadius: 12, overflow: 'hidden',
    marginBottom: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: {},
    }),
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
  rowSub: { fontSize: 12, fontWeight: '400', marginTop: 1 },
  rowVal: { fontSize: 16, fontWeight: '600' },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 16, fontWeight: '700', minWidth: 42, textAlign: 'center' },

  // Assessments
  emptyAssess: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  emptyAssessText: { fontSize: 15, fontWeight: '600' },
  emptyAssessHint: { fontSize: 13, fontWeight: '400' },
  assessRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  assessLeft: { flex: 1 },
  assessNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  assessName: { fontSize: 15, fontWeight: '600', flex: 1 },
  weightBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  weightBadgeText: { fontSize: 11, fontWeight: '700' },
  miniBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniBarBg: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 2 },
  miniBarPct: { fontSize: 11, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addRowText: { fontSize: 16, fontWeight: '600' },

  // Score input
  scoreCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreBox: {
    width: 56, paddingHorizontal: 8, paddingVertical: 8,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15, fontWeight: '600', textAlign: 'center',
  },
  scoreBoxLg: { width: 68 },
  scoreSlash: { fontSize: 13, fontWeight: '500' },

  // What do I need
  needRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  needGrade: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  needGradeLetter: { fontSize: 15, fontWeight: '800' },
  needGPA: { fontSize: 13, fontWeight: '500', width: 40 },
  needRight: { flex: 1, alignItems: 'flex-end' },
  needScore: { fontSize: 17, fontWeight: '800' },
  notChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  notChipText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },

  // Grade table rows
  gradeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11 },
  gradeRowLetter: { width: 38, fontSize: 15 },
  gradeRowRange: { flex: 1, fontSize: 13 },
  gradeRowPts: { fontSize: 15 },

  // Bottom sheets
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject },
  sheetKAV: { justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  sheetLarge: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sheetHint: { fontSize: 13, lineHeight: 19, marginBottom: 18 },

  doneBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Scheme options
  schemeOpt: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 10,
  },
  schemeOptLeft: { flex: 1 },
  schemeOptLabel: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  schemeOptSub: { fontSize: 12, fontWeight: '400' },

  // Grade editor
  gradeEditorHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 4, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  gradeEditorHeaderCell: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  gradeEditorRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gradeEditorCell: { fontSize: 15, fontWeight: '600', paddingVertical: 4 },
  gradeEditCell: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 7,
    fontSize: 14, fontWeight: '600',
  },
  gradeRowSaveBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addGradeRowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, borderStyle: 'dashed',
    paddingVertical: 13, justifyContent: 'center', marginTop: 14,
  },
  addGradeRowText: { fontSize: 15, fontWeight: '700' },

  // Assessment modal fields
  fieldLabel: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.4, marginBottom: 7, marginTop: 14,
  },
  fieldInput: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },

  // Buttons
  primaryBtn: {
    paddingVertical: 15, borderRadius: 14,
    alignItems: 'center', marginTop: 18,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  ghostBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  ghostBtnDanger: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
});
