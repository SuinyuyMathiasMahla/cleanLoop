import React from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/colors';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  fullScreen?: boolean;
  message?: string;
}

export function LoadingSpinner({
  size = 'large',
  fullScreen = false,
  message,
}: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <ActivityIndicator size={size} color={colors.primary} />
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <ActivityIndicator size={size} color={colors.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  inline: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  message: {
    marginTop: 12,
    fontSize: 14,
    color: colors.gray[500],
  },
});
