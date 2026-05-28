import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { getAllSubjectGradeConfigs } from '@/src/lib/gradeStorage';
import { calculateGrade, gradeColor } from '@/src/lib/gradeCalculator';
import type { SubjectGradeConfig } from '@/src/types';

export default function CgpaCalculatorScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user, courses, updateCourse } = useApp();

  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<SubjectGradeConfig[]>([]);

  // Local state for credit hours (to allow immediate UI updates before syncing)
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [excludedSubjects, setExcludedSubjects] = useState<Record<string, boolean>>({});
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Past semester data
  const [pastCgpaStr, setPastCgpaStr] = useState('');
  const [pastCreditsStr, setPastCreditsStr] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    getAllSubjectGradeConfigs(user.id).then(res => {
      setConfigs(res);
      setLoading(false);
    });
  }, [user]);

  // Initialize credits state from courses
  useEffect(() => {
    const initCredits: Record<string, number> = {};
    courses.forEach(c => {
      initCredits[c.id] = c.creditHours || 3;
    });
    setCredits(initCredits);
  }, [courses]);

  const handleUpdateCredit = (subjectId: string, newCredit: number) => {
    setCredits(prev => ({ ...prev, [subjectId]: newCredit }));
    updateCourse(subjectId, { creditHours: newCredit });
  };

  const results = useMemo(() => {
    const activeData = courses.map(course => {
      const isExcluded = !!excludedSubjects[course.id];
      const config = configs.find(c => c.subjectId === course.id);
      const credit = credits[course.id] || 3;
      if (isExcluded || !config) return { course, credit, hasData: false, point: 0, letter: '-', isExcluded };

      const res = calculateGrade(config);
      return { course, credit, hasData: res.hasData, point: res.currentStandingGrade.point, letter: res.currentStandingGrade.letter, isExcluded };
    });

    let totalPoints = 0;
    let totalCredits = 0;

    activeData.filter(d => d.hasData && !d.isExcluded).forEach(d => {
      totalPoints += d.point * d.credit;
      totalCredits += d.credit;
    });

    const truncate2 = (val: number) => (Math.floor(val * 100) / 100).toFixed(2);

    const currentGpa = totalCredits > 0 ? truncate2(totalPoints / totalCredits) : '0.00';
    const currentCredits = totalCredits;

    const pastCgpa = parseFloat(pastCgpaStr) || 0;
    const pastCreds = parseInt(pastCreditsStr, 10) || 0;

    if (pastCreds > 0) {
      totalPoints += (pastCgpa * pastCreds);
      totalCredits += pastCreds;
    }

    const cgpa = totalCredits > 0 ? truncate2(totalPoints / totalCredits) : '0.00';

    return { activeData, totalPoints, totalCredits, cgpa, currentGpa, currentCredits, pastCreds };
  }, [courses, configs, credits, excludedSubjects, pastCgpaStr, pastCreditsStr]);

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={[styles.navbar, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.navBtn} hitSlop={10}>
          <Feather name="chevron-down" size={24} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Ionicons name="calculator" size={18} color={theme.text} />
          <Text style={[styles.navTitle, { color: theme.text, flex: 0 }]}>GPA Calculator</Text>
        </View>
        <View style={styles.navBtn} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          <View style={styles.hero}>
            <Text style={[styles.cgpaValue, { color: theme.text }]}>{results.currentGpa}</Text>
            <View style={[styles.heroLabelWrapper, { backgroundColor: theme.primary + '12' }]}>
              <Text style={[styles.cgpaLabel, { color: theme.primary }]}>
                Current Semester GPA ({results.currentCredits} credits)
              </Text>
            </View>
          </View>

          {results.activeData.some(d => !d.hasData && !d.isExcluded) && (
            <View style={{ backgroundColor: theme.primary + '15', padding: 12, borderRadius: 12, marginBottom: 24, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Feather name="info" size={18} color={theme.primary} style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, color: theme.primary, fontSize: 13, lineHeight: 18, fontWeight: '500' }}>
                Complete your marks for every subject first to get an accurate GPA!
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={[styles.listHeader, { color: theme.textSecondary, marginBottom: 0, marginLeft: 0 }]}>CURRENT SUBJECTS</Text>
            <Pressable onPress={() => setEditModalOpen(true)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="edit-2" size={14} color={theme.primary} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.primary }}>Edit</Text>
            </Pressable>
          </View>

          <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {results.activeData.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No subjects found.</Text>
            ) : (
              results.activeData.map((d, index) => {
                const isLast = index === results.activeData.length - 1;
                return (
                  <View key={d.course.id} style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
                    <View style={styles.rowLeft}>
                      <Text style={[styles.subjectName, { color: theme.text, flexShrink: 1, textTransform: 'uppercase' }]} numberOfLines={1}>
                        {d.course.id}
                      </Text>
                      {d.isExcluded ? (
                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View style={[styles.gradeChip, { backgroundColor: theme.text + '10' }]}>
                            <Text style={[styles.gradeChipText, { color: theme.textSecondary, fontWeight: '600' }]}>EXCLUDED</Text>
                          </View>
                        </View>
                      ) : d.hasData ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View style={[styles.gradeChip, { backgroundColor: gradeColor(d.letter) + '20' }]}>
                            <Text style={[styles.gradeChipText, { color: gradeColor(d.letter) }]}>{d.letter}</Text>
                          </View>
                          <Text style={[styles.pointText, { color: theme.textSecondary }]}>{d.point.toFixed(2)}</Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View style={[styles.gradeChip, { backgroundColor: theme.text + '10' }]}>
                            <Text style={[styles.gradeChipText, { color: theme.textSecondary, fontWeight: '600' }]}>N/A</Text>
                          </View>
                          <Text style={[styles.pointText, { color: theme.textSecondary }]}>No marks</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={[styles.creditLabel, { color: theme.textSecondary }]}>Credits</Text>
                      <View style={[styles.stepper, { backgroundColor: theme.background, borderColor: theme.border }]}>
                        <Pressable
                          style={styles.stepperBtn}
                          onPress={() => handleUpdateCredit(d.course.id, Math.max(0, d.credit - 1))}
                          hitSlop={10}
                        >
                          <Feather name="minus" size={14} color={theme.text} />
                        </Pressable>
                        <Text style={[styles.stepperVal, { color: theme.text }]}>{d.credit}</Text>
                        <Pressable
                          style={styles.stepperBtn}
                          onPress={() => handleUpdateCredit(d.course.id, Math.min(12, d.credit + 1))}
                          hitSlop={10}
                        >
                          <Feather name="plus" size={14} color={theme.text} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 24 }]}>
            <View style={[styles.sectionHeader, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <Feather name="clock" size={16} color={theme.text} />
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Past Semesters (Optional)</Text>
            </View>
            <View style={styles.pastRow}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Cumulative CGPA</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 3.50"
                  placeholderTextColor={theme.textSecondary}
                  value={pastCgpaStr}
                  onChangeText={setPastCgpaStr}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Total Earned Credits</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                  keyboardType="number-pad"
                  placeholder="e.g. 60"
                  placeholderTextColor={theme.textSecondary}
                  value={pastCreditsStr}
                  onChangeText={setPastCreditsStr}
                />
              </View>
            </View>
            <Text style={[styles.helperText, { color: theme.textSecondary }]}>
              Note: This is the sum of all credits from every past semester combined.
            </Text>
            {results.pastCreds > 0 && (
              <View style={[styles.cumulativeBadge, { backgroundColor: theme.primary + '15', marginTop: 16 }]}>
                <Text style={[styles.cumulativeValue, { color: theme.primary }]}>{results.cgpa}</Text>
                <Text style={[styles.cumulativeLabel, { color: theme.primary }]}>
                  Overall Cumulative CGPA ({results.totalCredits} credits)
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.footerNote, { color: theme.textSecondary, marginTop: 8 }]}>
            Subjects with no marks are excluded from the calculation.
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={editModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditModalOpen(false)}>
        <View style={[styles.root, { backgroundColor: theme.background }]}>
          <View style={[styles.navbar, { borderBottomColor: theme.border, marginTop: Platform.OS === 'android' ? 16 : 0 }]}>
            <View style={styles.navBtn} />
            <Text style={[styles.navTitle, { color: theme.text }]}>Include Subjects</Text>
            <Pressable onPress={() => setEditModalOpen(false)} style={styles.navBtn} hitSlop={10}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.primary, textAlign: 'right' }}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: 16 }}>
              Untick any subjects you want to completely exclude from the GPA calculation.
            </Text>
            <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {courses.map((course, index) => {
                const isExcluded = !!excludedSubjects[course.id];
                const isLast = index === courses.length - 1;
                return (
                  <Pressable 
                    key={course.id}
                    style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
                    onPress={() => setExcludedSubjects(prev => ({ ...prev, [course.id]: !isExcluded }))}
                  >
                    <View style={{ flex: 1, paddingRight: 16 }}>
                      <Text style={[styles.subjectName, { color: theme.text, textTransform: 'uppercase' }]} numberOfLines={2}>{course.id}</Text>
                    </View>
                    <Feather 
                      name={!isExcluded ? "check-square" : "square"} 
                      size={24} 
                      color={!isExcluded ? theme.primary : theme.border} 
                    />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navbar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  hero: {
    alignItems: 'center', paddingVertical: 32, marginBottom: 16,
  },
  cgpaValue: { fontSize: 72, fontWeight: '900', letterSpacing: -2 },
  heroLabelWrapper: {
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  cgpaLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  cumulativeBadge: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  cumulativeValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  cumulativeLabel: { fontSize: 12, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  section: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 24,
  },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  pastRow: { flexDirection: 'row', gap: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  textInput: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, height: 44, fontSize: 16,
  },
  helperText: {
    fontSize: 12, marginTop: 12, fontStyle: 'italic', lineHeight: 16,
  },
  listHeader: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 },
  listCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  emptyText: { padding: 24, textAlign: 'center', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  rowLeft: { flex: 1, paddingRight: 12 },
  subjectName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  gradeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  gradeChipText: { fontSize: 12, fontWeight: '800' },
  pointText: { fontSize: 13, fontWeight: '500' },
  rowRight: { alignItems: 'flex-end' },
  creditLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, overflow: 'hidden', height: 32,
  },
  stepperBtn: { width: 32, height: '100%', alignItems: 'center', justifyContent: 'center' },
  stepperVal: { width: 24, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  footerNote: { textAlign: 'center', fontSize: 13, marginTop: 16 },
});
