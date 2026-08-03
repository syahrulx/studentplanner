import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/src/lib/supabase';

type Ticket = { id: string; subject: string; message: string; kind: string; status: string; created_at: string };
type Message = { id: string; author_role: 'user' | 'admin'; body: string; created_at: string };

export default function SupportTicketScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!reportId) return;
    const [{ data: ticketRows, error: ticketError }, { data: messageRows, error: messageError }] = await Promise.all([
      supabase.rpc('get_my_support_report', { p_report_id: reportId }),
      supabase.from('support_report_messages').select('id,author_role,body,created_at').eq('report_id', reportId).order('created_at', { ascending: true }),
    ]);
    if (ticketError || !ticketRows?.[0]) throw new Error('This support ticket could not be opened.');
    if (messageError) throw messageError;
    setTicket(ticketRows[0] as Ticket);
    setMessages((messageRows ?? []) as Message[]);
  }, [reportId]);

  useEffect(() => { void load().catch((error) => Alert.alert('Support', error.message)).finally(() => setLoading(false)); }, [load]);

  const send = async () => {
    const body = reply.trim();
    if (!body || !reportId || sending) return;
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again.');
      const { data, error } = await supabase.from('support_report_messages').insert({ report_id: reportId, author_id: auth.user.id, author_role: 'user', body }).select('id,author_role,body,created_at').single();
      if (error) throw error;
      setMessages((current) => [...current, data as Message]);
      setReply('');
    } catch (error) {
      Alert.alert('Could not send', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSending(false); }
  };

  if (loading) return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.primary} /></View>;
  if (!ticket) return <View style={[styles.center, { backgroundColor: theme.background }]}><Text style={{ color: theme.text }}>Ticket unavailable.</Text></View>;

  return <KeyboardAvoidingView style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[styles.header, { borderBottomColor: theme.border }]}><Pressable onPress={() => router.back()} style={styles.back}><Feather name="chevron-left" size={24} color={theme.text} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>Support ticket</Text><Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>{ticket.status.replace('_', ' ')}</Text></View></View>
    <FlatList data={messages} keyExtractor={(item) => item.id} contentContainerStyle={styles.content} ListHeaderComponent={<View style={[styles.report, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[styles.subject, { color: theme.text }]}>{ticket.subject}</Text><Text style={[styles.meta, { color: theme.textSecondary }]}>{new Date(ticket.created_at).toLocaleString()}</Text><Text style={[styles.body, { color: theme.text }]}>{ticket.message}</Text></View>} renderItem={({ item }) => <View style={[styles.message, item.author_role === 'user' ? { alignSelf: 'flex-end', backgroundColor: theme.primary } : { alignSelf: 'flex-start', backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}><Text style={[styles.role, { color: item.author_role === 'user' ? '#ffffffbb' : theme.textSecondary }]}>{item.author_role === 'user' ? 'You' : 'Rencana support'}</Text><Text style={[styles.body, { color: item.author_role === 'user' ? '#fff' : theme.text }]}>{item.body}</Text></View>} ListEmptyComponent={<Text style={[styles.empty, { color: theme.textSecondary }]}>No replies yet. You can add more details below.</Text>} />
    <View style={[styles.composer, { backgroundColor: theme.card, borderTopColor: theme.border }]}><TextInput value={reply} onChangeText={setReply} placeholder="Reply to support…" placeholderTextColor={theme.textSecondary} multiline maxLength={4000} style={[styles.input, { color: theme.text, borderColor: theme.border }]} /><Pressable disabled={!reply.trim() || sending} onPress={send} style={[styles.send, { backgroundColor: theme.primary, opacity: !reply.trim() || sending ? 0.5 : 1 }]}><Feather name="send" size={18} color={theme.textInverse} /></Pressable></View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { height: 62, paddingHorizontal: 16, alignItems: 'center', flexDirection: 'row', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth }, back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 18, fontWeight: '800' }, content: { padding: 16, gap: 10 }, report: { borderWidth: 1, borderRadius: 16, padding: 15, marginBottom: 8 }, subject: { fontSize: 17, fontWeight: '800' }, meta: { marginTop: 4, fontSize: 11, fontWeight: '600' }, body: { marginTop: 7, fontSize: 14, lineHeight: 21, fontWeight: '500' }, message: { maxWidth: '84%', borderRadius: 16, padding: 12 }, role: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, empty: { textAlign: 'center', paddingVertical: 18, fontSize: 13 }, composer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-end' }, input: { flex: 1, minHeight: 44, maxHeight: 110, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, send: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' } });
