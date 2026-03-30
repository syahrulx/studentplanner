import { View, Text, Pressable, ScrollView, StyleSheet, Share, Alert, Platform, Modal, ActivityIndicator, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { formatDisplayDate, getTodayISO } from '@/src/utils/date';
import { Priority } from '@/src/types';
import type { SharedTask } from '@/src/types';
import { useTranslations } from '@/src/i18n';
import { getSharedTaskParticipants } from '@/src/lib/communityApi';

// Consistent navy/gold theme
const NAVY = '#003366';
const GOLD = '#f59e0b';
const BG = '#f8fafc';
const CARD = '#ffffff';
const BORDER = '#e2e8f0';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#64748b';
const RED = '#ef4444';

const PRIORITY_CONFIG = {
  [Priority.High]: { bg: 'rgba(239,68,68,0.08)', color: '#dc2626', label: 'High' },
  [Priority.Medium]: { bg: 'rgba(245,158,11,0.08)', color: '#d97706', label: 'Medium' },
  [Priority.Low]: { bg: 'rgba(34,197,94,0.08)', color: '#16a34a', label: 'Low' },
} as const;

function getDaysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T23:59:59');
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

export default function TaskDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, courses, toggleTaskDone, deleteTask, language } = useApp();
  const {
    filteredFriends, circles,
    shareTaskWithFriend, shareTaskWithCircle,
  } = useCommunity();
  const T = useTranslations(language);
  const task = tasks.find((t) => t.id === id);
  const courseDisplayName = (() => {
    if (!task) return '';
    const found = courses.find(c => c.id === task.courseId);
    if (found && task.courseId.startsWith('gc-course-')) return `gc-${found.name}`;
    return task.courseId;
  })();

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTab, setShareTab] = useState<'friend' | 'circle'>('friend');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [participants, setParticipants] = useState<SharedTask[]>([]);

  useEffect(() => {
    if (task?.id) {
      getSharedTaskParticipants(task.id).then(setParticipants).catch(() => {});
    }
  }, [task?.id]);

  const isAlreadyShared = participants.length > 0;

  if (!task) {
    return (
      <View style={s.emptyContainer}>
        <View style={s.emptyIcon}>
          <Feather name="alert-circle" size={32} color={TEXT_SECONDARY} />
        </View>
        <Text style={s.emptyTitle}>{T('taskNotFound')}</Text>
        <Pressable onPress={() => router.back()} style={s.emptyBackBtn}>
          <Text style={s.emptyBackText}>{T('back')}</Text>
        </Pressable>
      </View>
    );
  }

  // Undated tasks are treated as due today for urgency purposes
  const effectiveDueDate = task.needsDate ? getTodayISO() : task.dueDate;
  const daysLeft = getDaysUntilDue(effectiveDueDate);
  const isOverdue = daysLeft < 0;
  const isDueSoon = !isOverdue && daysLeft <= 3;
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG[Priority.Low];

  const handleDelete = () => {
    Alert.alert(
      T('deleteTask'),
      `"${task.title}" ${T('deleteTaskDesc')}`,
      [
        { text: T('cancel'), style: 'cancel' },
        { text: T('delete'), style: 'destructive', onPress: () => { deleteTask(task.id); router.back(); } },
      ]
    );
  };

  const handleToggle = () => {
    if (task.isDone) {
      Alert.alert(T('markAsNotDone'), `"${task.title}" ${T('markAsIncomplete')}`, [
        { text: T('cancel'), style: 'cancel' },
        { text: T('undo'), onPress: () => toggleTaskDone(task.id) },
      ]);
    } else {
      Alert.alert(T('markAsDoneQuestion'), `"${task.title}" ${T('markAsCompleted')}`, [
        { text: T('cancel'), style: 'cancel' },
        { text: T('markDone'), onPress: () => toggleTaskDone(task.id) },
      ]);
    }
  };

  const handleEdit = () => {
    router.push({ pathname: '/add-task' as any, params: { taskId: task.id } });
  };

  const handleShare = async () => {
    if (shareTab === 'friend' && !selectedFriendId) return;
    if (shareTab === 'circle' && !selectedCircleId) return;
    setIsSharing(true);
    try {
      if (shareTab === 'friend' && selectedFriendId) {
        const result = await shareTaskWithFriend(task.id, selectedFriendId, shareMessage || undefined);
        if (result) {
          setShowShareModal(false);
          setShareMessage('');
          setSelectedFriendId(null);
          getSharedTaskParticipants(task.id).then(setParticipants).catch(() => {});
          Alert.alert('Shared!', 'Your friend will see this task once they accept.');
        } else {
          Alert.alert('Error', 'Could not share task');
        }
      } else if (shareTab === 'circle' && selectedCircleId) {
        const results = await shareTaskWithCircle(task.id, selectedCircleId, shareMessage || undefined);
        if (results.length > 0) {
          setShowShareModal(false);
          setShareMessage('');
          setSelectedCircleId(null);
          getSharedTaskParticipants(task.id).then(setParticipants).catch(() => {});
          Alert.alert('Shared!', `Task shared with ${results.length} circle member${results.length > 1 ? 's' : ''}.`);
        } else {
          Alert.alert('Error', 'Could not share task with circle');
        }
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleNativeShare = () => {
    Share.share({
      message: `${task.title} (${task.courseId}) – Due ${formatDisplayDate(task.dueDate)} ${task.dueTime}`,
      title: 'Task',
    });
  };

  const urgencyLabel = isOverdue
    ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} overdue`
    : daysLeft === 0 ? 'Due today'
    : daysLeft === 1 ? 'Due tomorrow'
    : `${daysLeft} days left`;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.headerBtn}>
          <Feather name="chevron-left" size={24} color={TEXT_PRIMARY} />
        </Pressable>
        <Text style={s.headerTitle}>{T('taskDetails')}</Text>
        <Pressable onPress={handleNativeShare} style={s.headerBtn}>
          <Feather name="share" size={20} color={TEXT_PRIMARY} />
        </Pressable>
      </View>

      <ScrollView 
        style={s.scroll} 
        contentContainerStyle={s.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge Row */}
        <View style={s.badgeRow}>
          <View style={s.badgeCourse}>
            <Text style={s.badgeCourseText}>{courseDisplayName}</Text>
          </View>
          <View style={s.badgeType}>
            <Text style={s.badgeTypeText}>{task.type}</Text>
          </View>
          {task.id.startsWith('gc-') ? (
            <View style={s.badgeClassroom}>
              <Feather name="book-open" size={12} color="#0f9d58" />
              <Text style={s.badgeClassroomText}>Classroom</Text>
            </View>
          ) : participants.length > 0 ? (
            <View style={s.badgeShared}>
              <Feather name="users" size={12} color="#6366f1" />
              <Text style={s.badgeSharedText}>Shared</Text>
            </View>
          ) : (
            <View style={s.badgePersonal}>
              <Feather name="user" size={12} color="#64748b" />
              <Text style={s.badgePersonalText}>Personal</Text>
            </View>
          )}
          {task.isDone && (
            <View style={s.badgeDone}>
              <Feather name="check" size={12} color="#16a34a" />
              <Text style={s.badgeDoneText}>{T('completed')}</Text>
      </View>
          )}
        </View>

        {/* Title */}
        <Text style={s.title}>{task.title}</Text>

        {/* Urgency Pill — undated tasks are treated as due today */}
        <View style={[s.urgencyPill, isOverdue && s.urgencyOverdue, isDueSoon && s.urgencySoon]}>
          <Feather
            name={isOverdue ? 'alert-triangle' : 'clock'}
            size={14}
            color={isOverdue ? RED : isDueSoon ? '#d97706' : NAVY}
          />
          <Text style={[s.urgencyText, isOverdue && { color: RED }, isDueSoon && { color: '#d97706' }]}>
            {urgencyLabel}
          </Text>
        </View>

        {/* No due date banner */}
        {task.needsDate ? (
          <View style={s.needsDateBanner}>
            <Feather name="alert-circle" size={14} color="#d97706" />
            <Text style={s.needsDateBannerText}>
              No due date set in Google Classroom — tap Edit to add one
            </Text>
          </View>
        ) : null}

        {/* Info Cards */}
        <View style={s.infoGrid}>
          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: 'rgba(0,51,102,0.06)' }]}>
              <Feather name="calendar" size={18} color={NAVY} />
            </View>
            <View>
              <Text style={s.infoLabel}>{T('dueDate')}</Text>
              <Text style={[s.infoValue, task.needsDate && { color: '#d97706' }]}>
                {task.needsDate ? 'No due date' : formatDisplayDate(task.dueDate)}
              </Text>
            </View>
          </View>

          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: 'rgba(0,51,102,0.06)' }]}>
              <Feather name="clock" size={18} color={NAVY} />
            </View>
            <View>
              <Text style={s.infoLabel}>{T('deadline')}</Text>
              <Text style={s.infoValue}>{(task.dueTime || '').slice(0, 5)}</Text>
            </View>
          </View>

          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: priorityConfig.bg }]}>
              <Feather name="flag" size={18} color={priorityConfig.color} />
        </View>
            <View>
              <Text style={s.infoLabel}>{T('priority')}</Text>
              <Text style={[s.infoValue, { color: priorityConfig.color }]}>{priorityConfig.label}</Text>
        </View>
      </View>

          <View style={s.infoCard}>
            <View style={[s.infoIconWrap, { backgroundColor: 'rgba(245,158,11,0.06)' }]}>
              <Feather name="zap" size={18} color={GOLD} />
            </View>
            <View>
              <Text style={s.infoLabel}>{T('estEffort')}</Text>
              <Text style={s.infoValue}>{task.effort} {T('hours')}</Text>
            </View>
          </View>
        </View>

        {/* Share Section */}
        <View style={s.pledgeSection}>
          <Pressable
            style={({ pressed }) => [s.pledgeBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setShowShareModal(true)}
          >
            <View style={s.pledgeBtnIconWrap}>
              <Feather name={isAlreadyShared ? 'users' : 'send'} size={20} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.pledgeBtnTitle}>
                {isAlreadyShared ? 'Shared Task' : 'Share with Friends'}
              </Text>
              <Text style={s.pledgeBtnSub}>
                {isAlreadyShared
                  ? `Shared with ${participants.length} ${participants.length === 1 ? 'person' : 'people'}`
                  : 'Send to a friend or circle for accountability'}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={TEXT_SECONDARY} />
          </Pressable>

          {isAlreadyShared && (
            <View style={s.participantRow}>
              {participants.slice(0, 5).map((p, idx) => (
                <View key={p.id} style={[s.participantAvatar, idx > 0 && { marginLeft: -8 }]}>
                  <Text style={s.participantInitial}>
                    {(p.recipient_profile?.name || p.owner_profile?.name || '?').charAt(0)}
                  </Text>
                  {p.recipient_completed && (
                    <View style={s.participantCheck}>
                      <Feather name="check" size={8} color="#ffffff" />
                    </View>
                  )}
                </View>
              ))}
              {participants.length > 5 && (
                <Text style={s.participantMore}>+{participants.length - 5}</Text>
              )}
            </View>
          )}
        </View>

        {/* Notes — only shown if notes exist */}
        {task.notes ? (
        <View style={s.notesSection}>
          <View style={s.notesSectionHeader}>
            <Feather name="file-text" size={14} color={TEXT_SECONDARY} />
            <Text style={s.notesSectionTitle}>{T('notesLabel')}</Text>
          </View>
          <View style={s.notesCard}>
            <Text style={s.notesBody}>{task.notes}</Text>
          </View>
        </View>
        ) : null}

        {/* Source Section */}
        {task.id.startsWith('gc-') ? (
          <View style={s.sourceSection}>
            <View style={s.sourceHeaderRow}>
              <Text style={s.sourceSectionTitle}>Google Classroom</Text>
              <View style={[s.verifiedPill, { backgroundColor: 'rgba(15,157,88,0.08)' }]}>
                <View style={[s.verifiedDot, { backgroundColor: '#0f9d58' }]} />
                <Text style={[s.verifiedLabel, { color: '#0f9d58' }]}>Auto-synced</Text>
              </View>
            </View>
            <View style={[s.sourceCard, { borderLeftWidth: 3, borderLeftColor: '#0f9d58' }]}>
              <View style={s.sourceTagWrap}>
                <Feather name="book-open" size={12} color="#0f9d58" />
                <Text style={[s.sourceTagText, { color: '#0f9d58' }]}>Google Classroom</Text>
              </View>
              {task.sourceMessage ? (
                <Text style={s.sourceBody} numberOfLines={1}>{task.sourceMessage}</Text>
              ) : null}
            </View>
          </View>
        ) : task.sourceMessage ? (
          <View style={s.sourceSection}>
            <View style={s.sourceHeaderRow}>
              <Text style={s.sourceSectionTitle}>{T('whatsappSource')}</Text>
              <View style={s.verifiedPill}>
                <View style={s.verifiedDot} />
                <Text style={s.verifiedLabel}>{T('verifiedByAi')}</Text>
              </View>
            </View>
            <View style={s.sourceCard}>
              <View style={s.sourceTagWrap}>
                <Feather name="message-circle" size={12} color={TEXT_SECONDARY} />
                <Text style={s.sourceTagText}>{T('messageLog')}</Text>
              </View>
              <Text style={s.sourceBody}>"{task.sourceMessage}"</Text>
              <Text style={s.sourceTimestamp}>
                {`${T('extractedOn')} ${formatDisplayDate(task.dueDate)} • ${(task.dueTime || '').slice(0, 5)}`}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={s.bottomBar}>
        <Pressable onPress={handleDelete} style={({ pressed }) => [s.actionBtn, s.deleteBtn, pressed && { opacity: 0.7 }]}>
          <Feather name="trash-2" size={20} color={RED} />
        </Pressable>
        <Pressable onPress={handleEdit} style={({ pressed }) => [s.actionBtn, s.editBtn, pressed && { opacity: 0.7 }]}>
          <Feather name="edit-2" size={18} color={NAVY} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.mainActionBtn, task.isDone && s.mainActionBtnDone, pressed && { opacity: 0.85 }]}
          onPress={handleToggle}
        >
          <Feather name={task.isDone ? 'rotate-ccw' : 'check'} size={20} color="#ffffff" />
          <Text style={s.mainActionText}>
            {task.isDone ? T('completed') : T('markAsDone')}
          </Text>
        </Pressable>
      </View>

      {/* Modal: Share Task */}
      <Modal visible={showShareModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Share Task</Text>
              <Pressable onPress={() => setShowShareModal(false)} style={s.modalCloseBtn} hitSlop={10}>
                <Feather name="x" size={24} color={TEXT_SECONDARY} />
              </Pressable>
            </View>

            {/* Task Preview */}
            <View style={s.sharePreview}>
              <Feather name="file-text" size={16} color={NAVY} />
              <Text style={s.sharePreviewText} numberOfLines={1}>{task.title}</Text>
            </View>

            {/* Tab Selector */}
            <View style={s.typeSelectorGrid}>
              <Pressable
                style={[s.typeCard, shareTab === 'friend' && s.typeCardActive]}
                onPress={() => setShareTab('friend')}
              >
                <Feather name="user" size={18} color={shareTab === 'friend' ? NAVY : TEXT_SECONDARY} />
                <Text style={[s.typeCardText, shareTab === 'friend' && s.typeCardTextActive]}>Friend</Text>
              </Pressable>
              <Pressable
                style={[s.typeCard, shareTab === 'circle' && s.typeCardActive]}
                onPress={() => setShareTab('circle')}
              >
                <Feather name="users" size={18} color={shareTab === 'circle' ? NAVY : TEXT_SECONDARY} />
                <Text style={[s.typeCardText, shareTab === 'circle' && s.typeCardTextActive]}>Circle</Text>
              </Pressable>
            </View>

            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              {shareTab === 'friend' ? (
                <>
                  {filteredFriends.length === 0 ? (
                    <Text style={s.noFriendsText}>Add friends in the Community tab first!</Text>
                  ) : (
                    <View style={s.friendsList}>
                      {filteredFriends.map(friend => (
                        <Pressable
                          key={friend.id}
                          style={[s.friendRow, selectedFriendId === friend.id && s.friendRowActive]}
                          onPress={() => { setSelectedFriendId(friend.id); setSelectedCircleId(null); }}
                        >
                          <View style={s.friendAvatarWrap}>
                            <Text style={s.friendAvatarText}>{friend.name.charAt(0)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.friendName, selectedFriendId === friend.id && s.friendNameActive]}>{friend.name}</Text>
                          </View>
                          {selectedFriendId === friend.id && (
                            <Feather name="check-circle" size={20} color={NAVY} />
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <>
                  {circles.length === 0 ? (
                    <Text style={s.noFriendsText}>Create or join a circle first!</Text>
                  ) : (
                    <View style={s.friendsList}>
                      {circles.map(circle => (
                        <Pressable
                          key={circle.id}
                          style={[s.friendRow, selectedCircleId === circle.id && s.friendRowActive]}
                          onPress={() => { setSelectedCircleId(circle.id); setSelectedFriendId(null); }}
                        >
                          <View style={s.friendAvatarWrap}>
                            <Text style={s.friendAvatarText}>{circle.emoji}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.friendName, selectedCircleId === circle.id && s.friendNameActive]}>{circle.name}</Text>
                            <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>
                              {circle.member_count || 0} members
                            </Text>
                          </View>
                          {selectedCircleId === circle.id && (
                            <Feather name="check-circle" size={20} color={NAVY} />
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Optional message */}
              <TextInput
                style={s.shareMessageInput}
                placeholder="Add a note (optional)"
                placeholderTextColor={TEXT_SECONDARY}
                value={shareMessage}
                onChangeText={setShareMessage}
                maxLength={200}
              />
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable
                style={[
                  s.confirmBtn,
                  (isSharing || (shareTab === 'friend' ? !selectedFriendId : !selectedCircleId)) && s.confirmBtnDisabled,
                ]}
                disabled={isSharing || (shareTab === 'friend' ? !selectedFriendId : !selectedCircleId)}
                onPress={handleShare}
              >
                {isSharing ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={s.confirmBtnText}>Share</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Empty state
  emptyContainer: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: TEXT_SECONDARY, marginBottom: 24 },
  emptyBackBtn: { paddingVertical: 14, paddingHorizontal: 32, backgroundColor: NAVY, borderRadius: 16 },
  emptyBackText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 16,
    backgroundColor: BG,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },

  // Badges
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  badgeCourse: { backgroundColor: NAVY, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  badgeCourseText: { color: '#ffffff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  badgeType: { backgroundColor: '#f1f5f9', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  badgeTypeText: { color: TEXT_SECONDARY, fontSize: 12, fontWeight: '700' },
  badgeDone: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeDoneText: { color: '#16a34a', fontSize: 12, fontWeight: '700' },
  badgeClassroom: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(15,157,88,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeClassroomText: { color: '#0f9d58', fontSize: 12, fontWeight: '700' },
  badgeShared: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(99,102,241,0.08)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeSharedText: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  badgePersonal: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(100,116,139,0.08)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgePersonalText: { color: '#64748b', fontSize: 12, fontWeight: '700' },

  // Title
  title: { fontSize: 26, fontWeight: '800', color: TEXT_PRIMARY, lineHeight: 32, letterSpacing: -0.5, marginBottom: 14 },

  // Urgency
  urgencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(0,51,102,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 28,
  },
  urgencyOverdue: { backgroundColor: 'rgba(239,68,68,0.06)' },
  urgencySoon: { backgroundColor: 'rgba(245,158,11,0.06)' },
  urgencyText: { fontSize: 13, fontWeight: '700', color: NAVY },
  needsDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  needsDateBannerText: { flex: 1, fontSize: 13, color: '#92400e', fontWeight: '500', lineHeight: 18 },

  // Info Grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '47%',
    backgroundColor: CARD,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { fontSize: 10, fontWeight: '700', color: TEXT_SECONDARY, letterSpacing: 0.8, marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '800', color: TEXT_PRIMARY },

  // Source
  sourceSection: { marginBottom: 24 },
  sourceHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sourceSectionTitle: { fontSize: 12, fontWeight: '800', color: TEXT_SECONDARY, letterSpacing: 0.5 },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifiedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' },
  verifiedLabel: { fontSize: 11, fontWeight: '700', color: '#059669' },
  sourceCard: {
    backgroundColor: CARD,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  sourceTagWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sourceTagText: { fontSize: 11, fontWeight: '700', color: TEXT_SECONDARY },
  sourceBody: { fontSize: 14, color: TEXT_PRIMARY, fontStyle: 'italic', lineHeight: 22, fontWeight: '500' },
  sourceTimestamp: { fontSize: 12, fontWeight: '600', color: TEXT_SECONDARY, marginTop: 14 },

  // Notes
  notesSection: { marginBottom: 24 },
  notesSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  notesSectionTitle: { fontSize: 12, fontWeight: '800', color: TEXT_SECONDARY, letterSpacing: 0.5 },
  notesCard: {
    backgroundColor: CARD,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  notesBody: { fontSize: 14, color: TEXT_PRIMARY, lineHeight: 22, fontWeight: '500' },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    gap: 12,
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.12)',
  },
  editBtn: {
    backgroundColor: 'rgba(0,51,102,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,51,102,0.10)',
  },
  mainActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    backgroundColor: NAVY,
    borderRadius: 20,
  },
  mainActionBtnDone: { backgroundColor: TEXT_SECONDARY },
  mainActionText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },

  // Pledge Section
  pledgeSection: { marginBottom: 24 },
  pledgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff', // light blue from tailwind
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 16,
  },
  pledgeBtnIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  pledgeBtnTitle: { fontSize: 16, fontWeight: '800', color: NAVY, marginBottom: 4 },
  pledgeBtnSub: { fontSize: 13, color: '#3b82f6', fontWeight: '500' },
  activePledgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5', // light emerald
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    gap: 16,
  },
  activePledgeIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center' },
  activePledgeTitle: { fontSize: 16, fontWeight: '800', color: '#065f46', marginBottom: 4 },
  activePledgeSub: { fontSize: 13, color: '#059669', fontWeight: '500' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: CARD, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: NAVY },
  modalCloseBtn: { padding: 4 },
  modalScroll: { marginBottom: 24 },
  modalSectionLabel: { fontSize: 14, fontWeight: '800', color: TEXT_SECONDARY, marginBottom: 16, marginTop: 12 },
  typeSelectorGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  typeCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: BORDER, backgroundColor: BG },
  typeCardActive: { borderColor: NAVY, backgroundColor: 'rgba(0,51,102,0.05)' },
  typeCardText: { fontSize: 14, fontWeight: '700', color: TEXT_SECONDARY },
  typeCardTextActive: { color: NAVY },
  friendsList: { gap: 12 },
  friendRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: BORDER, backgroundColor: BG, gap: 12 },
  friendRowActive: { borderColor: NAVY, backgroundColor: 'rgba(0,51,102,0.05)' },
  friendAvatarWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,51,102,0.1)', alignItems: 'center', justifyContent: 'center' },
  friendAvatarText: { fontSize: 18, fontWeight: '700', color: NAVY },
  friendName: { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  friendNameActive: { color: NAVY },
  noFriendsText: { fontSize: 14, color: TEXT_SECONDARY, fontStyle: 'italic', textAlign: 'center', padding: 20 },
  modalFooter: { paddingTop: 16, borderTopWidth: 1, borderTopColor: BORDER },
  confirmBtn: { backgroundColor: NAVY, padding: 18, borderRadius: 20, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },

  // Share-specific
  sharePreview: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginBottom: 16 },
  sharePreviewText: { flex: 1, fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY },
  shareMessageInput: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 14,
    color: TEXT_PRIMARY,
    fontWeight: '500',
    backgroundColor: BG,
  },
  participantRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, paddingLeft: 4 },
  participantAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,51,102,0.1)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff',
  },
  participantInitial: { fontSize: 12, fontWeight: '700', color: NAVY },
  participantCheck: {
    position: 'absolute', bottom: -2, right: -2, width: 14, height: 14,
    borderRadius: 7, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#ffffff',
  },
  participantMore: { fontSize: 12, fontWeight: '700', color: TEXT_SECONDARY, marginLeft: 6 },
});
