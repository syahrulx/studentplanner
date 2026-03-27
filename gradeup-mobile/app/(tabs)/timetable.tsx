import { View, Text, StyleSheet, Platform } from 'react-native';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import Feather from '@expo/vector-icons/Feather';

const NAVY = '#003366';
const BG = '#f8fafc';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#94a3b8';

export default function TimetableScreen() {
  const { language } = useApp();
  const T = useTranslations(language);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerIconWrap}>
            <Feather name="calendar" size={20} color={NAVY} />
          </View>
          <View>
            <Text style={s.headerTitle}>{(T as any)('timetable') || 'Timetable'}</Text>
            <Text style={s.headerSub}>Manage your class schedule</Text>
          </View>
        </View>
      </View>

      <View style={s.content}>
        <Feather name="clock" size={48} color={TEXT_SECONDARY} style={{ opacity: 0.5, marginBottom: 16 }} />
        <Text style={s.emptyTitle}>Timetable Coming Soon</Text>
        <Text style={s.emptySub}>Your weekly schedule will appear here.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 64 : 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,51,102,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: TEXT_PRIMARY, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '500', color: TEXT_SECONDARY, marginTop: 2 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
});
