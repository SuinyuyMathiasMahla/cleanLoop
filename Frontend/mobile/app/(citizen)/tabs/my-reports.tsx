import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReportCard } from '@/components/citizen/ReportCard';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useReportStore } from '@/store/reportStore';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/colors';
import { useLocalSearchParams, useRouter } from 'expo-router';

type FilterTab = 'all' | 'pending' | 'assigned' | 'in_progress' | 'resolved';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'pending',     label: 'Pending' },
  { key: 'assigned',    label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved',    label: 'Resolved' },
];

export default function MyReportsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { status } = useLocalSearchParams<{ status?: string }>();
  const { publicReports, publicNextKey, myReports, isLoading, fetchPublicReports, loadMorePublicReports, fetchMyReports } = useReportStore();
  const initialTab = FILTER_TABS.some(tab => tab.key === status) ? status as FilterTab : 'all';
  const [activeTab, setActiveTab] = useState<FilterTab>(initialTab);

  const isSignedIn = !!user;
  const reports = isSignedIn ? publicReports : myReports;

  useEffect(() => {
    if (isSignedIn) {
      fetchPublicReports(activeTab === 'all' ? undefined : activeTab);
    } else {
      fetchMyReports();
    }
  }, [isSignedIn, activeTab]);

  const onRefresh = useCallback(() => {
    if (isSignedIn) {
      fetchPublicReports(activeTab === 'all' ? undefined : activeTab);
    } else {
      fetchMyReports();
    }
  }, [isSignedIn, activeTab]);

  const filtered =
    activeTab === 'all' ? reports : reports.filter((r) => r.status === activeTab);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {isSignedIn ? 'All Community Reports' : 'My Reports'}
        </Text>
      </View>

      <View style={styles.tabsWrapper}>
        <FlatList
          data={FILTER_TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.tabs}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.tab, activeTab === item.key && styles.tabActive]}
              onPress={() => setActiveTab(item.key)}
            >
              <Text style={[styles.tabText, activeTab === item.key && styles.tabTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {isLoading && reports.length === 0 ? (
        <LoadingSpinner fullScreen message="Loading reports..." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => item.reportId ?? String(index)}
          renderItem={({ item }) => <ReportCard report={item} />}
          contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty]}
          ListEmptyComponent={
            <EmptyState
              icon="document-outline"
              title={activeTab === 'all' ? 'No reports yet' : `No ${activeTab.replace('_', ' ')} reports`}
              subtitle={
                activeTab === 'all'
                  ? isSignedIn
                    ? 'No reports in your community yet.'
                    : "You haven't submitted any reports yet."
                  : 'No reports with this status.'
              }
              actionLabel={activeTab === 'all' ? 'Report an Issue' : undefined}
              onAction={activeTab === 'all' ? () => router.push('/(citizen)/tabs/report') : undefined}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={() => { if (isSignedIn && publicNextKey) loadMorePublicReports(); }}
          onEndReachedThreshold={0.6}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  sectionHeader: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
    backgroundColor: colors.white,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.gray[900] },
  tabsWrapper: {
    backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  tabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  tab: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, backgroundColor: colors.gray[100],
  },
  tabActive:     { backgroundColor: colors.primary },
  tabText:       { fontSize: 13, fontWeight: '600', color: colors.gray[500] },
  tabTextActive: { color: colors.white },
  list:      { paddingTop: 14, paddingBottom: 32 },
  listEmpty: { flex: 1 },
});