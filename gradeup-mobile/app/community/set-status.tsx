import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { ACTIVITY_TYPES } from '@/src/lib/communityApi';
import type { ActivityType } from '@/src/lib/communityApi';

export default function SetStatusScreen() {
  const theme = useTheme();
  const { courses } = useApp();
  const { myActivity, updateActivity, clearMyActivity } = useCommunity();

  const [selectedType, setSelectedType] = useState<ActivityType>(
    (myActivity?.activity_type as ActivityType) || 'idle'
  );
  const [detail, setDetail] = useState(myActivity?.detail || '');
  const [selectedCourse, setSelectedCourse] = useState(myActivity?.course_name || '');
  const [saving, setSaving] = useState(false);

  const showCourseSelector = ['studying', 'in_class', 'in_lab', 'doing_assignment', 'in_exam', 'group_study', 'revision', 'working_on_project', 'tutoring'].includes(selectedType);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateActivity(selectedType, detail || undefined, selectedCourse || undefined);
      router.back();
    } catch (e) {
      console.warn(e);
    }
    setSaving(false);
  }, [selectedType, detail, selectedCourse, updateActivity]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    try {
      await clearMyActivity();
      router.back();
    } catch (e) {
      console.warn(e);
    }
    setSaving(false);
  }, [clearMyActivity]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
        >
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Set Status</Text>
      </View>

      {/* Current status */}
      {myActivity && myActivity.activity_type !== 'idle' && (
        <View style={[styles.currentCard, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
          <Text style={[styles.currentLabel, { color: theme.textSecondary }]}>Current status</Text>
          <Text style={[styles.currentValue, { color: theme.text }]}>
            {ACTIVITY_TYPES.find((a) => a.type === myActivity.activity_type)?.emoji}{' '}
            {ACTIVITY_TYPES.find((a) => a.type === myActivity.activity_type)?.label}
            {myActivity.detail ? ` — ${myActivity.detail}` : ''}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
            onPress={handleClear}
          >
            <Text style={[styles.clearBtnText, { color: '#ef4444' }]}>Clear Status</Text>
          </Pressable>
        </View>
      )}

      {/* Activity type selector */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>What are you doing?</Text>
      <View style={styles.typeGrid}>
        {ACTIVITY_TYPES.filter((a) => a.type !== 'idle').map((activity) => {
          const isSelected = selectedType === activity.type;
          return (
            <Pressable
              key={activity.type}
              style={[
                styles.typeCard,
                {
                  backgroundColor: isSelected ? theme.primary + '15' : theme.card,
                  borderColor: isSelected ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setSelectedType(activity.type)}
            >
              <Text style={styles.typeEmoji}>{activity.emoji}</Text>
              <Text
                style={[
                  styles.typeLabel,
                  { color: isSelected ? theme.primary : theme.text },
                ]}
                numberOfLines={1}
              >
                {activity.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Course selector (for study-related activities) */}
      {showCourseSelector && courses.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 20 }]}>Subject / Course</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courseRow}>
            <Pressable
              style={[
                styles.coursePill,
                {
                  backgroundColor: !selectedCourse ? theme.primary + '15' : theme.card,
                  borderColor: !selectedCourse ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setSelectedCourse('')}
            >
              <Text style={[styles.coursePillText, { color: !selectedCourse ? theme.primary : theme.text }]}>
                None
              </Text>
            </Pressable>
            {courses.map((c) => {
              const isSelected = selectedCourse === c.name;
              return (
                <Pressable
                  key={c.id}
                  style={[
                    styles.coursePill,
                    {
                      backgroundColor: isSelected ? theme.primary + '15' : theme.card,
                      borderColor: isSelected ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => setSelectedCourse(c.name)}
                >
                  <Text style={[styles.coursePillText, { color: isSelected ? theme.primary : theme.text }]}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* Detail input */}
      <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 20 }]}>Details (optional)</Text>
      <TextInput
        style={[styles.detailInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
        placeholder={
          selectedType === 'listening_music'
            ? 'Song / Artist...'
            : selectedType === 'studying'
            ? 'Topic or chapter...'
            : 'Add a note...'
        }
        placeholderTextColor={theme.textSecondary}
        value={detail}
        onChangeText={setDetail}
        multiline
      />

      {/* Save button */}
      <Pressable
        style={({ pressed }) => [
          styles.saveBtn,
          { backgroundColor: theme.primary },
          saving && { opacity: 0.5 },
          pressed && { opacity: 0.8 },
        ]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Set Status'}</Text>
      </Pressable>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },

  currentCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20, gap: 4 },
  currentLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  currentValue: { fontSize: 16, fontWeight: '700' },
  clearBtn: { marginTop: 8, alignSelf: 'flex-start' },
  clearBtnText: { fontSize: 14, fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },

  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    width: (SCREEN_WIDTH - 40 - 30) / 4,
    minWidth: 75,
  },
  typeEmoji: { fontSize: 24, marginBottom: 4 },
  typeLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  courseRow: { marginBottom: 4 },
  coursePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  coursePillText: { fontSize: 14, fontWeight: '600' },

  detailInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  saveBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});

