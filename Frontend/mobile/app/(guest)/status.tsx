import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { reportsApi, getApiErrorMessage } from '@/services/api';
import { colors } from '@/theme/colors';

interface StatusResult {
  status: string;
  updatedAt: string;
}

export default function StatusScreen() {
  const [reportId, setReportId] = useState('');
  const [result, setResult] = useState<StatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [idError, setIdError] = useState('');

  async function handleCheck() {
    setIdError('');
    setError('');
    setResult(null);

    if (!reportId.trim()) {
      setIdError('Please enter your report ID');
      return;
    }

    setLoading(true);
    try {
      const response = await reportsApi.checkStatus(reportId.trim());
      setResult(response.data);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      if (msg.includes('not found') || msg.includes('404')) {
        setError('No report found with this ID. Please check and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
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
            <Ionicons name="search" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Check Report Status</Text>
          <Text style={styles.subtitle}>
            Enter the report ID you received when you submitted your report.
          </Text>

          <Input
            label="Report ID"
            value={reportId}
            onChangeText={setReportId}
            placeholder="e.g. RPT-2024-XXXXX"
            error={idError}
            autoCapitalize="characters"
            onSubmitEditing={handleCheck}
            returnKeyType="search"
          />

          <Button
            title="Check Status"
            onPress={handleCheck}
            loading={loading}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {result && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Ionicons name="document-text" size={22} color={colors.primary} />
                <Text style={styles.resultTitle}>Report ID: {reportId.trim()}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Status</Text>
                <StatusBadge status={result.status} />
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Last Updated</Text>
                <Text style={styles.resultValue}>
                  {new Date(result.updatedAt).toLocaleString()}
                </Text>
              </View>
              <View style={styles.statusMessage}>
                <Text style={styles.statusMessageText}>
                  {result.status === 'pending' &&
                    'Your report has been received and is awaiting assignment to a crew.'}
                  {result.status === 'assigned' &&
                    'A crew has been assigned to address your report.'}
                  {result.status === 'in_progress' &&
                    'The crew is currently working on your report.'}
                  {result.status === 'resolved' &&
                    'Your report has been resolved. Thank you for helping keep the city clean!'}
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.tryAgainRow}
            onPress={() => {
              setResult(null);
              setReportId('');
              setError('');
            }}
          >
            {result && <Text style={styles.tryAgainText}>Check another report</Text>}
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
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 16,
    alignSelf: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.gray[900],
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
  resultCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 18,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray[900],
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[500],
  },
  resultValue: {
    fontSize: 13,
    color: colors.gray[700],
  },
  statusMessage: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  statusMessageText: {
    fontSize: 13,
    color: colors.primaryDark,
    lineHeight: 18,
  },
  tryAgainRow: {
    alignItems: 'center',
    marginTop: 16,
  },
  tryAgainText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
});
