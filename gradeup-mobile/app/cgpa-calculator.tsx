import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
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
      const config = configs.find(c => c.subjectId === course.id);
      const credit = credits[course.id] || 3;
      if (!config) return { course, credit, hasData: false, point: 0, letter: '-' };

      const res = calculateGrade(config);
      return { course, credit, hasData: res.hasData, point: res.currentStandingGrade.point, letter: res.currentStandingGrade.letter };
    });

    let totalPoints = 0;
    let totalCredits = 0;

    activeData.filter(d => d.hasData).forEach(d => {
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
  }, [courses, configs, credits, pastCgpaStr, pastCreditsStr]);

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
        <Text style={[styles.navTitle, { color: theme.text }]}>CGPA Calculator</Text>
        <View style={styles.navBtn} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.hero}>
            <Text style={[styles.cgpaValue, { color: theme.text }]}>{results.currentGpa}</Text>
            <Text style={[styles.cgpaLabel, { color: theme.textSecondary }]}>
              Current Semester GPA ({results.currentCredits} credits)
            </Text>
            
            {results.pastCreds > 0 && (
              <View style={[styles.cumulativeBadge, { backgroundColor: theme.primary + '15' }]}>
                <Text style={[styles.cumulativeValue, { color: theme.primary }]}>{results.cgpa}</Text>
                <Text style={[styles.cumulativeLabel, { color: theme.primary }]}>
                  Cumulative CGPA ({results.totalCredits} credits)
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Past Semester</Text>
            </View>
            <View style={styles.pastRow}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Past CGPA</Text>
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
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Total Credits</Text>
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
          </View>

          <Text style={[styles.listHeader, { color: theme.textSecondary }]}>CURRENT SUBJECTS</Text>
          
          <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {results.activeData.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No subjects found.</Text>
            ) : (
              results.activeData.map((d, index) => {
                const isLast = index === results.activeData.length - 1;
                return (
                  <View key={d.course.id} style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
                    <View style={styles.rowLeft}>
                      <Text style={[styles.subjectName, { color: theme.text }]} numberOfLines={1}>
                        {d.course.name || d.course.id}
                      </Text>
                      {d.hasData ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View style={[styles.gradeChip, { backgroundColor: gradeColor(d.letter) + '20' }]}>
                            <Text style={[styles.gradeChipText, { color: gradeColor(d.letter) }]}>{d.letter}</Text>
                          </View>
                          <Text style={[styles.pointText, { color: theme.textSecondary }]}>{d.point.toFixed(2)} GP</Text>
                        </View>
                      ) : (
                        <Text style={[styles.pointText, { color: theme.textSecondary, marginTop: 4 }]}>No marks recorded</Text>
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
          
          <Text style={[styles.footerNote, { color: theme.textSecondary }]}>
            Subjects with no marks are excluded from the calculation.
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
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
  cgpaValue: { fontSize: 64, fontWeight: '800', letterSpacing: -1 },
  cgpaLabel: { fontSize: 15, fontWeight: '500', marginTop: 4 },
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
