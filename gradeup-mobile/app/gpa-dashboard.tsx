import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { getAllSubjectGradeConfigs } from '@/src/lib/gradeStorage';
import { calculateCGPA } from '@/src/lib/gpaCalculator';
import type { SubjectGradeConfig } from '@/src/types';
import { gradeColor } from '@/src/lib/gradeCalculator';

function fmt(n: number, dp = 2) { return isNaN(n) ? '0.00' : n.toFixed(dp); }

export default function GPADashboard() {
  const { user, courses } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [configs, setConfigs] = useState<SubjectGradeConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    getAllSubjectGradeConfigs(user.id).then(res => {
      setConfigs(res);
      setLoading(false);
    });
  }, [user?.id]);

  const result = useMemo(() => calculateCGPA(courses, configs), [courses, configs]);

  if (loading) {
    return (
      <View style={[ss.center, { backgroundColor: theme.backgroundSecondary }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const bg = theme.backgroundSecondary;
  const cardBg = theme.card;
  const border = theme.border;
  const txt = theme.text;
  const sub = theme.textSecondary;
  const pri = theme.primary;

  // Derive an overall color based on CGPA (e.g., >3.5 is green, >3.0 blue, etc)
  const cgpaColor = result.cgpa >= 3.5 ? '#10b981' : result.cgpa >= 3.0 ? '#3b82f6' : result.cgpa >= 2.0 ? '#f59e0b' : '#ef4444';

  return (
    <View style={[ss.root, { backgroundColor: bg }]}>
      {/* ── Navbar ── */}
      <View style={[ss.navbar, { paddingTop: insets.top + 10, backgroundColor: bg }]}>
        <Pressable onPress={() => router.back()} style={ss.navBtnLeft}>
          <Feather name="chevron-left" size={28} color={pri} />
          <Text style={[ss.navBackText, { color: pri }]}>Back</Text>
        </Pressable>
        <Text style={[ss.navTitle, { color: txt }]} numberOfLines={1}>Academic Standing</Text>
        <View style={ss.navBtnRight} />
      </View>

      <ScrollView contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        
        {/* ── CGPA Hero ── */}
        <View style={ss.hero}>
          <Text style={[ss.heroLabel, { color: sub }]}>Cumulative GPA</Text>
          <Text style={[ss.heroCGPA, { color: cgpaColor }]}>{result.totalCredits > 0 ? fmt(result.cgpa, 2) : 'N/A'}</Text>
          <Text style={[ss.heroCredits, { color: sub }]}>
            {result.totalCredits} Total Credits
          </Text>
        </View>

        {result.semesters.length === 0 && (
          <Text style={[ss.emptyText, { color: sub }]}>No subjects with grades recorded yet. Go to the Study tab to configure your subjects.</Text>
        )}

        {/* ── Semesters List ── */}
        {result.semesters.map((sem) => (
          <View key={sem.semesterId} style={ss.semesterSection}>
            <View style={ss.sectionHeader}>
              <Text style={[ss.sectionTitle, { color: sub }]}>{sem.label}</Text>
              <Text style={[ss.sectionGPA, { color: txt }]}>GPA: {sem.totalCredits > 0 ? fmt(sem.gpa, 2) : 'N/A'}</Text>
            </View>

            <View style={[ss.group, { backgroundColor: cardBg }]}>
              {sem.subjects.map((item, idx) => {
                const { course, result: gradeRes } = item;
                const isLast = idx === sem.subjects.length - 1;
                const gc = gradeRes.hasData ? gradeColor(gradeRes.grade.letter) : sub;
                
                return (
                  <Pressable 
                    key={course.id} 
                    style={({ pressed }) => [
                      ss.subjectRow, 
                      !isLast && [ss.rowBorder, { borderBottomColor: border }],
                      pressed && { opacity: 0.7 }
                    ]}
                    onPress={() => router.push({ pathname: '/subject-grade' as any, params: { subjectId: course.id } })}
                  >
                    <View style={ss.subjectInfo}>
                      <Text style={[ss.subjectName, { color: txt }]} numberOfLines={1}>{course.name || course.id}</Text>
                      <Text style={[ss.subjectCredits, { color: sub }]}>{course.creditHours} Credits</Text>
                    </View>
                    <View style={[ss.gradeBadge, { backgroundColor: gradeRes.hasData ? gc + '15' : border }]}>
                      <Text style={[ss.gradeBadgeText, { color: gradeRes.hasData ? gc : txt }]}>
                        {gradeRes.hasData ? gradeRes.grade.letter : '–'}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={sub} style={{ marginLeft: 8 }} />
                  </Pressable>
                );
              })}
              {sem.subjects.length === 0 && (
                <View style={ss.emptySubjectRow}>
                  <Text style={[ss.emptySubjectText, { color: sub }]}>No subjects added for this semester.</Text>
                </View>
              )}
            </View>
          </View>
        ))}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 10 },
  navBtnLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  navBackText: { fontSize: 17, fontWeight: '400', marginLeft: -4 },
  navTitle: { fontSize: 17, fontWeight: '600', flex: 2, textAlign: 'center' },
  navBtnRight: { flex: 1, alignItems: 'flex-end', paddingVertical: 4, paddingRight: 8 },

  scroll: { paddingHorizontal: 16 },

  hero: { alignItems: 'center', paddingVertical: 40 },
  heroLabel: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  heroCGPA: { fontSize: 64, fontWeight: '800', letterSpacing: -2, lineHeight: 70 },
  heroCredits: { fontSize: 15, fontWeight: '500', marginTop: 8 },

  emptyText: { padding: 24, textAlign: 'center', fontSize: 15, lineHeight: 22 },

  semesterSection: { marginTop: 12, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, paddingHorizontal: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionGPA: { fontSize: 14, fontWeight: '700' },

  group: { borderRadius: 12, overflow: 'hidden' },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },

  subjectRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  subjectInfo: { flex: 1, marginRight: 12 },
  subjectName: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
  subjectCredits: { fontSize: 13, fontWeight: '400' },
  
  gradeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 44, alignItems: 'center' },
  gradeBadgeText: { fontSize: 16, fontWeight: '700' },

  emptySubjectRow: { padding: 16 },
  emptySubjectText: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
});
