import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, TextInput,
  Switch, Alert, Modal, Platform, ActivityIndicator,
  KeyboardAvoidingView
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
    subjectId, gradingScheme: 'uitm', hasFinalExam: true,
    carryWeight: 40, finalWeight: 60, assessments: [],
    finalExamScored: null, finalExamMaxScore: 100,
  };
}

const PRESETS: { key: GradingScheme; label: string; rows: GradeRow[] }[] = [
  { key: 'uitm',      label: 'UiTM Malaysia',  rows: UITM_GRADE_TABLE },
  { key: 'generic_4', label: 'Generic 4.0 GPA', rows: GENERIC_4_GRADE_TABLE },
  { key: 'generic_5', label: 'Generic 5.0 GPA', rows: GENERIC_5_GRADE_TABLE },
];

export default function SubjectGradeScreen() {
  const { subjectId: rawParam } = useLocalSearchParams<{ subjectId: string }>();
  const subjectId = typeof rawParam === 'string' ? rawParam : Array.isArray(rawParam) ? rawParam[0] : '';
  const { user, courses } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  
  const course = useMemo(() => courses.find(c => c.id === subjectId), [courses, subjectId]);
  const dark = theme.background === '#000000' || theme.background.startsWith('#0') || theme.background === '#121212';

  // ── State ──────────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<SubjectGradeConfig>(makeDefault(subjectId));
  const [loading, setLoading] = useState(true);

  // Custom grade rows
  const [customRows, setCustomRows] = useState<GradeRow[]>([]);
  const [useCustom, setUseCustom] = useState(false);

  // Modals
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [schemeSheet, setSchemeSheet] = useState(false);
  const [gradeEditorOpen, setGradeEditorOpen] = useState(false);
  const [addAssessOpen, setAddAssessOpen] = useState(false);
  const [editAssess, setEditAssess] = useState<GradeAssessment | null>(null);

  // Assessment form
  const [fName, setFName] = useState('');
  const [fWeight, setFWeight] = useState('');
  const [fMax, setFMax] = useState('100');
  const [fScored, setFScored] = useState('');

  // Grade editor form
  const [gLetter, setGLetter] = useState('');
  const [gMin, setGMin] = useState('');
  const [gPoint, setGPoint] = useState('');
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);

  // ── Load & Save ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !subjectId) { setLoading(false); return; }
    getSubjectGradeConfig(user.id, subjectId).then(c => {
      const loaded = c ?? makeDefault(subjectId);
      setConfig(loaded);
      setCustomRows(getGradeTable(loaded.gradingScheme));
      setLoading(false);
    });
  }, [user?.id, subjectId]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function update(partial: Partial<SubjectGradeConfig>) {
    const next = { ...config, ...partial };
    setConfig(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!user?.id) return;
      await saveSubjectGradeConfig(user.id, next);
    }, 500);
  }

  // ── Calculation ─────────────────────────────────────────────────────────────
  const activeRows = useMemo(() => {
    if (useCustom) return [...customRows].sort((a, b) => b.minPercent - a.minPercent);
    return getGradeTable(config.gradingScheme);
  }, [useCustom, customRows, config.gradingScheme]);

  const result = useMemo(() => calculateGrade(config), [config]);
  const { total: wTotal, valid: wValid, remaining: wRemaining } = useMemo(
    () => validateAssessmentWeights(config.assessments), [config.assessments]);

  const gc = gradeColor(result.grade.letter);

  // ── Assessment Handlers ────────────────────────────────────────────────────
  function openAddAssess(existing?: GradeAssessment) {
    if (existing) {
      setEditAssess(existing); setFName(existing.name);
      setFWeight(String(existing.weight)); setFMax(String(existing.maxScore));
      setFScored(existing.scored !== null ? String(existing.scored) : '');
    } else {
      setEditAssess(null); setFName('');
      const rem = validateAssessmentWeights(config.assessments).remaining;
      setFWeight(rem > 0 ? String(Math.round(rem)) : '');
      setFMax('100'); setFScored('');
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

    const next = editAssess 
      ? config.assessments.map(a => a.id === editAssess.id ? { ...a, name, weight, maxScore, scored } : a)
      : [...config.assessments, { id: uid(), name, weight, maxScore, scored }];
      
    if (validateAssessmentWeights(next).total > 100.01) {
      return Alert.alert('Weight Exceeded', 'Total carry mark weight cannot exceed 100%.');
    }
    
    setAddAssessOpen(false);
    update({ assessments: next });
  }

  function deleteAssessment(id: string) {
    update({ assessments: config.assessments.filter(a => a.id !== id) });
    setAddAssessOpen(false);
  }

  function scoreChange(id: string, raw: string) {
    const val = raw.trim() === '' ? null : parseFloat(raw);
    update({ assessments: config.assessments.map(a => a.id === id ? { ...a, scored: val } : a) });
  }

  // ── Custom Grade Handlers ───────────────────────────────────────────────────
  function applyPreset(scheme: GradingScheme) {
    setCustomRows(getGradeTable(scheme));
    setUseCustom(false);
    update({ gradingScheme: scheme });
    setSchemeSheet(false);
  }

  function saveGradeRow() {
    if (editingRowIdx === null) return;
    const letter = gLetter.trim(), min = parseFloat(gMin), point = parseFloat(gPoint);
    if (!letter || isNaN(min) || min < 0 || min > 100 || isNaN(point) || point < 0) return Alert.alert('Invalid data');
    
    const next = [...customRows];
    next[editingRowIdx] = { ...next[editingRowIdx], letter, minPercent: min, point };
    const sorted = next.sort((a, b) => b.minPercent - a.minPercent).map((r, i, arr) => ({
      ...r, maxPercent: i === 0 ? 100 : arr[i - 1].minPercent - 1,
    }));
    
    setCustomRows(sorted); setUseCustom(true); setEditingRowIdx(null);
  }

  function deleteGradeRow(idx: number) {
    setCustomRows(customRows.filter((_, i) => i !== idx));
    setUseCustom(true);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[ss.center, { backgroundColor: theme.backgroundSecondary }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const cardBg = theme.card;
  const border = theme.border;
  const txt = theme.text;
  const sub = theme.textSecondary;
  const pri = theme.primary;
  const bg = theme.backgroundSecondary;

  return (
    <View style={[ss.root, { backgroundColor: bg }]}>
      {/* ── Navigation Bar ── */}
      <View style={[ss.navbar, { paddingTop: insets.top + 10, backgroundColor: bg }]}>
        <Pressable onPress={() => router.back()} style={ss.navBtnLeft}>
          <Feather name="chevron-left" size={28} color={pri} />
          <Text style={[ss.navBackText, { color: pri }]}>Back</Text>
        </Pressable>
        <Text style={[ss.navTitle, { color: txt }]} numberOfLines={1}>
          {course?.name || subjectId}
        </Text>
        <Pressable onPress={() => setSettingsOpen(true)} style={ss.navBtnRight}>
          <Feather name="sliders" size={22} color={pri} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 60 }]} keyboardShouldPersistTaps="handled">
          
          {/* ── Hero (Clean, Large) ── */}
          <View style={ss.hero}>
            <Text style={[ss.heroGrade, { color: result.hasData ? gc : sub }]}>
              {result.hasData ? result.grade.letter : '–'}
            </Text>
            <Text style={[ss.heroScore, { color: sub }]}>
              {result.hasData ? fmt(result.totalScore) : '–'}%  •  {result.hasData ? fmt(result.grade.point, 2) : '–'} GPA
            </Text>
          </View>

          {/* ── Carry Marks ── */}
          <View style={ss.sectionHeader}>
            <Text style={[ss.sectionTitle, { color: sub }]}>Carry Marks ({config.carryWeight}%)</Text>
            {!wValid && config.assessments.length > 0 && (
              <Text style={[ss.sectionAction, { color: '#f59e0b' }]}>
                {wTotal > 100 ? `Over by ${fmt(wTotal - 100)}%` : `${fmt(wRemaining)}% remaining`}
              </Text>
            )}
          </View>
          
          <View style={[ss.group, { backgroundColor: cardBg }]}>
            {config.assessments.length === 0 ? (
              <Text style={[ss.emptyText, { color: sub }]}>No components added yet.</Text>
            ) : (
              config.assessments.map((a, idx) => {
                const isLast = idx === config.assessments.length - 1;
                return (
                  <View key={a.id} style={[ss.assessRow, !isLast && ss.rowBorder, !isLast && { borderBottomColor: border }]}>
                    <Pressable style={ss.assessInfo} onPress={() => openAddAssess(a)}>
                      <Text style={[ss.assessName, { color: txt }]} numberOfLines={1}>{a.name}</Text>
                      <Text style={[ss.assessWeight, { color: sub }]}>Weight: {a.weight}%</Text>
                    </Pressable>
                    <View style={ss.scoreInputWrap}>
                      <TextInput
                        style={[ss.scoreInput, { color: txt, backgroundColor: dark ? border + '60' : bg }]}
                        value={a.scored !== null ? String(a.scored) : ''}
                        onChangeText={v => scoreChange(a.id, v)}
                        keyboardType="decimal-pad"
                        placeholder="–"
                        placeholderTextColor={sub}
                      />
                      <Text style={[ss.scoreDivider, { color: sub }]}>/ {a.maxScore}</Text>
                    </View>
                  </View>
                );
              })
            )}
            <Pressable style={[ss.addBtn, config.assessments.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border }]} onPress={() => openAddAssess()}>
              <Feather name="plus" size={18} color={pri} />
              <Text style={[ss.addBtnText, { color: pri }]}>Add Component</Text>
            </Pressable>
          </View>

          {/* ── Final Exam ── */}
          {config.hasFinalExam && (
            <>
              <View style={ss.sectionHeader}>
                <Text style={[ss.sectionTitle, { color: sub }]}>Final Exam ({config.finalWeight}%)</Text>
              </View>
              <View style={[ss.group, { backgroundColor: cardBg }]}>
                <View style={ss.assessRow}>
                  <View style={ss.assessInfo}>
                    <Text style={[ss.assessName, { color: txt }]}>Final Score</Text>
                    <Text style={[ss.assessWeight, { color: sub }]}>Overall impact: {config.finalWeight}%</Text>
                  </View>
                  <View style={ss.scoreInputWrap}>
                    <TextInput
                      style={[ss.scoreInput, ss.scoreInputLg, { color: txt, backgroundColor: dark ? border + '60' : bg }]}
                      value={config.finalExamScored !== null ? String(config.finalExamScored) : ''}
                      onChangeText={v => update({ finalExamScored: v.trim() ? parseFloat(v) : null })}
                      keyboardType="decimal-pad"
                      placeholder="–"
                      placeholderTextColor={sub}
                    />
                    <Text style={[ss.scoreDivider, { color: sub }]}>/ {config.finalExamMaxScore}</Text>
                  </View>
                </View>
              </View>

              {/* ── Target Analysis ── */}
              <View style={ss.sectionHeader}>
                <Text style={[ss.sectionTitle, { color: sub }]}>Final Exam Targets</Text>
              </View>
              <View style={[ss.group, { backgroundColor: cardBg }]}>
                {result.requiredForGrades.slice(0, 6).map((r, idx, arr) => {
                  const gc2 = gradeColor(r.grade);
                  const isCurrent = result.hasData && result.grade.letter === r.grade;
                  return (
                    <View key={r.grade} style={[ss.targetRow, idx !== arr.length - 1 && [ss.rowBorder, { borderBottomColor: border }], isCurrent && { backgroundColor: gc2 + '0D' }]}>
                      <Text style={[ss.targetGrade, { color: isCurrent ? gc2 : txt }]}>{r.grade}</Text>
                      {!result.hasData ? (
                        <Text style={[ss.targetScore, { color: sub }]}>N/A</Text>
                      ) : r.achievable ? (
                        <Text style={[ss.targetScore, { color: isCurrent ? gc2 : sub }]}>{fmt(r.required)}%</Text>
                      ) : (
                        <Text style={[ss.targetScore, { color: '#ef4444' }]}>N/A</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ═══════════════════════════════════════════════════════════════════
          Settings Modal (Slide up)
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={settingsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSettingsOpen(false)}>
        <View style={[ss.modalContainer, { backgroundColor: bg }]}>
          <View style={[ss.modalNavbar, { backgroundColor: bg }]}>
             <View style={ss.modalNavBtn} />
             <Text style={[ss.modalNavTitle, { color: txt }]}>Configuration</Text>
             <Pressable onPress={() => setSettingsOpen(false)} style={[ss.modalNavBtn, { alignItems: 'flex-end' }]}>
               <Text style={[ss.modalNavAction, { color: pri }]}>Done</Text>
             </Pressable>
          </View>
          
          <ScrollView contentContainerStyle={ss.modalScroll}>
            
            <View style={ss.sectionHeader}>
               <Text style={[ss.sectionTitle, { color: sub }]}>Grading Scheme</Text>
            </View>
            <View style={[ss.group, { backgroundColor: cardBg }]}>
              <Pressable style={ss.settingRow} onPress={() => { setSettingsOpen(false); setTimeout(() => setSchemeSheet(true), 100); }}>
                <Text style={[ss.settingLabel, { color: txt }]}>Scheme</Text>
                <View style={ss.settingRight}>
                  <Text style={[ss.settingValue, { color: sub }]}>{useCustom ? 'Custom' : SCHEME_LABELS[config.gradingScheme]}</Text>
                  <Feather name="chevron-right" size={20} color={sub} />
                </View>
              </Pressable>
            </View>

            <View style={ss.sectionHeader}>
               <Text style={[ss.sectionTitle, { color: sub }]}>Course Structure</Text>
            </View>
            <View style={[ss.group, { backgroundColor: cardBg }]}>
              <View style={[ss.settingRow, ss.rowBorder, { borderBottomColor: border }]}>
                <Text style={[ss.settingLabel, { color: txt }]}>Has Final Exam</Text>
                <Switch
                  value={config.hasFinalExam}
                  onValueChange={v => update({ hasFinalExam: v, carryWeight: v ? 40 : 100, finalWeight: v ? 60 : 0 })}
                  trackColor={{ true: pri, false: border }}
                />
              </View>
              
              <View style={[ss.settingRow, config.hasFinalExam && ss.rowBorder, config.hasFinalExam && { borderBottomColor: border }]}>
                <Text style={[ss.settingLabel, { color: txt }]}>Carry Marks Weight</Text>
                {config.hasFinalExam ? (
                  <View style={ss.stepper}>
                    <Pressable style={[ss.stepperBtn, { backgroundColor: border }]} onPress={() => { const w = Math.max(0, config.carryWeight - 5); update({ carryWeight: w, finalWeight: 100 - w }); }}>
                      <Feather name="minus" size={16} color={txt} />
                    </Pressable>
                    <Text style={[ss.stepperVal, { color: txt }]}>{config.carryWeight}%</Text>
                    <Pressable style={[ss.stepperBtn, { backgroundColor: border }]} onPress={() => { const w = Math.min(100, config.carryWeight + 5); update({ carryWeight: w, finalWeight: 100 - w }); }}>
                      <Feather name="plus" size={16} color={txt} />
                    </Pressable>
                  </View>
                ) : (
                  <Text style={[ss.settingValue, { color: sub }]}>100%</Text>
                )}
              </View>

              {config.hasFinalExam && (
                <View style={[ss.settingRow, ss.rowBorder, { borderBottomColor: border }]}>
                  <Text style={[ss.settingLabel, { color: txt }]}>Final Exam Weight</Text>
                  <Text style={[ss.settingValue, { color: sub }]}>{config.finalWeight}%</Text>
                </View>
              )}

              {config.hasFinalExam && (
                <View style={ss.settingRow}>
                  <Text style={[ss.settingLabel, { color: txt }]}>Final Exam Full Marks</Text>
                  <TextInput
                    style={[ss.inlineInput, { color: txt, backgroundColor: bg }]}
                    value={String(config.finalExamMaxScore)}
                    onChangeText={v => update({ finalExamMaxScore: parseFloat(v) || 100 })}
                    keyboardType="decimal-pad"
                  />
                </View>
              )}
            </View>

          </ScrollView>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          Scheme Picker Sheet & Editor (Transparent Modals)
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={schemeSheet} transparent animationType="slide" onRequestClose={() => setSchemeSheet(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={() => setSchemeSheet(false)} />
          <View style={[ss.sheet, { backgroundColor: cardBg, paddingBottom: insets.bottom + 20 }]}>
            <View style={[ss.sheetHandle, { backgroundColor: border }]} />
            <Text style={[ss.sheetTitle, { color: txt }]}>Grading Scheme</Text>
            
            {PRESETS.map(p => (
              <Pressable key={p.key} style={[ss.schemeOpt, { borderBottomColor: border }]} onPress={() => applyPreset(p.key)}>
                <Text style={[ss.schemeOptLabel, { color: txt }]}>{p.label}</Text>
                {config.gradingScheme === p.key && !useCustom && <Feather name="check" size={20} color={pri} />}
              </Pressable>
            ))}
            <Pressable style={[ss.schemeOpt, { borderBottomColor: border, borderBottomWidth: 0 }]} onPress={() => { setSchemeSheet(false); setTimeout(() => setGradeEditorOpen(true), 300); }}>
              <Text style={[ss.schemeOptLabel, { color: txt }]}>Custom Table</Text>
              {useCustom && <Feather name="check" size={20} color={pri} />}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={gradeEditorOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGradeEditorOpen(false)}>
        <View style={[ss.modalContainer, { backgroundColor: bg }]}>
          <View style={[ss.modalNavbar, { backgroundColor: bg }]}>
             <Pressable onPress={() => setGradeEditorOpen(false)} style={ss.modalNavBtn}>
               <Text style={[ss.modalNavAction, { color: pri }]}>Back</Text>
             </Pressable>
             <Text style={[ss.modalNavTitle, { color: txt }]}>Custom Grade Table</Text>
             <Pressable onPress={() => { setUseCustom(true); setGradeEditorOpen(false); }} style={[ss.modalNavBtn, { alignItems: 'flex-end' }]}>
               <Text style={[ss.modalNavAction, { color: pri, fontWeight: '700' }]}>Done</Text>
             </Pressable>
          </View>
          
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={ss.modalScroll} keyboardShouldPersistTaps="handled">
              
              <Text style={[ss.editorHint, { color: sub }]}>Add, edit, or remove grade levels. The maximum percentage is calculated automatically based on the minimum percentage of the level above it.</Text>

              <View style={[ss.group, { backgroundColor: cardBg }]}>
                {/* Header */}
                <View style={[ss.editorHeader, { borderBottomColor: border }]}>
                  <Text style={[ss.editorHeaderCell, { flex: 1, color: sub }]}>Grade</Text>
                  <Text style={[ss.editorHeaderCell, { flex: 1.5, color: sub }]}>Min %</Text>
                  <Text style={[ss.editorHeaderCell, { flex: 1.5, color: sub }]}>GPA</Text>
                  <View style={{ width: 32 }} />
                </View>

                {[...customRows].sort((a, b) => b.minPercent - a.minPercent).map((row, idx) => {
                  const isEditing = editingRowIdx === idx;
                  return (
                    <View key={idx} style={[ss.editorRow, idx !== customRows.length - 1 && [ss.rowBorder, { borderBottomColor: border }]]}>
                      {isEditing ? (
                        <>
                          <TextInput style={[ss.editorInput, { flex: 1, color: txt, backgroundColor: bg }]} value={gLetter} onChangeText={setGLetter} placeholder="A+" autoFocus autoCapitalize="characters" />
                          <TextInput style={[ss.editorInput, { flex: 1.5, color: txt, backgroundColor: bg }]} value={gMin} onChangeText={setGMin} placeholder="90" keyboardType="decimal-pad" />
                          <TextInput style={[ss.editorInput, { flex: 1.5, color: txt, backgroundColor: bg }]} value={gPoint} onChangeText={setGPoint} placeholder="4.0" keyboardType="decimal-pad" onSubmitEditing={saveGradeRow} />
                          <Pressable onPress={saveGradeRow} style={ss.editorActionBtn}><Feather name="check-circle" size={20} color={pri} /></Pressable>
                        </>
                      ) : (
                        <>
                          <Text style={[ss.editorCell, { flex: 1, color: txt, fontWeight: '600' }]} onPress={() => { setEditingRowIdx(idx); setGLetter(row.letter); setGMin(String(row.minPercent)); setGPoint(String(row.point)); }}>{row.letter}</Text>
                          <Text style={[ss.editorCell, { flex: 1.5, color: txt }]} onPress={() => { setEditingRowIdx(idx); setGLetter(row.letter); setGMin(String(row.minPercent)); setGPoint(String(row.point)); }}>{row.minPercent}%</Text>
                          <Text style={[ss.editorCell, { flex: 1.5, color: txt }]} onPress={() => { setEditingRowIdx(idx); setGLetter(row.letter); setGMin(String(row.minPercent)); setGPoint(String(row.point)); }}>{fmt(row.point, 2)}</Text>
                          <Pressable onPress={() => deleteGradeRow(idx)} style={ss.editorActionBtn}><Feather name="trash-2" size={18} color="#ef4444" /></Pressable>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>

              <Pressable style={[ss.addLevelBtn, { backgroundColor: cardBg }]} onPress={() => { setEditingRowIdx(customRows.length); setGLetter(''); setGMin(''); setGPoint(''); }}>
                <Text style={[ss.addLevelText, { color: pri }]}>Add New Grade Level</Text>
              </Pressable>

            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════
          Add/Edit Assessment (Transparent Modal)
      ═══════════════════════════════════════════════════════════════════ */}
      <Modal visible={addAssessOpen} transparent animationType="slide" onRequestClose={() => setAddAssessOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} onPress={() => setAddAssessOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[ss.sheet, { backgroundColor: cardBg, paddingBottom: Math.max(insets.bottom + 16, 32) }]}>
              <View style={[ss.sheetHandle, { backgroundColor: border }]} />
              <Text style={[ss.sheetTitle, { color: txt, marginBottom: 24 }]}>{editAssess ? 'Edit Component' : 'Add Component'}</Text>

              <Text style={[ss.fieldLabel, { color: sub }]}>Name</Text>
              <TextInput
                style={[ss.formInput, { color: txt, backgroundColor: bg, borderColor: border }]}
                value={fName} onChangeText={setFName}
                placeholder="e.g. Midterm" placeholderTextColor={sub}
                autoFocus returnKeyType="next"
              />
              <View style={ss.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.fieldLabel, { color: sub }]}>Weight (%)</Text>
                  <TextInput
                    style={[ss.formInput, { flex: 1, color: txt, backgroundColor: bg, borderColor: border }]}
                    value={fWeight} onChangeText={setFWeight}
                    placeholder="20" placeholderTextColor={sub}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.fieldLabel, { color: sub }]}>Max Score</Text>
                  <TextInput
                    style={[ss.formInput, { flex: 1, color: txt, backgroundColor: bg, borderColor: border }]}
                    value={fMax} onChangeText={setFMax}
                    placeholder="100" placeholderTextColor={sub}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Pressable style={[ss.primaryBtn, { backgroundColor: pri }]} onPress={saveAssessment}>
                <Text style={ss.primaryBtnText}>Save</Text>
              </Pressable>
              
              {editAssess && (
                <Pressable style={ss.dangerBtn} onPress={() => deleteAssessment(editAssess.id)}>
                  <Text style={ss.dangerBtnText}>Delete Component</Text>
                </Pressable>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Navbar (Main)
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 10 },
  navBtnLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  navBackText: { fontSize: 17, fontWeight: '400', marginLeft: -4 },
  navTitle: { fontSize: 17, fontWeight: '600', flex: 2, textAlign: 'center' },
  navBtnRight: { flex: 1, alignItems: 'flex-end', paddingVertical: 4, paddingRight: 8 },

  scroll: { paddingHorizontal: 16 },

  // Hero
  hero: { alignItems: 'center', paddingVertical: 32 },
  heroGrade: { fontSize: 72, fontWeight: '800', letterSpacing: -2, lineHeight: 80 },
  heroScore: { fontSize: 16, fontWeight: '500', marginTop: 8 },

  // Grouped Lists (iOS Style)
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28, marginBottom: 8, paddingHorizontal: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionAction: { fontSize: 13, fontWeight: '500' },
  group: { borderRadius: 12, overflow: 'hidden' },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },

  // Assessments
  emptyText: { padding: 24, textAlign: 'center', fontSize: 15 },
  assessRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  assessInfo: { flex: 1 },
  assessName: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
  assessWeight: { fontSize: 13, fontWeight: '400' },
  scoreInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreInput: { width: 52, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  scoreInputLg: { width: 64 },
  scoreDivider: { fontSize: 15, fontWeight: '500', width: 40 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  addBtnText: { fontSize: 16, fontWeight: '500' },

  // Target Analysis
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  targetGrade: { fontSize: 16, fontWeight: '700' },
  targetScore: { fontSize: 16, fontWeight: '500' },

  // Modals (Page Sheet)
  modalContainer: { flex: 1 },
  modalNavbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(150,150,150,0.3)' },
  modalNavBtn: { flex: 1, paddingVertical: 8 },
  modalNavTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', flex: 2 },
  modalNavAction: { fontSize: 17, fontWeight: '500' },
  modalScroll: { paddingHorizontal: 16, paddingBottom: 64 },

  // Settings Rows
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, minHeight: 56 },
  settingLabel: { fontSize: 16, fontWeight: '400' },
  settingValue: { fontSize: 16, fontWeight: '400' },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { fontSize: 16, fontWeight: '500', minWidth: 40, textAlign: 'center' },
  inlineInput: { width: 64, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, fontSize: 16, textAlign: 'center' },

  // Transparent Bottom Sheets
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12 },
  sheetHandle: { width: 36, height: 5, borderRadius: 2.5, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  
  // Scheme Options
  schemeOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  schemeOptLabel: { fontSize: 17, fontWeight: '400' },

  // Editor
  editorHint: { fontSize: 13, lineHeight: 18, marginTop: 16, marginBottom: 8, paddingHorizontal: 8 },
  editorHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  editorHeaderCell: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  editorRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  editorCell: { fontSize: 16 },
  editorInput: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6, fontSize: 16, marginHorizontal: 2 },
  editorActionBtn: { width: 32, alignItems: 'center' },
  addLevelBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  addLevelText: { fontSize: 16, fontWeight: '600' },

  // Forms
  fieldLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4, marginBottom: 6 },
  formInput: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 16 },
  formRow: { flexDirection: 'row', gap: 12 },
  primaryBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  dangerBtn: { padding: 16, alignItems: 'center', marginTop: 4 },
  dangerBtnText: { color: '#ef4444', fontSize: 16, fontWeight: '500' },
});
