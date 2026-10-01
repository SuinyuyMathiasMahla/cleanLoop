import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Status = 'pending' | 'assigned' | 'in_progress' | 'resolved';

const STATUS_CONFIG: Record<Status, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: '#fef3c7', color: '#92400e' },
  assigned: { label: 'Assigned', bg: '#dbeafe', color: '#1e40af' },
  in_progress: { label: 'In Progress', bg: '#fce7f3', color: '#9d174d' },
  resolved: { label: 'Resolved', bg: '#dcfce7', color: '#166534' },
};

interface StatusBadgeProps {
  status: Status | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status as Status] ?? {
    label: status,
    bg: '#f3f4f6',
    color: '#374151',
  };

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
