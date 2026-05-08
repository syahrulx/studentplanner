import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/hooks/useTheme';
import type { Campus } from '@/src/lib/eventsApi';

type Props = {
  visible: boolean;
  universityLabel: string;
  campuses: Campus[];
  suggestedCampusId?: string | null;
  onPickCampus: (campusId: string) => void;
  onPickAllCampuses: () => void;
};

/**
 * One-time prompt: which campus are you on? Shown when the user’s university
 * has campuses and no saved browse preference yet.
 */
export default function BrowseCampusDefaultModal({
  visible,
  universityLabel,
  campuses,
  suggestedCampusId,
  onPickCampus,
  onPickAllCampuses,
}: Props) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.primary + '18' }]}>
            <Feather name="map-pin" size={28} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Which campus are you on?</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            We’ll show events and services for {universityLabel} at your campus by default. You can
            change this anytime with Filters.
          </Text>

          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {campuses.map((c) => {
              const suggested = suggestedCampusId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => onPickCampus(c.id)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: theme.border, backgroundColor: theme.backgroundSecondary },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.rowText, { color: theme.text }]} numberOfLines={2}>
                    {c.name}
                  </Text>
                  {suggested ? (
                    <Text style={[styles.suggested, { color: theme.primary }]}>Profile</Text>
                  ) : (
                    <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={onPickAllCampuses}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.textSecondary }]}>
              Show all campuses (not only mine)
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    maxHeight: '78%',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  sub: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  list: { maxHeight: 280 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    gap: 10,
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600' },
  suggested: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  secondaryBtnText: { fontSize: 13, fontWeight: '600' },
});
