import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';
export default function TaskDetailsScreen() {
  const router = useRouter();
  const { selectedTask, toggleTaskDone, deleteTask } = useAppContext();

  if (!selectedTask) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={24} color={COLORS.navy} />
          </Pressable>
          <Text style={styles.headerTitle}>Task Details</Text>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No task selected</Text>
        </View>
      </SafeAreaView>
    );
  }

  const task = selectedTask;
  const isHighRisk = task.deadlineRisk === 'High';

  const handleDelete = () => {
    Alert.alert('Delete Task', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTask(task.id);
          router.back();
        },
      },
    ]);
  };

  const handleMarkDone = () => {
    toggleTaskDone(task.id);
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <View style={styles.taskIdBadge}>
          <Text style={styles.taskIdText}>{task.id}</Text>
        </View>
        <Pressable style={styles.settingsBtn}>
          <Feather name="settings" size={22} color={COLORS.navy} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Course + Type badges */}
        <View style={styles.badgeRow}>
          <View style={styles.courseBadge}>
            <Text style={styles.courseBadgeText}>{task.courseId}</Text>
          </View>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{task.type}</Text>
          </View>
        </View>

        <Text style={styles.taskTitle}>{task.title}</Text>

        {/* Info Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Due Date</Text>
            <Text style={styles.infoValue}>{task.dueDate}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Priority</Text>
            <Text style={styles.infoValue}>{task.priority}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Deadline time</Text>
            <Text style={styles.infoValue}>{task.dueTime}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Est. Effort</Text>
            <Text style={styles.infoValue}>{task.effort}h</Text>
          </View>
        </View>

        {/* AI Safety Assessment */}
        <View
          style={[
            styles.safetyCard,
            isHighRisk ? styles.safetyCardHigh : styles.safetyCardNormal,
          ]}
        >
          <Text style={styles.safetyLabel}>AI Safety Assessment</Text>
          <Text style={styles.safetyValue}>
            {task.deadlineRisk} risk
          </Text>
        </View>

        {/* WhatsApp Source */}
        {task.sourceMessage && (
          <View style={styles.sourceBox}>
            <Text style={styles.sourceLabel}>WhatsApp source</Text>
            <Text style={styles.sourceText}>{task.sourceMessage}</Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Pressable style={styles.iconBtn}>
            <Feather name="share-2" size={20} color={COLORS.navy} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={handleDelete}>
            <Feather name="trash-2" size={20} color={COLORS.red} />
          </Pressable>
        </View>

        <Pressable style={styles.doneBtn} onPress={handleMarkDone}>
          <Text style={styles.doneBtnText}>Mark as Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backBtn: { padding: 4, marginRight: 12 },
  taskIdBadge: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  taskIdText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  settingsBtn: { padding: 4, marginLeft: 8 },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  courseBadge: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  courseBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  typeBadge: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },

  taskTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 24,
    lineHeight: 32,
  },

  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  infoItem: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },

  safetyCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  safetyCardHigh: {
    backgroundColor: COLORS.red,
  },
  safetyCardNormal: {
    backgroundColor: COLORS.navy,
  },
  safetyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  safetyValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  sourceBox: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sourceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  sourceText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  doneBtn: {
    backgroundColor: COLORS.navy,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
