import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/common/Button';
import { useAuthStore } from '@/store/authStore';
import { resendConfirmationCode } from '@/services/cognito';
import { colors } from '@/theme/colors';

export default function VerifyScreen() {
  const router = useRouter();
  const { confirmOtp, pendingEmail, isLoading, error, clearError } = useAuthStore();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resending, setResending] = useState(false);
  const inputs = useRef<Array<TextInput | null>>([]);

  function handleChange(value: string, index: number) {
    const cleaned = value.replace(/[^0-9]/g, '');
    const newOtp = [...otp];

    if (cleaned.length > 1) {
      // Paste scenario
      for (let i = 0; i < 6; i++) {
        newOtp[i] = cleaned[i] ?? '';
      }
      setOtp(newOtp);
      inputs.current[5]?.focus();
      return;
    }

    newOtp[index] = cleaned;
    setOtp(newOtp);

    if (cleaned && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    const code = otp.join('');
    if (code.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter all 6 digits of your verification code.');
      return;
    }
    if (!pendingEmail) {
      Alert.alert('Error', 'No email found. Please go back and try again.');
      return;
    }
    clearError();
    try {
      await confirmOtp(pendingEmail, code);
      Alert.alert(
        'Email Verified!',
        'Your account is ready. Please sign in.',
        [{ text: 'Sign In', onPress: () => router.replace('/auth/login') }]
      );
    } catch {
      // error shown via store.error
    }
  }

  async function handleResend() {
    if (!pendingEmail) {
      Alert.alert('Error', 'No email found. Please go back and register again.');
      return;
    }
    setResending(true);
    try {
      await resendConfirmationCode(pendingEmail);
      Alert.alert('Code Sent', `A new verification code has been sent to ${pendingEmail}`);
      setOtp(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } catch {
      Alert.alert('Error', 'Could not resend code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          <View style={styles.iconWrapper}>
            <Ionicons name="mail-outline" size={40} color={colors.primary} />
          </View>

          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.email}>{pendingEmail ?? 'your email'}</Text>
          </Text>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* OTP inputs */}
          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => { inputs.current[index] = ref; }}
                style={[styles.otpInput, digit ? styles.otpInputFilled : {}]}
                value={digit}
                onChangeText={(val) => handleChange(val, index)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                keyboardType="number-pad"
                maxLength={6}
                selectTextOnFocus
                textContentType="oneTimeCode"
              />
            ))}
          </View>

          <Button
            title="Verify Email"
            onPress={handleVerify}
            loading={isLoading}
            style={styles.verifyBtn}
          />

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn't receive the code? </Text>
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              <Text style={[styles.resendLink, resending && styles.resendLinkDisabled]}>
                {resending ? 'Sending...' : 'Resend'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={16} color={colors.gray[500]} />
            <Text style={styles.backText}>Back to register</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.gray[900],
    marginBottom: 10,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  email: {
    color: colors.primary,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
    width: '100%',
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
  },
  otpInput: {
    width: 46,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.gray[900],
  },
  otpInputFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
    color: colors.primaryDark,
  },
  verifyBtn: {
    width: '100%',
    marginBottom: 20,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  resendText: {
    fontSize: 14,
    color: colors.gray[500],
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  resendLinkDisabled: {
    opacity: 0.5,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    fontSize: 14,
    color: colors.gray[500],
  },
});
