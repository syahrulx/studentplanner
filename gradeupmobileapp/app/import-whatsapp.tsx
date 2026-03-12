import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';

export default function ImportScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'share' | 'paste' | 'upload'>('share');
  const [pasteText, setPasteText] = useState('');
  const [toggle1, setToggle1] = useState(true);
  const [toggle2, setToggle2] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Import WhatsApp</Text>
        <Pressable onPress={() => router.push('/groups' as any)}>
          <Text style={styles.manageLink}>Manage Groups</Text>
        </Pressable>
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabRow}>
        {(['share', 'paste', 'upload'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'share' && (
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>Step-by-step</Text>
            <Text style={styles.step}>1. Open WhatsApp and select the group</Text>
            <Text style={styles.step}>2. Tap and hold a message to select</Text>
            <Text style={styles.step}>3. Select more messages or tap "Share"</Text>
            <Text style={styles.step}>4. Choose GradeUp from the share menu</Text>
          </View>
        )}

        {activeTab === 'paste' && (
          <View style={styles.pasteSection}>
            <TextInput
              style={styles.textArea}
              placeholder="Paste WhatsApp messages here..."
              placeholderTextColor={COLORS.textSecondary}
              multiline
              value={pasteText}
              onChangeText={setPasteText}
            />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Extract deadlines</Text>
              <Pressable
                style={[styles.toggle, toggle1 && styles.toggleOn]}
                onPress={() => setToggle1(!toggle1)}
              >
                <View style={[styles.toggleKnob, toggle1 && styles.toggleKnobOn]} />
              </Pressable>
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Detect subjects</Text>
              <Pressable
                style={[styles.toggle, toggle2 && styles.toggleOn]}
                onPress={() => setToggle2(!toggle2)}
              >
                <View style={[styles.toggleKnob, toggle2 && styles.toggleKnobOn]} />
              </Pressable>
            </View>
            <Pressable
              style={styles.analyzeBtn}
              onPress={() => router.push('/ai-extraction' as any)}
            >
              <Text style={styles.analyzeBtnText}>Analyze & Extract</Text>
            </Pressable>
          </View>
        )}

        {activeTab === 'upload' && (
          <Pressable style={styles.uploadArea}>
            <Feather name="upload-cloud" size={48} color={COLORS.textSecondary} />
            <Text style={styles.uploadText}>Drop file or tap to upload</Text>
            <Text style={styles.uploadHint}>Supports .txt, .csv</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.navy,
  },
  manageLink: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gold,
  },

  tabRow: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  instructionsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 16,
  },
  step: {
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: 12,
    lineHeight: 22,
  },

  pasteSection: { gap: 16 },
  textArea: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    minHeight: 160,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleOn: {
    backgroundColor: COLORS.gold,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    alignSelf: 'flex-start',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  analyzeBtn: {
    backgroundColor: COLORS.navy,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  analyzeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  uploadArea: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    padding: 40,
    alignItems: 'center',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  uploadHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
});
