import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useQuiz } from '@/src/context/QuizContext';

const PAD = 20;
const RADIUS = 14;

export default function QuizJoinByCodeScreen() {
  const theme = useTheme();
  const { joinQuiz } = useQuiz();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const c = code.trim().toUpperCase();
    if (!c || c.length < 4) {
      Alert.alert('Invalid code', 'Please enter a valid invite code.');
      return;
    }
    setLoading(true);
    try {
      const session = await joinQuiz(c, true);
      router.replace({ pathname: '/match-lobby', params: { sessionId: session.id } } as any);
    } catch {
      Alert.alert('Could not join', 'Invite code is invalid or the match already started.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Join with invite code</Text>
      </View>

      <Text style={[styles.sub, { color: theme.textSecondary }]}>
        Enter the code the host shared. You don't need to create or generate a quiz first.
      </Text>

      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
        placeholder="Enter code"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        value={code}
        onChangeText={(t) => setCode(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
        onSubmitEditing={handleJoin}
        returnKeyType="go"
      />

      <Pressable
        style={[
          styles.btn,
          {
            backgroundColor: code.trim().length >= 4 && !loading ? theme.primary : `${theme.textSecondary}55`,
          },
        ]}
        onPress={handleJoin}
        disabled={loading || code.trim().length < 4}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Join lobby</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: PAD, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '800', flex: 1 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 22 },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 16,
    textAlign: 'center',
  },
  btn: {
    paddingVertical: 16,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
