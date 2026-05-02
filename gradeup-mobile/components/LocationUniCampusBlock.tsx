import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/hooks/useTheme';
import * as eventsApi from '@/src/lib/eventsApi';

export type LocationUniCampusBlockProps = {
  universityId: string | null;
  campusId: string | null;
  /** Free-text meeting place / building / room (maps to `location` on post/service). */
  locationDetail: string;
  onUniversityIdChange: (id: string | null) => void;
  onCampusIdChange: (id: string | null, resolvedCampusName: string | null) => void;
  onLocationDetailChange: (text: string) => void;
  /** When set, university cannot be changed (e.g. authority scope). */
  lockedUniversityId?: string | null;
  accentColor?: string;
};

/**
 * University + campus pickers (search + lists, same behaviour as Events filters) and optional specific location text.
 */
export function LocationUniCampusBlock({
  universityId,
  campusId,
  locationDetail,
  onUniversityIdChange,
  onCampusIdChange,
  onLocationDetailChange,
  lockedUniversityId,
  accentColor: accentProp,
}: LocationUniCampusBlockProps) {
  const theme = useTheme();
  const accent = accentProp ?? theme.primary;

  const [universities, setUniversities] = useState<eventsApi.University[]>([]);
  const [campuses, setCampuses] = useState<eventsApi.Campus[]>([]);

  const [uniSearchQuery, setUniSearchQuery] = useState('');
  const [campusSearchQuery, setCampusSearchQuery] = useState('');
  const [uniPickerExpanded, setUniPickerExpanded] = useState(false);
  const [campusPickerExpanded, setCampusPickerExpanded] = useState(false);

  const effectiveUniId = lockedUniversityId ?? universityId;

  useEffect(() => {
    eventsApi.fetchUniversities().then(setUniversities);
  }, []);

  useEffect(() => {
    if (effectiveUniId) {
      eventsApi.fetchCampuses(effectiveUniId).then(setCampuses);
    } else {
      setCampuses([]);
    }
  }, [effectiveUniId]);

  useEffect(() => {
    setCampusSearchQuery('');
    setCampusPickerExpanded(false);
  }, [effectiveUniId]);

  const filteredUniversitiesList = useMemo(() => {
    const q = uniSearchQuery.trim().toLowerCase();
    let list = universities;
    if (q) {
      list = universities.filter(
        (u) => u.name.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [universities, uniSearchQuery]);

  const filteredCampusesList = useMemo(() => {
    const q = campusSearchQuery.trim().toLowerCase();
    if (!campuses.length) return [];
    if (!q) return [...campuses].sort((a, b) => a.name.localeCompare(b.name));
    return campuses.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [campuses, campusSearchQuery]);

  const emitCampus = (id: string | null) => {
    const name = id ? campuses.find((c) => c.id === id)?.name ?? null : null;
    onCampusIdChange(id, name);
  };

  const locked = !!lockedUniversityId;

  return (
    <View>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>UNIVERSITY</Text>
      <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
        {locked
          ? 'Posting scope is set by your authority role.'
          : 'Defaults can start from your profile; search or pick another university.'}
      </Text>

      {locked && lockedUniversityId ? (
        <View
          style={[
            styles.collapsedRow,
            { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
          ]}
        >
          <Feather name="award" size={16} color={accent} />
          <Text style={[styles.collapsedTitle, { color: theme.text }]} numberOfLines={2}>
            {universities.find((u) => u.id === lockedUniversityId)?.name || lockedUniversityId}
          </Text>
        </View>
      ) : effectiveUniId && !uniPickerExpanded ? (
        <View
          style={[
            styles.collapsedRow,
            { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
          ]}
        >
          <Feather name="award" size={16} color={accent} />
          <Text style={[styles.collapsedTitle, { color: theme.text }]} numberOfLines={2}>
            {universities.find((u) => u.id === effectiveUniId)?.name || effectiveUniId}
          </Text>
          <Pressable onPress={() => setUniPickerExpanded(true)} hitSlop={8}>
            <Text style={[styles.changeLink, { color: theme.primary }]}>Change</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onUniversityIdChange(null);
              emitCampus(null);
              setUniPickerExpanded(true);
            }}
            hitSlop={6}
          >
            <Feather name="x-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {!locked && (!effectiveUniId || uniPickerExpanded) && (
        <>
          {effectiveUniId && uniPickerExpanded ? (
            <Pressable
              onPress={() => {
                setUniPickerExpanded(false);
                setUniSearchQuery('');
              }}
              hitSlop={8}
              style={styles.doneRow}
            >
              <Text style={[styles.doneLink, { color: theme.primary }]}>Done</Text>
            </Pressable>
          ) : null}
          <View style={[styles.inputRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            <Feather name="search" size={16} color={theme.textSecondary} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Search universities…"
              placeholderTextColor={theme.textSecondary}
              value={uniSearchQuery}
              onChangeText={setUniSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {uniSearchQuery ? (
              <Pressable onPress={() => setUniSearchQuery('')} hitSlop={6}>
                <Feather name="x-circle" size={16} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <View
            style={[styles.searchListWrap, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
          >
            <Pressable
              style={[styles.hitRow, { borderBottomColor: theme.border }]}
              onPress={() => {
                onUniversityIdChange(null);
                emitCampus(null);
                setUniSearchQuery('');
                setUniPickerExpanded(true);
              }}
            >
              <Text style={[styles.hitText, { color: theme.text }]}>Any university</Text>
              {universityId == null ? <Feather name="check" size={18} color={theme.primary} /> : null}
            </Pressable>
            <ScrollView style={styles.searchListScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredUniversitiesList.length === 0 ? (
                <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
                  No universities match your search.
                </Text>
              ) : (
                filteredUniversitiesList.map((item) => {
                  const sel = universityId === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.hitRow, { borderBottomColor: theme.border }]}
                      onPress={() => {
                        onUniversityIdChange(item.id);
                        emitCampus(null);
                        setUniSearchQuery('');
                        setUniPickerExpanded(false);
                      }}
                    >
                      <Text style={[styles.hitText, { color: theme.text }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {sel ? <Feather name="check" size={18} color={theme.primary} /> : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </>
      )}

      {effectiveUniId ? (
        <>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CAMPUS</Text>
          <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
            Optional. Search and pick a campus, or leave as any campus.
          </Text>

          {campusId && !campusPickerExpanded ? (
            <View
              style={[
                styles.collapsedRow,
                { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
              ]}
            >
              <Feather name="map-pin" size={16} color={accent} />
              <Text style={[styles.collapsedTitle, { color: theme.text }]} numberOfLines={2}>
                {campuses.find((c) => c.id === campusId)?.name ?? 'Campus'}
              </Text>
              <Pressable onPress={() => setCampusPickerExpanded(true)} hitSlop={8}>
                <Text style={[styles.changeLink, { color: theme.primary }]}>Change</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  emitCampus(null);
                }}
                hitSlop={6}
              >
                <Feather name="x-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
          ) : null}

          {!campusId && !campusPickerExpanded ? (
            <Pressable
              style={[
                styles.compactTapRow,
                { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
              ]}
              onPress={() => setCampusPickerExpanded(true)}
            >
              <Feather name="map-pin" size={16} color={theme.textSecondary} />
              <View style={styles.compactTapCol}>
                <Text style={[styles.compactTapTitle, { color: theme.text }]}>Any campus</Text>
                <Text style={[styles.compactTapHint, { color: theme.textSecondary }]}>
                  Tap to search campuses
                </Text>
              </View>
              <Feather name="chevron-down" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}

          {campusPickerExpanded ? (
            <>
              <Pressable
                onPress={() => {
                  setCampusPickerExpanded(false);
                  setCampusSearchQuery('');
                }}
                hitSlop={8}
                style={styles.doneRow}
              >
                <Text style={[styles.doneLink, { color: theme.primary }]}>Done</Text>
              </Pressable>
              <View
                style={[styles.inputRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
              >
                <Feather name="search" size={16} color={theme.textSecondary} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Search campuses…"
                  placeholderTextColor={theme.textSecondary}
                  value={campusSearchQuery}
                  onChangeText={setCampusSearchQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {campusSearchQuery ? (
                  <Pressable onPress={() => setCampusSearchQuery('')} hitSlop={6}>
                    <Feather name="x-circle" size={16} color={theme.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
              <View
                style={[styles.searchListWrap, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
              >
                <Pressable
                  style={[styles.hitRow, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    emitCampus(null);
                    setCampusSearchQuery('');
                    setCampusPickerExpanded(false);
                  }}
                >
                  <Text style={[styles.hitText, { color: theme.text }]}>Any campus</Text>
                  {!campusId ? <Feather name="check" size={18} color={theme.primary} /> : null}
                </Pressable>
                <ScrollView style={styles.searchListScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {filteredCampusesList.length === 0 ? (
                    <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
                      {campusSearchQuery.trim()
                        ? 'No campuses match your search.'
                        : 'No campuses loaded for this university.'}
                    </Text>
                  ) : (
                    filteredCampusesList.map((item) => {
                      const sel = campusId === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          style={[styles.hitRow, { borderBottomColor: theme.border }]}
                          onPress={() => {
                            emitCampus(item.id);
                            setCampusSearchQuery('');
                            setCampusPickerExpanded(false);
                          }}
                        >
                          <Text style={[styles.hitText, { color: theme.text }]} numberOfLines={2}>
                            {item.name}
                          </Text>
                          {sel ? <Feather name="check" size={18} color={theme.primary} /> : null}
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>SPECIFIC PLACE (OPTIONAL)</Text>
      <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
        Building, room, or meeting point — shown alongside campus.
      </Text>
      <View style={[styles.detailInputWrap, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Feather name="navigation" size={16} color={accent} style={{ marginTop: 2 }} />
        <TextInput
          style={[styles.detailInput, { color: theme.text }]}
          placeholder="e.g. Library level 2, Foyer A"
          placeholderTextColor={theme.textSecondary}
          value={locationDetail}
          onChangeText={onLocationDetailChange}
          multiline
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 6,
    paddingLeft: 2,
  },
  fieldHint: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: -2,
    marginBottom: 10,
    paddingLeft: 2,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  collapsedTitle: { flex: 1, fontSize: 15, fontWeight: '600', minWidth: 0 },
  changeLink: { fontSize: 14, fontWeight: '700' },
  doneRow: { alignSelf: 'flex-end', marginBottom: 6, paddingVertical: 4 },
  doneLink: { fontSize: 14, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
  searchListWrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 8,
  },
  searchListScroll: { maxHeight: 200 },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hitText: { flex: 1, fontSize: 15, fontWeight: '500' },
  emptyHint: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  compactTapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  compactTapCol: { flex: 1, minWidth: 0 },
  compactTapTitle: { fontSize: 15, fontWeight: '600' },
  compactTapHint: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  detailInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 88,
  },
  detailInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    minHeight: 72,
    padding: 0,
    lineHeight: 21,
  },
});
