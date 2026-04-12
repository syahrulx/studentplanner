import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { useTranslations } from '@/src/i18n';
import type { SharedTask } from '@/src/types';

function formatDisplayName(name?: string | null) {
  if (!name?.trim()) return 'Someone';
  const s = name.trim();
  if (s !== s.toUpperCase() || s.length < 8) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function formatDue(dueDate?: string, dueTime?: string): string {
  const date = (dueDate || '').trim();
  if (!date) return 'No due date';
  const t = (dueTime || '').trim();
  return t ? `${date} · ${t}` : date;
}

export default function SharedTaskPreview() {
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const theme = useTheme();
  const { language } = useApp();
  const T = useTranslations(language);
  const insets = useSafeAreaInsets();
  const { incomingSharedTasks, respondToShare, refreshSharedTasks } = useCommunity();

  const [loading, setLoading] = useState(false);
  const [responding, setResponding] = useState<'accept' | 'decline' | null>(null);

  const shared = useMemo<SharedTask | undefined>(
    () => incomingSharedTasks.find((s) => s.id === id),
    [incomingSharedTasks, id],
  );

  useEffect(() => {
    if (shared) return;
    setLoading(true);
    refreshSharedTasks()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [shared, refreshSharedTasks]);

  const task = shared?.task;
  const ownerName = formatDisplayName(shared?.owner_profile?.name);

  const onRespond = async (accept: boolean) => {
    if (!shared?.id) return;
    setResponding(accept ? 'accept' : 'decline');
    try {
      await respondToShare(shared.id, accept);
      router.back();
    } catch (e: any) {
      Alert.alert(T('commSharedPreviewUpdateFailTitle'), e?.message || T('commTryAgainShort'));
    } finally {
      setResponding(null);
    }
  };

  if (loading || !shared) {
    return (
      <View style={[s.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 16) }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={[s.backBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Feather name="chevron-left" size={22} color={theme.text} />
          </Pressable>
          <Text style={[s.title, { color: theme.text }]}>Task share</Text>
        </View>
        <View style={s.loadingWrap}>
          <ActivityIndicator color={theme.primary} />
          <Text style={[s.loadingText, { color: theme.textSecondary }]}>Loading task…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: theme.background, paddingTop: Math.max(insets.top, 16) }]}>
      <View style={s.headerRow}>
        <Pressable onPress={() => router.back()} style={[s.backBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Feather name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[s.title, { color: theme.text }]} numberOfLines={1}>Task share</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) }} showsVerticalScrollIndicator={false}>
        <View style={[s.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.heroTopRow}>
            <View style={s.heroLead}>
              <Feather name="users" size={18} color={theme.primary} />
              <Text style={[s.heroLeadText, { color: theme.textSecondary }]}>{ownerName} shared a task</Text>
            </View>
          </View>
          {shared.message ? (
            <View style={[s.messageBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Text style={[s.messageText, { color: theme.text }]} numberOfLines={6}>
                “{shared.message}”
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[s.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.taskTitle, { color: theme.text }]}>{task?.title || 'Task'}</Text>

          <View style={s.metaGrid}>
            <View style={s.metaRow}>
              <Text style={[s.metaLabel, { color: theme.textSecondary }]}>Subject</Text>
              <Text style={[s.metaValue, { color: theme.text }]} numberOfLines={1}>{task?.courseId || '—'}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={[s.metaLabel, { color: theme.textSecondary }]}>Type</Text>
              <Text style={[s.metaValue, { color: theme.text }]} numberOfLines={1}>{task?.type || '—'}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={[s.metaLabel, { color: theme.textSecondary }]}>Due</Text>
              <Text style={[s.metaValue, { color: theme.text }]} numberOfLines={1}>
                {formatDue(task?.dueDate, task?.dueTime)}
              </Text>
            </View>
            <View style={s.metaRow}>
              <Text style={[s.metaLabel, { color: theme.textSecondary }]}>Risk</Text>
              <Text style={[s.metaValue, { color: theme.text }]} numberOfLines={1}>{task?.deadlineRisk || '—'}</Text>
            </View>
          </View>

          {task?.notes ? (
            <View style={[s.notesBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Text style={[s.notesLabel, { color: theme.textSecondary }]}>Notes</Text>
              <Text style={[s.notesText, { color: theme.text }]}>{task.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              s.declineBtn,
              { borderColor: theme.border, backgroundColor: theme.card },
              pressed && { opacity: 0.8 },
              responding && { opacity: 0.6 },
            ]}
            disabled={!!responding}
            onPress={() => void onRespond(false)}
          >
            {responding === 'decline' ? <ActivityIndicator color={theme.textSecondary} /> : <Text style={[s.declineText, { color: theme.textSecondary }]}>Decline</Text>}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              s.acceptBtn,
              { backgroundColor: '#10b981' },
              pressed && { opacity: 0.85 },
              responding && { opacity: 0.6 },
            ]}
            disabled={!!responding}
            onPress={() => void onRespond(true)}
          >
            {responding === 'accept' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={s.acceptText}>Accept</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontWeight: '600' },

  heroCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroLeadText: { fontSize: 13, fontWeight: '700' },
  messageBox: { marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  messageText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },

  detailCard: { marginTop: 14, borderWidth: 1, borderRadius: 16, padding: 14 },
  taskTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4, marginBottom: 10 },
  metaGrid: { gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  metaLabel: { fontSize: 12, fontWeight: '800' },
  metaValue: { fontSize: 13, fontWeight: '800', maxWidth: '62%' },

  notesBox: { marginTop: 14, borderWidth: 1, borderRadius: 12, padding: 12 },
  notesLabel: { fontSize: 12, fontWeight: '900', marginBottom: 6 },
  notesText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  declineBtn: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  declineText: { fontSize: 15, fontWeight: '900' },
  acceptBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  acceptText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});

