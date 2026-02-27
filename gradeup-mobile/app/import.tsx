import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';

export default function Import() {
  const { setPendingExtraction } = useApp();
  const [activeTab, setActiveTab] = useState<'share' | 'paste' | 'upload'>('paste');
  const [pastedText, setPastedText] = useState('');

  const handleExtract = () => {
    setPendingExtraction(pastedText);
    router.push('/ai-extraction' as any);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Import WhatsApp</Text>
        <Pressable onPress={() => router.push('/groups' as any)}>
          <Text style={styles.manageLink}>Manage Groups</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(['Share', 'Paste', 'Upload'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab.toLowerCase() && styles.tabActive]}
            onPress={() => setActiveTab(tab.toLowerCase() as 'share' | 'paste' | 'upload')}
          >
            <Text style={[styles.tabText, activeTab === tab.toLowerCase() && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'share' && (
        <View style={styles.shareCard}>
          <View style={styles.shareIcon}><Icons.MessageCircle size={28} color={COLORS.navy} /></View>
          <Text style={styles.shareTitle}>Direct Share Method</Text>
          <Text style={styles.shareDesc}>Use the native share sheet for speed.</Text>
          <Text style={styles.shareStep}>1. Open WhatsApp</Text>
          <Text style={styles.shareStep}>2. Long press task message</Text>
          <Text style={styles.shareStep}>3. Tap Share → Select GradeUp</Text>
        </View>
      )}

      {activeTab === 'paste' && (
        <View style={styles.pasteSection}>
          <TextInput
            style={styles.textArea}
            value={pastedText}
            onChangeText={setPastedText}
            placeholder="Paste forwarded message here..."
            placeholderTextColor={COLORS.gray}
            multiline
          />
          <Pressable
            style={[styles.extractBtn, !pastedText.trim() && styles.extractBtnDisabled]}
            onPress={handleExtract}
            disabled={!pastedText.trim()}
          >
            <Icons.Sparkles size={20} color={COLORS.gold} />
            <Text style={styles.extractBtnText}>Analyze & Extract</Text>
          </Pressable>
        </View>
      )}

      {activeTab === 'upload' && (
        <View style={styles.uploadArea}>
          <View style={styles.uploadIcon}><Icons.Plus size={24} color={COLORS.gray} /></View>
          <Text style={styles.uploadText}>Upload Chat History</Text>
        </View>
      )}
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  manageLink: { fontSize: 10, fontWeight: '800', color: COLORS.gold, letterSpacing: 1.5 },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.card, padding: 6, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, marginBottom: 28 },
  tab: { flex: 1, paddingVertical: 13, borderRadius: 18, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.navy },
  tabText: { fontSize: 10, fontWeight: '800', color: COLORS.gray, letterSpacing: 1 },
  tabTextActive: { color: COLORS.white },
  shareCard: { backgroundColor: '#0c4a6e', borderRadius: 32, padding: 36, borderWidth: 1, borderColor: 'rgba(14,116,144,0.5)' },
  shareIcon: { width: 64, height: 64, backgroundColor: COLORS.card, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  shareTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 10, letterSpacing: -0.5 },
  shareDesc: { fontSize: 13, color: COLORS.gray, marginBottom: 20, lineHeight: 18 },
  shareStep: { fontSize: 13, fontWeight: '700', color: COLORS.gray, marginBottom: 10, lineHeight: 20 },
  pasteSection: { marginBottom: 28 },
  textArea: { height: 200, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 28, padding: 24, fontSize: 14, marginBottom: 28, textAlignVertical: 'top', color: COLORS.text },
  extractBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: COLORS.navy, paddingVertical: 22, borderRadius: 22 },
  extractBtnDisabled: { opacity: 0.4 },
  extractBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  uploadArea: { height: 200, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.border, borderRadius: 32, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', gap: 18 },
  uploadIcon: { width: 52, height: 52, backgroundColor: COLORS.card, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  uploadText: { fontSize: 11, fontWeight: '800', color: COLORS.gray },
});
