import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { Task } from '../../services/api';
import { colors } from '../../theme/colors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TaskCardProps {
  task: Task;
  isAssigned?: boolean;
  onMarkInProgress?: (id: string) => void;
  onMarkComplete?: (id: string) => void;
  isUpdating?: boolean;
}

export function TaskCard({
  task,
  isAssigned = false,
  onMarkInProgress,
  onMarkComplete,
  isUpdating = false,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(isAssigned);

  function toggleExpand() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  }

  const scheduledDate = new Date(task.scheduledAt);
  const dateStr = scheduledDate.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const timeStr = scheduledDate.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <TouchableOpacity
      style={[styles.card, isAssigned && styles.assignedCard]}
      onPress={toggleExpand}
      activeOpacity={0.85}
    >
      {isAssigned && <View style={styles.accentBar} />}

      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {isAssigned && (
              <View style={styles.assignedBadge}>
                <Text style={styles.assignedBadgeText}>My Task</Text>
              </View>
            )}
            <Text style={[styles.title, isAssigned && styles.assignedTitle]} numberOfLines={2}>
              {task.title}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.gray[500]}
          />
        </View>

        <View style={styles.metaRow}>
          <MetaChip icon="calendar-outline" text={dateStr} />
          <MetaChip icon="time-outline" text={timeStr} />
          <MetaChip icon="document-text-outline" text={`${task.reportIds.length} rep.`} />
          <MetaChip icon="people-outline" text={`${task.crewIds.length} crew`} />
        </View>

        <StatusBadge status={task.status} />

        {expanded && (
          <View style={styles.expanded}>
            {task.addresses.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Locations</Text>
                {task.addresses.map((addr, i) => (
                  <View key={i} style={styles.addressRow}>
                    <Ionicons name="location-outline" size={14} color={colors.primary} />
                    <Text style={styles.addressText}>{addr}</Text>
                  </View>
                ))}
              </View>
            )}

            {task.notes && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.notesText}>{task.notes}</Text>
              </View>
            )}

            {isAssigned && task.status !== 'completed' && (
              <View style={styles.actions}>
                {task.status === 'pending' && onMarkInProgress && (
                  <Button
                    title="Mark In Progress"
                    onPress={() => onMarkInProgress(task.taskId)}
                    variant="secondary"
                    loading={isUpdating}
                    style={styles.actionBtn}
                  />
                )}
                {task.status === 'in_progress' && onMarkComplete && (
                  <Button
                    title="Mark Complete"
                    onPress={() => onMarkComplete(task.taskId)}
                    variant="primary"
                    loading={isUpdating}
                    style={styles.actionBtn}
                  />
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function MetaChip({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={metaStyles.chip}>
      <Ionicons name={icon as any} size={12} color={colors.gray[500]} />
      <Text style={metaStyles.text}>{text}</Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.gray[50],
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  text: { fontSize: 11, fontWeight: '500', color: colors.gray[500] },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  assignedCard: {
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  accentBar: {
    width: 4,
    backgroundColor: colors.primary,
  },
  inner: { flex: 1, padding: 14 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  headerLeft: { flex: 1, marginRight: 8 },
  assignedBadge: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  assignedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: { fontSize: 15, fontWeight: '600', color: colors.gray[900], lineHeight: 20 },
  assignedTitle: { color: colors.primaryDark },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  expanded: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    paddingTop: 12,
  },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  addressText: { fontSize: 13, color: colors.gray[700], flex: 1, lineHeight: 18 },
  notesText: { fontSize: 13, color: colors.gray[700], lineHeight: 18 },
  actions: { marginTop: 4, gap: 8 },
  actionBtn: { marginBottom: 0 },
});