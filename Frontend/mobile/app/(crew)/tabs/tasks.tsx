import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { tasksApi, Task, getApiErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/colors';

type FilterTab = 'all' | 'pending' | 'in_progress' | 'completed';

export default function TasksList() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');

  useEffect(() => { loadTasks(); }, []);

  async function loadTasks() {
    setIsLoading(true);
    try {
      const response = await tasksApi.getAll();
      // Backend returns { tasks: [...] }
      const loaded = response.data.tasks ?? [];
      setTasks(loaded);
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  const userId = user?.userId ?? '';

  // Backend already scopes tasks to this user, but filter client-side as safety net
  const myTasks = tasks.filter(t => {
    const crew: string[] = t.crewIds ?? [];
    return crew.includes(userId) || t.crewLeadId === userId;
  });

  // Pending = assigned / scheduled / pending
  const pendingTasks = myTasks.filter(t =>
    t.status === 'pending' || t.status === 'assigned' || t.status === 'scheduled'
  );
  const inProgressTasks = myTasks.filter(t => t.status === 'in_progress');
  const completedTasks = myTasks.filter(t =>
    t.status === 'completed' || t.status === 'cancelled'
  );

  const filtered =
    filter === 'all' ? myTasks
    : filter === 'pending' ? pendingTasks
    : filter === 'in_progress' ? inProgressTasks
    : completedTasks;

  // in_progress floats to top, then sort by scheduledAt
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
    if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
  });

  if (isLoading && tasks.length === 0) {
    return <LoadingSpinner fullScreen message="Loading tasks..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Tasks</Text>
        <Text style={styles.headerSub}>{myTasks.length} total assigned</Text>
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Text style={styles.statNum}>{pendingTasks.length}</Text>
            <Text style={styles.statLbl}>Pending</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statNum}>{inProgressTasks.length}</Text>
            <Text style={styles.statLbl}>In Progress</Text>
          </View>
          <View style={styles.statChip}>
            <Text style={styles.statNum}>{completedTasks.length}</Text>
            <Text style={styles.statLbl}>Done</Text>
          </View>
        </View>
      </View>

      <View style={styles.filterBar}>
        {(['all', 'pending', 'in_progress', 'completed'] as FilterTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, filter === tab && styles.filterTabActive]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.filterTabText, filter === tab && styles.filterTabTextActive]}>
              {tab === 'all' ? 'All'
                : tab === 'in_progress' ? 'In Progress'
                : tab === 'pending' ? 'Pending'
                : 'Done'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={loadTasks}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}>
          {sorted.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.gray[300]} />
              <Text style={styles.emptyText}>
                No {filter === 'all' ? '' : filter.replace('_', ' ')} tasks
              </Text>
            </View>
          ) : (
            sorted.map(task => {
              const taskId = task.taskId ?? task.id ?? '';
              const isOverdue =
                new Date(task.scheduledAt) < new Date() &&
                task.status !== 'completed' &&
                task.status !== 'cancelled';

              return (
                <TouchableOpacity
                  key={taskId}
                  style={styles.taskCard}
                  onPress={() => router.push(`/(crew)/task/${taskId}` as any)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.taskIconWrap, getIconBg(task.status, isOverdue)]}>
                    <Ionicons
                      name={getIcon(task.status, isOverdue)}
                      size={20}
                      color={getIconColor(task.status, isOverdue)}
                    />
                  </View>
                  <View style={styles.taskBody}>
                    <View style={styles.taskTop}>
                      <Text style={styles.taskTitle} numberOfLines={1}>
                        {task.title ?? 'Unnamed task'}
                      </Text>
                      <View style={[styles.badge, getBadgeBg(task.status, isOverdue)]}>
                        <Text style={[styles.badgeText, getBadgeColor(task.status, isOverdue)]}>
                          {getLabel(task.status, isOverdue)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.taskMeta} numberOfLines={1}>
                      {task.addresses?.[0] ?? 'No location'}
                    </Text>
                    <View style={styles.taskFooter}>
                      <View style={[styles.metaChip, isOverdue && styles.metaChipOverdue]}>
                        <Ionicons
                          name="calendar-outline"
                          size={11}
                          color={isOverdue ? '#dc2626' : colors.gray[500]}
                        />
                        <Text style={[styles.metaChipText, isOverdue && styles.metaChipTextOverdue]}>
                          {new Date(task.scheduledAt).toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric',
                          })}
                          {isOverdue ? ' · Overdue' : ''}
                        </Text>
                      </View>
                      <View style={styles.metaChip}>
                        <Ionicons name="time-outline" size={11} color={colors.gray[500]} />
                        <Text style={styles.metaChipText}>
                          {new Date(task.scheduledAt).toLocaleTimeString(undefined, {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <View style={styles.metaChip}>
                        <Ionicons name="document-text-outline" size={11} color={colors.gray[500]} />
                        <Text style={styles.metaChipText}>
                          {(task.reportIds ?? []).length} rep.
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getIcon(status: string, isOverdue: boolean): any {
  if (isOverdue) return 'alert-circle';
  if (status === 'completed') return 'checkmark-circle';
  if (status === 'in_progress') return 'play-circle';
  if (status === 'assigned') return 'person-circle';
  if (status === 'cancelled') return 'close-circle';
  return 'time';
}
function getIconBg(s: string, isOverdue: boolean) {
  if (isOverdue) return { backgroundColor: '#fee2e2' };
  if (s === 'completed') return { backgroundColor: '#dcfce7' };
  if (s === 'in_progress') return { backgroundColor: colors.primaryLight };
  if (s === 'assigned') return { backgroundColor: '#dbeafe' };
  if (s === 'cancelled') return { backgroundColor: colors.gray[100] };
  return { backgroundColor: '#fef3c7' };
}
function getIconColor(s: string, isOverdue: boolean) {
  if (isOverdue) return '#dc2626';
  if (s === 'completed') return '#16a34a';
  if (s === 'in_progress') return colors.primary;
  if (s === 'assigned') return '#3b82f6';
  if (s === 'cancelled') return colors.gray[500];
  return '#d97706';
}
function getBadgeBg(s: string, isOverdue: boolean) {
  if (isOverdue) return { backgroundColor: '#fee2e2' };
  if (s === 'completed') return { backgroundColor: '#dcfce7' };
  if (s === 'in_progress') return { backgroundColor: colors.primaryLight };
  if (s === 'assigned') return { backgroundColor: '#dbeafe' };
  if (s === 'cancelled') return { backgroundColor: colors.gray[100] };
  return { backgroundColor: '#fef3c7' };
}
function getBadgeColor(s: string, isOverdue: boolean) {
  if (isOverdue) return { color: '#dc2626' };
  if (s === 'completed') return { color: '#16a34a' };
  if (s === 'in_progress') return { color: colors.primary };
  if (s === 'assigned') return { color: '#1d4ed8' };
  if (s === 'cancelled') return { color: colors.gray[500] };
  return { color: '#d97706' };
}
function getLabel(s: string, isOverdue: boolean) {
  if (isOverdue) return 'Overdue';
  const map: Record<string, string> = {
    completed: 'Done',
    in_progress: 'In Progress',
    pending: 'Pending',
    assigned: 'Assigned',
    scheduled: 'Scheduled',
    cancelled: 'Cancelled',
  };
  return map[s] ?? s;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statChip: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.white },
  statLbl: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  filterBar: {
    flexDirection: 'row', backgroundColor: colors.white,
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
    borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  filterTab: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  filterTabActive: { backgroundColor: colors.primaryLight },
  filterTabText: { fontSize: 11, fontWeight: '600', color: colors.gray[500] },
  filterTabTextActive: { color: colors.primary },
  scroll: { flex: 1 },
  taskCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  taskIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  taskBody: { flex: 1 },
  taskTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 3, gap: 8,
  },
  taskTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.gray[900] },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  taskMeta: { fontSize: 12, color: colors.gray[500], marginBottom: 6 },
  taskFooter: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.gray[50], borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.gray[100],
  },
  metaChipOverdue: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
  metaChipText: { fontSize: 10, fontWeight: '500', color: colors.gray[500] },
  metaChipTextOverdue: { color: '#dc2626', fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: colors.gray[500], textTransform: 'capitalize' },
});