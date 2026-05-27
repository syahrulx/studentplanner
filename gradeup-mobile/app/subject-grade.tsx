import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput,
  Switch, Alert, Modal, Platform, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import type { SubjectGradeConfig, GradeAssessment, GradingScheme } from '@/src/types';
import {
  calculateGrade, validateAssessmentWeights, gradeColor,
  getGradeTable, SCHEME_LABELS,
} from '@/src/lib/gradeCalculator';
import { getSubjectGradeConfig, saveSubjectGradeConfig } from '@/src/lib/gradeStorage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

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

function fmt(n: number, dp = 1) {
  return n.toFixed(dp);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubjectGradeScreen() {
  const { subjectId: rawParam } = useLocalSearchParams<{ subjectId: string }>();
  const subjectId = typeof rawParam === 'string' ? rawParam : Array.isArray(rawParam) ? rawParam[0] : '';
  const { user, courses } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const course = useMemo(() => courses.find(c => c.id === subjectId), [courses, subjectId]);

  // ── State ──
  const [config, setConfig] = useState<SubjectGradeConfig>(makeDefault(subjectId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSchemeModal, setShowSchemeModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editAssessment, setEditAssessment] = useState<GradeAssessment | null>(null);

  // Add/edit form state
  const [formName, setFormName] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formMaxScore, setFormMaxScore] = useState('100');
  const [formScored, setFormScored] = useState('');

  // ── Load ──
  useEffect(() => {
    if (!user?.id || !subjectId) { setLoading(false); return; }
    setLoading(true);
    getSubjectGradeConfig(user.id, subjectId).then(c => {
      setConfig(c ?? makeDefault(subjectId));
      setLoading(false);
    });
  }, [user?.id, subjectId]);

  // ── Auto-save (debounced) ──
  const save = useCallback(async (next: SubjectGradeConfig) => {
    if (!user?.id) return;
    setSaving(true);
    await saveSubjectGradeConfig(user.id, next);
    setSaving(false);
  }, [user?.id]);

  function update(partial: Partial<SubjectGradeConfig>) {
    const next = { ...config, ...partial };
    setConfig(next);
    void save(next);
  }

  // ── Carry weight stepper ──
  function adjustCarryWeight(delta: number) {
    const next = Math.max(0, Math.min(100, config.carryWeight + delta));
    const finalW = 100 - next;
    update({ carryWeight: next, finalWeight: finalW });
  }

  // ── Assessment modal ──
  function openAddModal(existing?: GradeAssessment) {
    if (existing) {
      setEditAssessment(existing);
      setFormName(existing.name);
      setFormWeight(String(existing.weight));
      setFormMaxScore(String(existing.maxScore));
      setFormScored(existing.scored !== null ? String(existing.scored) : '');
    } else {
      setEditAssessment(null);
      setFormName('');
      // Suggest remaining weight
      const { remaining } = validateAssessmentWeights(config.assessments);
      setFormWeight(remaining > 0 ? String(remaining) : '');
      setFormMaxScore('100');
      setFormScored('');
    }
    setShowAddModal(true);
  }

  function handleSaveAssessment() {
    const name = formName.trim();
    const weight = parseFloat(formWeight);
    const maxScore = parseFloat(formMaxScore);
    const scored = formScored.trim() ? parseFloat(formScored) : null;

    if (!name) { Alert.alert('Name required', 'Please enter a name for this assessment.'); return; }
    if (isNaN(weight) || weight <= 0 || weight > 100) { Alert.alert('Invalid weight', 'Weight must be between 1 and 100.'); return; }
    if (isNaN(maxScore) || maxScore <= 0) { Alert.alert('Invalid max score', 'Max score must be greater than 0.'); return; }
    if (scored !== null && (isNaN(scored) || scored < 0)) { Alert.alert('Invalid score', 'Score must be 0 or greater.'); return; }

    let next: GradeAssessment[];
    if (editAssessment) {
      next = config.assessments.map(a => a.id === editAssessment.id
        ? { ...a, name, weight, maxScore, scored } : a);
    } else {
      next = [...config.assessments, { id: uid(), name, weight, maxScore, scored }];
    }

    const { total } = validateAssessmentWeights(next);
    if (total > 100.01) {
      Alert.alert('Weight exceeds 100%', `Total carry mark weight is ${fmt(total)}%. Reduce this component's weight.`);
      return;
    }

    setShowAddModal(false);
    update({ assessments: next });
  }

  function handleDeleteAssessment(id: string) {
    Alert.alert('Remove component', 'Remove this assessment component?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        update({ assessments: config.assessments.filter(a => a.id !== id) });
      }},
    ]);
  }

  function handleScoreChange(id: string, raw: string) {
    const scored = raw.trim() ? parseFloat(raw) : null;
    const next = config.assessments.map(a => a.id === id ? { ...a, scored } : a);
    update({ assessments: next });
  }

  // ── Grade result ──
  const result = useMemo(() => calculateGrade(config), [config]);
  const { total: totalWeight, valid: weightsValid, remaining: weightRemaining } = useMemo(
    () => validateAssessmentWeights(config.assessments), [config.assessments]);
  const gc = gradeColor(result.grade.letter);

  if (loading) {
    return (
      <View style={[s.loadWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 10, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={[s.headerBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>{subjectId}</Text>
          {course && <Text style={[s.headerSub, { color: theme.textSecondary }]} numberOfLines={1}>{course.name}</Text>}
        </View>
        {saving
          ? <ActivityIndicator size="small" color={theme.primary} style={{ marginRight: 4 }} />
          : <View style={[s.saveIndicator, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="check" size={12} color={theme.primary} />
              <Text style={[s.saveText, { color: theme.primary }]}>Saved</Text>
            </View>
        }
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Grade Result Hero ── */}
        <View style={[s.heroCard, { backgroundColor: gc + '15', borderColor: gc + '30' }]}>
          <View style={s.heroRow}>
            <View>
              <Text style={[s.heroGradeLabel, { color: gc }]}>Current Grade</Text>
              <Text style={[s.heroGrade, { color: gc }]}>{result.grade.letter}</Text>
              <Text style={[s.heroGPA, { color: gc }]}>{fmt(result.grade.point, 2)} GPA</Text>
            </View>
            <View style={s.heroRight}>
              <Text style={[s.heroTotalLabel, { color: theme.textSecondary }]}>Total Score</Text>
              <Text style={[s.heroTotal, { color: theme.text }]}>{fmt(result.totalScore)}%</Text>
              <View style={[s.heroProgressBg, { backgroundColor: theme.backgroundSecondary }]}>
                <View style={[s.heroProgressFill, {
                  width: `${Math.min(result.totalScore, 100)}%` as any,
                  backgroundColor: gc,
                }]} />
              </View>
            </View>
          </View>

          <View style={[s.heroBreakdownRow, { borderTopColor: gc + '25' }]}>
            <View style={s.heroBreakdownItem}>
              <Text style={[s.heroBreakdownLabel, { color: theme.textSecondary }]}>Carry ({config.carryWeight}%)</Text>
              <Text style={[s.heroBreakdownValue, { color: theme.text }]}>{fmt(result.carryEarned)} / {fmt(result.carryPossible)}</Text>
            </View>
            {config.hasFinalExam && (
              <View style={[s.heroBreakdownDivider, { backgroundColor: gc + '25' }]} />
            )}
            {config.hasFinalExam && (
              <View style={s.heroBreakdownItem}>
                <Text style={[s.heroBreakdownLabel, { color: theme.textSecondary }]}>Final ({config.finalWeight}%)</Text>
                <Text style={[s.heroBreakdownValue, { color: theme.text }]}>{fmt(result.finalContribution)} / {fmt(config.finalWeight)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Section: Grading Scheme ── */}
        <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>GRADING SCHEME</Text>
        <View style={[s.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable
            style={({ pressed }) => [s.groupRow, { borderBottomWidth: 0 }, pressed && { opacity: 0.7 }]}
            onPress={() => setShowSchemeModal(true)}
          >
            <Feather name="award" size={18} color={theme.primary} style={s.groupRowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[s.groupRowLabel, { color: theme.text }]}>Scheme</Text>
              <Text style={[s.groupRowSub, { color: theme.textSecondary }]}>{SCHEME_LABELS[config.gradingScheme]}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>

        {/* ── Section: Weight Configuration ── */}
        <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>WEIGHT SPLIT</Text>
        <View style={[s.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Has Final Exam toggle */}
          <View style={[s.groupRow, { borderBottomColor: theme.border }]}>
            <Feather name="file-text" size={18} color={theme.primary} style={s.groupRowIcon} />
            <Text style={[s.groupRowLabel, { color: theme.text, flex: 1 }]}>Has Final Exam</Text>
            <Switch
              value={config.hasFinalExam}
              onValueChange={v => {
                const carry = v ? 40 : 100;
                update({ hasFinalExam: v, carryWeight: carry, finalWeight: 100 - carry });
              }}
              trackColor={{ true: theme.primary, false: theme.border }}
            />
          </View>

          {/* Carry weight stepper */}
          <View style={[s.groupRow, { borderBottomColor: theme.border, borderBottomWidth: config.hasFinalExam ? StyleSheet.hairlineWidth : 0 }]}>
            <Feather name="percent" size={18} color={theme.primary} style={s.groupRowIcon} />
            <Text style={[s.groupRowLabel, { color: theme.text, flex: 1 }]}>Carry Marks</Text>
            {config.hasFinalExam ? (
              <View style={s.stepper}>
                <Pressable
                  onPress={() => adjustCarryWeight(-5)}
                  style={[s.stepperBtn, { backgroundColor: theme.backgroundSecondary }]}
                  disabled={config.carryWeight <= 0}
                >
                  <Feather name="minus" size={14} color={config.carryWeight <= 0 ? theme.border : theme.text} />
                </Pressable>
                <Text style={[s.stepperVal, { color: theme.text }]}>{config.carryWeight}%</Text>
                <Pressable
                  onPress={() => adjustCarryWeight(5)}
                  style={[s.stepperBtn, { backgroundColor: theme.backgroundSecondary }]}
                  disabled={config.carryWeight >= 100}
                >
                  <Feather name="plus" size={14} color={config.carryWeight >= 100 ? theme.border : theme.text} />
                </Pressable>
              </View>
            ) : (
              <Text style={[s.stepperVal, { color: theme.primary }]}>100%</Text>
            )}
          </View>

          {/* Final exam weight (derived) */}
          {config.hasFinalExam && (
            <View style={[s.groupRow, { borderBottomWidth: 0 }]}>
              <Feather name="book" size={18} color={theme.primary} style={s.groupRowIcon} />
              <Text style={[s.groupRowLabel, { color: theme.text, flex: 1 }]}>Final Exam</Text>
              <Text style={[s.stepperVal, { color: theme.textSecondary }]}>{config.finalWeight}%</Text>
            </View>
          )}
        </View>

        {/* ── Section: Carry Mark Assessments ── */}
        <View style={s.sectionHeaderRow}>
          <Text style={[s.sectionLabel, { color: theme.textSecondary, marginBottom: 0 }]}>CARRY MARKS</Text>
          {!weightsValid && config.assessments.length > 0 && (
            <Text style={[s.weightWarning, { color: '#f59e0b' }]}>
              {totalWeight > 100 ? `Over by ${fmt(totalWeight - 100)}%` : `${fmt(weightRemaining)}% unassigned`}
            </Text>
          )}
        </View>

        <View style={[s.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {config.assessments.map((a, idx) => {
            const isLast = idx === config.assessments.length - 1;
            const earnedPct = a.scored !== null && a.maxScore > 0
              ? (a.scored / a.maxScore) * 100 : null;
            return (
              <View key={a.id}>
                <View style={[s.assessmentRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
                  <Pressable
                    style={s.assessmentLeft}
                    onPress={() => openAddModal(a)}
                    onLongPress={() => handleDeleteAssessment(a.id)}
                  >
                    <View style={s.assessmentMeta}>
                      <Text style={[s.assessmentName, { color: theme.text }]} numberOfLines={1}>{a.name}</Text>
                      <View style={[s.assessmentWeightPill, { backgroundColor: theme.primary + '15' }]}>
                        <Text style={[s.assessmentWeightText, { color: theme.primary }]}>{a.weight}%</Text>
                      </View>
                    </View>
                    {earnedPct !== null && (
                      <View style={[s.miniProgressBg, { backgroundColor: theme.backgroundSecondary }]}>
                        <View style={[s.miniProgressFill, {
                          width: `${Math.min(earnedPct, 100)}%` as any,
                          backgroundColor: gradeColor('A'),
                        }]} />
                      </View>
                    )}
                  </Pressable>

                  <View style={s.scoreInputWrap}>
                    <TextInput
                      style={[s.scoreInput, { color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                      value={a.scored !== null ? String(a.scored) : ''}
                      onChangeText={v => handleScoreChange(a.id, v)}
                      keyboardType="decimal-pad"
                      placeholder="–"
                      placeholderTextColor={theme.border}
                      returnKeyType="done"
                    />
                    <Text style={[s.scoreMax, { color: theme.textSecondary }]}>/{a.maxScore}</Text>
                  </View>
                </View>
              </View>
            );
          })}

          <Pressable
            style={({ pressed }) => [s.addComponentBtn, pressed && { opacity: 0.7 }]}
            onPress={() => openAddModal()}
          >
            <View style={[s.addComponentIcon, { backgroundColor: theme.primary + '15' }]}>
              <Feather name="plus" size={16} color={theme.primary} />
            </View>
            <Text style={[s.addComponentText, { color: theme.primary }]}>Add Assessment Component</Text>
          </Pressable>
        </View>

        {/* ── Final Exam Score ── */}
        {config.hasFinalExam && (
          <>
            <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>FINAL EXAM SCORE</Text>
            <View style={[s.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[s.groupRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
                <Feather name="edit-3" size={18} color={theme.primary} style={s.groupRowIcon} />
                <Text style={[s.groupRowLabel, { color: theme.text, flex: 1 }]}>Score</Text>
                <View style={s.scoreInputWrap}>
                  <TextInput
                    style={[s.scoreInput, s.scoreInputLarge, { color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                    value={config.finalExamScored !== null ? String(config.finalExamScored) : ''}
                    onChangeText={v => update({ finalExamScored: v.trim() ? parseFloat(v) : null })}
                    keyboardType="decimal-pad"
                    placeholder="–"
                    placeholderTextColor={theme.border}
                    returnKeyType="done"
                  />
                  <Text style={[s.scoreMax, { color: theme.textSecondary }]}>/{config.finalExamMaxScore}</Text>
                </View>
              </View>
              <View style={[s.groupRow, { borderBottomWidth: 0 }]}>
                <Feather name="maximize-2" size={18} color={theme.primary} style={s.groupRowIcon} />
                <Text style={[s.groupRowLabel, { color: theme.text, flex: 1 }]}>Full Marks</Text>
                <TextInput
                  style={[s.scoreInput, { color: theme.text, backgroundColor: theme.backgroundSecondary }]}
                  value={String(config.finalExamMaxScore)}
                  onChangeText={v => update({ finalExamMaxScore: parseFloat(v) || 100 })}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          </>
        )}

        {/* ── What do I need? ── */}
        {config.hasFinalExam && (
          <>
            <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>WHAT DO I NEED IN FINAL EXAM?</Text>
            <View style={[s.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {result.requiredForGrades.map((r, idx) => {
                const isLast = idx === result.requiredForGrades.length - 1;
                const gc2 = gradeColor(r.grade);
                return (
                  <View key={r.grade} style={[s.requiredRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
                    <View style={[s.requiredGradePill, { backgroundColor: gc2 + '18' }]}>
                      <Text style={[s.requiredGradeLetter, { color: gc2 }]}>{r.grade}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[s.requiredGPAText, { color: theme.textSecondary }]}>{fmt(r.point, 2)} GPA</Text>
                    </View>
                    {r.achievable ? (
                      <Text style={[s.requiredScore, { color: gc2 }]}>{fmt(r.required)}%</Text>
                    ) : (
                      <View style={[s.notAchievableChip, { backgroundColor: '#ef444418' }]}>
                        <Feather name="x" size={11} color="#ef4444" />
                        <Text style={s.notAchievableText}>Not achievable</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Grade Table Reference ── */}
        <Text style={[s.sectionLabel, { color: theme.textSecondary }]}>GRADE TABLE</Text>
        <View style={[s.groupCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {getGradeTable(config.gradingScheme).map((g, idx, arr) => {
            const isLast = idx === arr.length - 1;
            const isCurrent = result.grade.letter === g.letter;
            const gc3 = gradeColor(g.letter);
            return (
              <View key={g.letter} style={[
                s.gradeTableRow,
                isCurrent && { backgroundColor: gc3 + '10' },
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
              ]}>
                <Text style={[s.gradeTableLetter, { color: gc3, fontWeight: isCurrent ? '800' : '600' }]}>{g.letter}</Text>
                <Text style={[s.gradeTableRange, { color: theme.textSecondary }]}>{g.minPercent}–{g.maxPercent}%</Text>
                <Text style={[s.gradeTablePoint, { color: isCurrent ? gc3 : theme.text, fontWeight: isCurrent ? '800' : '600' }]}>{fmt(g.point, 2)}</Text>
                {isCurrent && <Feather name="check-circle" size={14} color={gc3} style={{ marginLeft: 8 }} />}
              </View>
            );
          })}
        </View>

      </ScrollView>

      {/* ── Grading Scheme Modal ── */}
      <Modal visible={showSchemeModal} transparent animationType="fade" onRequestClose={() => setShowSchemeModal(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setShowSchemeModal(false)}>
          <View style={[s.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]} onStartShouldSetResponder={() => true}>
            <Text style={[s.modalTitle, { color: theme.text }]}>Grading Scheme</Text>
            <Text style={[s.modalSub, { color: theme.textSecondary }]}>Choose the grading scheme used by your university.</Text>
            {(['uitm', 'generic_4', 'generic_5'] as GradingScheme[]).map(scheme => (
              <Pressable
                key={scheme}
                style={({ pressed }) => [s.schemeOption, pressed && { opacity: 0.7 }, config.gradingScheme === scheme && { backgroundColor: theme.primary + '12' }]}
                onPress={() => { update({ gradingScheme: scheme }); setShowSchemeModal(false); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.schemeLabel, { color: theme.text }]}>{SCHEME_LABELS[scheme]}</Text>
                  {scheme === 'uitm' && <Text style={[s.schemeSub, { color: theme.textSecondary }]}>A+ 4.00 · A 4.00 · A- 3.67 · B+ 3.33 …</Text>}
                  {scheme === 'generic_4' && <Text style={[s.schemeSub, { color: theme.textSecondary }]}>A 4.00 · B 3.00 · C 2.00 · D 1.00</Text>}
                  {scheme === 'generic_5' && <Text style={[s.schemeSub, { color: theme.textSecondary }]}>A 5.00 · B 4.00 · C 3.00 · D 2.00</Text>}
                </View>
                {config.gradingScheme === scheme && <Feather name="check" size={18} color={theme.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Add/Edit Assessment Modal ── */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.modalBackdrop} onPress={() => setShowAddModal(false)}>
            <Pressable style={[s.addModalSheet, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
              <View style={s.sheetHandle} />
              <Text style={[s.modalTitle, { color: theme.text }]}>{editAssessment ? 'Edit Component' : 'Add Component'}</Text>
              <Text style={[s.modalSub, { color: theme.textSecondary }]}>e.g. Test 1, Assignment 2, Lab Report</Text>

              <View style={[s.fieldWrap, { borderColor: theme.border }]}>
                <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Name</Text>
                <TextInput
                  style={[s.fieldInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="e.g. Mid-Sem Test"
                  placeholderTextColor={theme.border}
                  autoFocus
                  returnKeyType="next"
                />
              </View>

              <View style={s.formRow}>
                <View style={[s.fieldWrap, { flex: 1, borderColor: theme.border }]}>
                  <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Weight (%)</Text>
                  <TextInput
                    style={[s.fieldInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                    value={formWeight}
                    onChangeText={setFormWeight}
                    placeholder="30"
                    placeholderTextColor={theme.border}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={[s.fieldWrap, { flex: 1, borderColor: theme.border }]}>
                  <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Max Score</Text>
                  <TextInput
                    style={[s.fieldInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                    value={formMaxScore}
                    onChangeText={setFormMaxScore}
                    placeholder="100"
                    placeholderTextColor={theme.border}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={[s.fieldWrap, { borderColor: theme.border }]}>
                <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Score (optional)</Text>
                <TextInput
                  style={[s.fieldInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                  value={formScored}
                  onChangeText={setFormScored}
                  placeholder="Leave blank if not yet available"
                  placeholderTextColor={theme.border}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveAssessment}
                />
              </View>

              <Pressable
                style={({ pressed }) => [s.saveBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.88 }]}
                onPress={handleSaveAssessment}
              >
                <Text style={[s.saveBtnText, { color: theme.textInverse }]}>{editAssessment ? 'Save Changes' : 'Add Component'}</Text>
              </Pressable>

              {editAssessment && (
                <Pressable
                  style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => { setShowAddModal(false); handleDeleteAssessment(editAssessment.id); }}
                >
                  <Text style={s.deleteBtnText}>Remove Component</Text>
                </Pressable>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  saveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  saveText: { fontSize: 12, fontWeight: '600' },

  scroll: { paddingHorizontal: 16, paddingTop: 20 },

  // Section labels
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  weightWarning: { fontSize: 12, fontWeight: '600' },

  // Hero card
  heroCard: { borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 28 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, marginBottom: 16 },
  heroGradeLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 2 },
  heroGrade: { fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 56 },
  heroGPA: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  heroRight: { flex: 1, alignItems: 'flex-end' },
  heroTotalLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  heroTotal: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  heroProgressBg: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  heroProgressFill: { height: '100%', borderRadius: 3 },
  heroBreakdownRow: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 14, gap: 0 },
  heroBreakdownItem: { flex: 1, alignItems: 'center' },
  heroBreakdownLabel: { fontSize: 11, fontWeight: '600', marginBottom: 3 },
  heroBreakdownValue: { fontSize: 15, fontWeight: '700' },
  heroBreakdownDivider: { width: 1, marginHorizontal: 8 },

  // Group card (Apple-style)
  groupCard: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', marginBottom: 28,
    shadowColor: '#000', shadowOpacity: 0.03,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  groupRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupRowIcon: { marginRight: 12 },
  groupRowLabel: { fontSize: 16, fontWeight: '500' },
  groupRowSub: { fontSize: 13, marginTop: 1 },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { fontSize: 17, fontWeight: '700', minWidth: 44, textAlign: 'center' },

  // Assessment rows
  assessmentRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16, gap: 12,
  },
  assessmentLeft: { flex: 1 },
  assessmentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  assessmentName: { fontSize: 15, fontWeight: '600', flex: 1 },
  assessmentWeightPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  assessmentWeightText: { fontSize: 11, fontWeight: '700' },
  miniProgressBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  miniProgressFill: { height: '100%', borderRadius: 2 },
  scoreInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreInput: {
    width: 58, paddingHorizontal: 8, paddingVertical: 7,
    borderRadius: 10, fontSize: 15, fontWeight: '600', textAlign: 'center',
  },
  scoreInputLarge: { width: 72 },
  scoreMax: { fontSize: 14, fontWeight: '500' },

  addComponentBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  addComponentIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addComponentText: { fontSize: 16, fontWeight: '600' },

  // Required for grades
  requiredRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  requiredGradePill: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  requiredGradeLetter: { fontSize: 15, fontWeight: '800' },
  requiredGPAText: { fontSize: 13, fontWeight: '500' },
  requiredScore: { fontSize: 17, fontWeight: '800' },
  notAchievableChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  notAchievableText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },

  // Grade table
  gradeTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  gradeTableLetter: { width: 36, fontSize: 15 },
  gradeTableRange: { flex: 1, fontSize: 14 },
  gradeTablePoint: { fontSize: 15 },

  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 20, padding: 22, borderWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  modalSub: { fontSize: 14, marginBottom: 20, lineHeight: 20 },

  schemeOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, marginBottom: 6 },
  schemeLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  schemeSub: { fontSize: 12, fontWeight: '500' },

  // Add modal sheet
  addModalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 24, paddingTop: 12,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,150,0.3)', alignSelf: 'center', marginBottom: 20 },

  formRow: { flexDirection: 'row', marginBottom: 0 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 8, textTransform: 'uppercase' },
  fieldInput: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },

  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  deleteBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  deleteBtnText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
});
