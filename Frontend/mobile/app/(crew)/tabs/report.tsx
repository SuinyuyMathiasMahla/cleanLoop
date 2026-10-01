import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { tasksApi } from '@/services/api';

export default function ReportTab() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    try {
      const { data } = await tasksApi.getAll();
      const assignedTasks = data.tasks ?? [];
      const completedWithPhotos = await Promise.all(assignedTasks.map(async (task: any) => {
        if (task.status !== 'completed' || !task.evidencePhotoKeys?.length) return task;
        const { data: evidence } = await tasksApi.getEvidencePhotos(task.taskId);
        return { ...task, evidencePhotos: evidence.photos.map(photo => photo.url) };
      }));
      setTasks(completedWithPhotos);
    } catch {
      Alert.alert('Could not load work record', 'Pull to refresh and try again.');
    } finally {
      setLoading(false);
    }
  }

  const monthlyCompleted = tasks.filter(task =>
    task.status === 'completed' && new Date(task.completedAt ?? task.updatedAt) >= monthStart,
  );
  const monthlyAssigned = tasks.filter(task => new Date(task.scheduledAt) >= monthStart);
  const onTimeCompleted = monthlyCompleted.filter(task => task.dueAt && new Date(task.completedAt ?? task.updatedAt) <= new Date(task.dueAt));
  const onTimeRate = monthlyCompleted.length ? Math.round(onTimeCompleted.length / monthlyCompleted.length * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Monthly work record</Text>
        <Text style={styles.headerSub}>{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statValue}>{monthlyCompleted.length}</Text><Text style={styles.statLabel}>COMPLETED</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{monthlyAssigned.length}</Text><Text style={styles.statLabel}>ASSIGNED</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{onTimeRate}%</Text><Text style={styles.statLabel}>ON TIME</Text></View>
        </View>
        <View style={styles.listHeader}>
          <Text style={styles.sectionLabel}>COMPLETED TASKS</Text>
          <TouchableOpacity onPress={loadTasks} accessibilityLabel="Refresh work record"><Ionicons name="refresh" size={19} color={colors.primary} /></TouchableOpacity>
        </View>
        {loading ? <Text style={styles.emptyText}>Loading monthly record...</Text> : monthlyCompleted.length === 0 ? (
          <Text style={styles.emptyText}>Completed tasks this month will appear here.</Text>
        ) : monthlyCompleted.map(task => (
          <View style={styles.taskCard} key={task.taskId}>
            <View style={styles.taskTop}>
              <View style={styles.taskIcon}><Ionicons name="checkmark" size={18} color="#16804a" /></View>
              <View style={styles.taskCopy}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskDate}>{new Date(task.completedAt ?? task.updatedAt).toLocaleDateString()}</Text>
              </View>
            </View>
            {!!task.evidencePhotos?.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
              {task.evidencePhotos.map((uri: string, index: number) => <Image key={`${task.taskId}-${index}`} source={{ uri }} style={styles.evidencePhoto} />)}
            </ScrollView>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.gray[500], letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },
  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  issueChip: { width: '47%', backgroundColor: colors.white, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: colors.gray[100], shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  issueChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  issueChipText: { fontSize: 13, fontWeight: '600', color: colors.gray[700], flex: 1 },
  issueChipTextActive: { color: colors.primary },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 12, borderWidth: 1.5, borderColor: colors.gray[100], marginBottom: 20, paddingHorizontal: 12 },
  textAreaWrap: { alignItems: 'flex-start', paddingVertical: 12 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 14, color: colors.gray[900], paddingVertical: 14 },
  textArea: { paddingVertical: 0, minHeight: 90 },
  photosRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  photoPlaceholder: { width: 90, height: 90, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  photoAdd: { width: 90, height: 90, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoAddText: { fontSize: 10, fontWeight: '600', color: colors.primary },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  successTitle: { fontSize: 24, fontWeight: '800', color: colors.gray[900], letterSpacing: -0.3 },
  successSub: { fontSize: 14, color: colors.gray[500], textAlign: 'center', lineHeight: 20 },
  newReportBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  newReportBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  statsRow: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 8, paddingVertical: 16, marginBottom: 22 },
  stat: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.gray[100] },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.gray[900] },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.gray[500], marginTop: 4 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  emptyText: { textAlign: 'center', color: colors.gray[500], paddingVertical: 28 },
  taskCard: { backgroundColor: colors.white, borderRadius: 8, padding: 14, marginBottom: 10 },
  taskTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  taskCopy: { flex: 1 },
  taskTitle: { color: colors.gray[900], fontSize: 14, fontWeight: '700' },
  taskDate: { color: colors.gray[500], fontSize: 12, marginTop: 3 },
  photoStrip: { marginTop: 12 },
  evidencePhoto: { width: 112, height: 92, borderRadius: 6, marginRight: 8, backgroundColor: colors.gray[100] },
});