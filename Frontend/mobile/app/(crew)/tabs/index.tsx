import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { tasksApi, getApiErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useReportStore } from '@/store/reportStore';
import { ReportCard } from '@/components/citizen/ReportCard';
import { colors } from '@/theme/colors';

// react-native-maps crashes on web — load only on native
let MapView: any = null;
let Marker: any = null;
let UrlTile: any = null;
if (Platform.OS !== 'web') {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  UrlTile = maps.UrlTile;
}

const STATUS_TABS = [
  { key: 'pending',     label: 'Pending' },
  { key: 'assigned',   label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved',   label: 'Completed' },   // ← fixed: was 'completed'
] as const;
type StatusKey = typeof STATUS_TABS[number]['key'];

export default function CrewHome() {
  const { user } = useAuthStore();
  const { allReports, fetchAllReports } = useReportStore();
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<StatusKey>('pending');
  const mapRef = useRef<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const response = await tasksApi.getAll();
      const loaded =
        (response.data as any).tasks ??
        (response.data as any).data ??
        (response.data as any).items ??
        [];
      setTasks(loaded);
      await fetchAllReports();
    } catch (err) {
      Alert.alert('Error', getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  const userId = user?.userId ?? '';
  const reports = allReports ?? [];

  const initials = (user?.name ?? 'C')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());

  const hour = now.getHours();
  const timeGreeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetingEmoji = hour < 12 ? '🌅' : hour < 17 ? '☀️' : '🌙';

  const myTasks = tasks.filter(t => {
    const crew: string[] = t.crewIds ?? t.crewMemberIds ?? [];
    return crew.includes(userId) || t.crewLeadId === userId;
  });

  const displayTasks = myTasks;

  const todayStr = now.toDateString();
  const todayTasks = myTasks.filter(
    t => new Date(t.scheduledAt).toDateString() === todayStr,
  );
  const thisWeekTasks = myTasks.filter(
    t => new Date(t.scheduledAt) >= weekStart,
  );
  const completedCount = myTasks.filter(t => t.status === 'completed').length;
  const onTimeRate =
    myTasks.length > 0
      ? Math.round((completedCount / myTasks.length) * 100)
      : 0;

  // Next task = earliest upcoming incomplete task from all assigned tasks
  const nextTask = displayTasks
    .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null;

  const nextTaskId = nextTask?.taskId ?? nextTask?.id;

  const activeAssignedTasks = myTasks.filter((task: any) => task.status !== 'completed' && task.status !== 'cancelled');
  const assignedReportIds = new Set(activeAssignedTasks.flatMap((task: any) => task.reportIds ?? []));
  const mapReports = reports.filter((report: any) =>
    assignedReportIds.has(report.reportId ?? report.id) &&
    report.status !== 'resolved' &&
    report.lat !== null && report.lat !== undefined && report.lng !== null && report.lng !== undefined &&
    Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lng)),
  );
  const mapCoord = mapReports.length > 0
    ? { latitude: Number(mapReports[0].lat), longitude: Number(mapReports[0].lng) }
    : null;
  const mapCoordinateKey = mapReports
    .map((report: any) => `${report.reportId ?? report.id}:${report.lat},${report.lng}`)
    .join('|');

  useEffect(() => {
    if (mapReports.length > 1) {
      mapRef.current?.fitToCoordinates(
        mapReports.map((report: any) => ({ latitude: Number(report.lat), longitude: Number(report.lng) })),
        { edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: true },
      );
    } else if (mapCoord) {
      mapRef.current?.animateToRegion({ ...mapCoord, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 350);
    }
  }, [mapCoordinateKey]);

  // Status tab counts
  const statusCounts = STATUS_TABS.reduce((acc, tab) => {
    acc[tab.key] = reports.filter((r: any) => r.status === tab.key).length;
    return acc;
  }, {} as Record<StatusKey, number>);

  const filteredReports = reports.filter((r: any) => r.status === selectedStatus);

  if (isLoading && tasks.length === 0 && reports.length === 0) {
    return <LoadingSpinner fullScreen message="Loading dashboard..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={loadData}
            tintColor={colors.white}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── Green header ── */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{timeGreeting} {greetingEmoji}</Text>
              <Text style={styles.name}>{user?.name ?? 'Crew Member'}</Text>
              {(user as any)?.zone ? (
                <Text style={styles.zone}>{(user as any).zone}</Text>
              ) : null}
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          <View style={styles.statsStrip}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{todayTasks.length}</Text>
              <Text style={styles.statLabel}>TODAY</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{thisWeekTasks.length}</Text>
              <Text style={styles.statLabel}>THIS WEEK</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{onTimeRate}%</Text>
              <Text style={styles.statLabel}>ON TIME</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {/* ── Assigned work area map ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ASSIGNED WORK AREAS</Text>
            <View style={styles.mapCard}>
              {MapView ? (
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    mapType="none"
                    initialRegion={{
                      latitude: mapCoord?.latitude ?? 4.1550,
                      longitude: mapCoord?.longitude ?? 9.2410,
                      latitudeDelta: mapReports.length > 1 ? 0.06 : 0.015,
                      longitudeDelta: mapReports.length > 1 ? 0.06 : 0.015,
                    }}
                    scrollEnabled
                    zoomEnabled
                    rotateEnabled={false}
                    pitchEnabled={false}
                  >
                    {UrlTile ? (
                      <UrlTile
                        urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maximumZ={19}
                        tileSize={256}
                      />
                    ) : null}
                    {mapReports.map((report: any) => (
                      <Marker
                        key={report.reportId ?? report.id}
                        coordinate={{ latitude: Number(report.lat), longitude: Number(report.lng) }}
                        title={report.address ?? 'Assigned report'}
                        description={report.description ?? ''}
                        pinColor={getMapMarkerColor(report.status)}
                      />
                    ))}
                  </MapView>
              ) : (
                  <View style={styles.mapNoLocation}>
                    <Ionicons name="location-outline" size={32} color={colors.gray[500]} />
                    <Text style={styles.mapNoLocationText}>
                      {Platform.OS === 'web' ? 'Map view on mobile only' : 'Location pending'}
                    </Text>
                    <Text style={styles.mapNoLocationSub}>
                      {Platform.OS === 'web'
                        ? 'Open the CleanLoop mobile app to see the satellite map'
                        : 'No GPS coordinates attached to this task yet'}
                    </Text>
                  </View>
              )}

              {/* Map source badge */}
              {MapView ? (
                <View style={styles.satelliteBadge}>
                  <Ionicons name="map-outline" size={10} color="#fff" />
                  <Text style={styles.satelliteBadgeText}>© OSM contributors</Text>
                </View>
              ) : null}

              <View style={styles.mapFooter}>
                <View style={styles.mapInfo}>
                  <Text style={styles.mapStreet} numberOfLines={1}>
                    {mapReports.length > 0 ? 'Assigned report locations' : 'No active report locations'}
                  </Text>
                  <View style={styles.mapMetaRow}>
                    <Ionicons name="navigate-circle-outline" size={12} color={colors.gray[500]} />
                    <Text style={styles.mapMeta}>
                      {mapReports.length > 0
                        ? `${mapReports.length} assigned location${mapReports.length !== 1 ? 's' : ''}${nextTask ? ` · Next scheduled ${new Date(nextTask.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}`
                        : 'Newly assigned report locations will appear here'}
                    </Text>
                  </View>
                </View>
                {nextTask ? (
                  <TouchableOpacity
                    style={styles.navigateBtn}
                    onPress={() => router.push(`/(crew)/task/${nextTaskId}` as any)}
                  >
                    <Ionicons name="navigate" size={14} color={colors.white} />
                    <Text style={styles.navigateBtnText}>Task Details</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          {/* ── RECENT REPORTS with status filter tabs ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>RECENT REPORTS</Text>
              <Text style={styles.sectionCount}>{reports.length} total</Text>
            </View>

            {/* Status filter tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroll}
              contentContainerStyle={styles.tabsContent}
            >
              {STATUS_TABS.map(tab => {
                const active = selectedStatus === tab.key;
                const count = statusCounts[tab.key];
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.tab, active && styles.tabActive]}
                    onPress={() => setSelectedStatus(tab.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                      {tab.label}
                    </Text>
                    {count > 0 ? (
                      <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                        <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>
                          {count}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Filtered report list */}
            {filteredReports.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="checkmark-circle-outline" size={40} color={colors.gray[300]} />
                <Text style={styles.emptyText}>
                  No {STATUS_TABS.find(t => t.key === selectedStatus)?.label.toLowerCase()} reports
                </Text>
                <Text style={styles.emptySubText}>
                  Reports with this status will appear here
                </Text>
              </View>
            ) : (
              <View style={styles.reportCards}>
                {filteredReports.map((report: any) => (
                  <ReportCard
                    key={report.reportId ?? report.id}
                    report={report}
                    style={styles.fullWidthReportCard}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatReportTitle(type: string) {
  const map: Record<string, string> = {
    illegal_dumping: 'Illegal dumping',
    bin_overflow: 'Bin overflow',
    missed_collection: 'Missed collection',
    hazardous_waste: 'Hazardous waste',
    damaged_bin: 'Damaged bin',
    collection: 'Collection',
    other: 'Other issue',
  };
  return map[type] ?? type?.replace(/_/g, ' ') ?? 'Report';
}

function getMapMarkerColor(status: string): string {
  const colorsByStatus: Record<string, string> = {
    pending: '#ef4444',
    assigned: '#3b82f6',
    in_progress: '#f97316',
    resolved: '#22c55e',
  };
  return colorsByStatus[status] ?? '#6b7280';
}

function getShortAddress(addr: string) {
  if (!addr) return 'Unknown location';
  return addr.split(',')[0];
}

function formatTime(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function getReportIcon(type: string): any {
  if (type === 'illegal_dumping') return 'trash';
  if (type === 'bin_overflow') return 'trash-outline';
  if (type === 'hazardous_waste') return 'warning';
  if (type === 'missed_collection') return 'time-outline';
  if (type === 'damaged_bin') return 'construct-outline';
  if (type === 'collection') return 'checkbox';
  return 'alert-circle-outline';
}

function getReportIconBg(status: string, type: string) {
  if (status === 'resolved') return { backgroundColor: '#dcfce7' };
  if (type === 'illegal_dumping' || type === 'hazardous_waste') return { backgroundColor: '#fee2e2' };
  if (status === 'in_progress') return { backgroundColor: colors.primaryLight };
  return { backgroundColor: colors.gray[100] };
}

function getReportIconColor(status: string, type: string) {
  if (status === 'resolved') return '#16a34a';
  if (type === 'illegal_dumping' || type === 'hazardous_waste') return '#dc2626';
  if (status === 'in_progress') return colors.primary;
  return colors.gray[500];
}

function getReportBadgeBg(status: string) {
  if (status === 'resolved') return { backgroundColor: '#dcfce7' };
  if (status === 'in_progress') return { backgroundColor: colors.primaryLight };
  if (status === 'urgent' || status === 'open') return { backgroundColor: '#fee2e2' };
  if (status === 'pending') return { backgroundColor: '#fef3c7' };
  if (status === 'assigned') return { backgroundColor: '#e0f2fe' };
  return { backgroundColor: colors.gray[100] };
}

function getReportBadgeColor(status: string) {
  if (status === 'resolved') return { color: '#16a34a' };
  if (status === 'in_progress') return { color: colors.primary };
  if (status === 'urgent' || status === 'open') return { color: '#dc2626' };
  if (status === 'pending') return { color: '#d97706' };
  if (status === 'assigned') return { color: '#0284c7' };
  return { color: colors.gray[500] };
}

function getReportStatusLabel(status: string) {
  const map: Record<string, string> = {
    resolved: 'Done', in_progress: 'In Progress',
    pending: 'Pending', urgent: 'Urgent', open: 'Urgent', assigned: 'Assigned',
  };
  return map[status] ?? status;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.72)', fontWeight: '500' },
  name: { fontSize: 24, fontWeight: '800', color: '#ffffff', marginTop: 2, letterSpacing: -0.3 },
  zone: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#ffffff' },

  statsStrip: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  statValue: { fontSize: 28, fontWeight: '800', color: '#ffffff' },
  statLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.8, marginTop: 2 },

  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 },
  section: { marginBottom: 24 },
  reportCards: { marginHorizontal: -16 },
  fullWidthReportCard: { marginHorizontal: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.gray[500], letterSpacing: 0.8, marginBottom: 10 },
  sectionCount: { fontSize: 11, fontWeight: '600', color: colors.primary },

  // Status filter tabs
  tabsScroll: { marginBottom: 12 },
  tabsContent: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabLabel: { fontSize: 13, fontWeight: '600', color: colors.gray[700] },
  tabLabelActive: { color: '#ffffff' },
  tabBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.gray[100],
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: colors.gray[700] },
  tabBadgeTextActive: { color: '#ffffff' },

  mapCard: {
    backgroundColor: colors.white, borderRadius: 2, overflow: 'hidden',
    marginHorizontal: -14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  map: { height: 170, width: '100%' },

  satelliteBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  satelliteBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.6 },

  mapNoLocation: {
    height: 170, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f1f5f9', gap: 6,
  },
  mapNoLocationText: { fontSize: 14, fontWeight: '600', color: colors.gray[700] },
  mapNoLocationSub: { fontSize: 12, color: colors.gray[500], textAlign: 'center', paddingHorizontal: 32 },

  mapFooter: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  mapInfo: { flex: 1 },
  mapStreet: { fontSize: 15, fontWeight: '700', color: colors.gray[900], marginBottom: 4 },
  mapMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mapMeta: { fontSize: 12, color: colors.gray[500] },
  navigateBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  navigateBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },

  reportCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    borderRadius: 12, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1, gap: 12,
  },
  reportIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reportContent: { flex: 1 },
  reportTitle: { fontSize: 14, fontWeight: '600', color: colors.gray[900], marginBottom: 3 },
  reportMeta: { fontSize: 12, color: colors.gray[500] },
  reportBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  reportBadgeText: { fontSize: 11, fontWeight: '700' },

  emptyCard: { alignItems: 'center', paddingVertical: 36, backgroundColor: colors.white, borderRadius: 14, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: colors.gray[700] },
  emptySubText: { fontSize: 12, color: colors.gray[500], textAlign: 'center', paddingHorizontal: 24 },
});