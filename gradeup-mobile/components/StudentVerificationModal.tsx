import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import {
  getStudentVerificationStatus,
  sendStudentVerificationOtp,
  verifyStudentOtp,
  type VerificationStatus,
} from '@/src/lib/servicesApi';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called when the user is verified (either already or just submitted). */
  onVerified: () => void;
}

export default function StudentVerificationModal({ visible, onClose, onVerified }: Props) {
  const theme = useTheme();
  const dark = isDarkTheme(theme.id);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus>('none');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [studentEmail, setStudentEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [adminNote, setAdminNote] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getStudentVerificationStatus()
      .then((result) => {
        setStatus(result.status);
        if (result.studentEmail) setStudentEmail(result.studentEmail);
        if (result.adminNote) setAdminNote(result.adminNote);
        if (result.status === 'verified') {
          onVerified();
        }
      })
      .catch(() => setStatus('none'))
      .finally(() => setLoading(false));
  }, [visible]);

  const handleSendOtp = async () => {
    const email = studentEmail.trim();
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid student email address.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await sendStudentVerificationOtp(email);
      if (result === 'already_verified') {
        onVerified();
      } else {
        setStep('otp');
        Alert.alert(
          'Code Sent!',
          `A 6-digit verification code has been sent to ${email}. Please check your inbox (and spam folder).`,
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send verification code');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length < 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit code.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await verifyStudentOtp(otpCode);
      if (result.status === 'verified') {
        Alert.alert('Success!', 'Your student status has been verified.', [
          { text: 'Great', onPress: onVerified }
        ]);
      } else {
        Alert.alert('Verification Failed', result.message || 'The code is invalid or has expired.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to verify code');
    } finally {
      setSubmitting(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Checking verification…</Text>
        </View>
      );
    }

    if (status === 'pending') {
      return (
        <View style={styles.stateContainer}>
          <View style={[styles.iconBadge, { backgroundColor: '#FF9F0A22' }]}>
            <Feather name="clock" size={28} color="#FF9F0A" />
          </View>
          <Text style={[styles.stateTitle, { color: theme.text }]}>Verification Pending</Text>
          <Text style={[styles.stateDesc, { color: theme.textSecondary }]}>
            Your student email verification is being reviewed by our team. You'll be able to use Services once approved.
          </Text>
          <Text style={[styles.emailLabel, { color: theme.textSecondary }]}>
            Submitted email: <Text style={{ color: theme.text, fontWeight: '700' }}>{studentEmail}</Text>
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.actionBtnText, { color: theme.text }]}>Got it</Text>
          </Pressable>
        </View>
      );
    }

    if (step === 'otp') {
      return (
        <View style={styles.stateContainer}>
          <View style={[styles.iconBadge, { backgroundColor: '#34C75922' }]}>
            <Feather name="mail" size={28} color="#34C759" />
          </View>
          <Text style={[styles.stateTitle, { color: theme.text }]}>Check your Email</Text>
          <Text style={[styles.stateDesc, { color: theme.textSecondary }]}>
            We've sent a code to <Text style={{ fontWeight: '700' }}>{studentEmail}</Text>. Enter it below to verify your account.
          </Text>

          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Verification Code</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border, textAlign: 'center', letterSpacing: 8, fontSize: 24 }]}
            placeholder="000000"
            placeholderTextColor={theme.textSecondary + '44'}
            value={otpCode}
            onChangeText={(t) => setOtpCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />

          <Pressable
            onPress={handleVerifyOtp}
            disabled={submitting || otpCode.length < 6}
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: theme.primary },
              (otpCode.length < 6 || submitting) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Verify Student Status</Text>
            )}
          </Pressable>

          <Pressable onPress={() => setStep('email')} style={{ marginTop: 16 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>Use a different email</Text>
          </Pressable>
        </View>
      );
    }

    // Default: Email Input Step
    return (
      <View style={styles.stateContainer}>
        <View style={[styles.iconBadge, { backgroundColor: '#0A84FF22' }]}>
          <Feather name="shield" size={28} color="#0A84FF" />
        </View>
        <Text style={[styles.stateTitle, { color: theme.text }]}>Student Verification</Text>
        <Text style={[styles.stateDesc, { color: theme.textSecondary }]}>
          To keep our marketplace safe, please verify your institutional email address. We'll send you a 6-digit code.
        </Text>

        <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Institutional Email</Text>
        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
          placeholder="yourname@student.university.edu"
          placeholderTextColor={theme.textSecondary + '88'}
          value={studentEmail}
          onChangeText={setStudentEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.hintText, { color: theme.textSecondary }]}>
          Must be a valid student/staff email (e.g. @student.uitm.edu.my).
        </Text>

        <Pressable
          onPress={handleSendOtp}
          disabled={submitting || !studentEmail.trim()}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: theme.primary },
            (!studentEmail.trim() || submitting) && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Get Verification Code</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={20} color={theme.textSecondary} />
          </Pressable>
          {renderContent()}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16,
    minHeight: 350,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  stateContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  stateDesc: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  emailLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 8,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  actionBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  submitBtn: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.2,
  },
});
