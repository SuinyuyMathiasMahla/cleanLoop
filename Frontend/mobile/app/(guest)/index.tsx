import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useReportStore } from '@/store/reportStore';
import { ReportCard } from '@/components/citizen/ReportCard';

const HERO_GREEN = '#1a7a5e';
const HERO_DARK  = '#14604a';
const CARD_BG    = '#1e2d27';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending:     { label: 'Pending',     color: '#92400e', bg: '#fef3c7' },
    in_progress: { label: 'In Progress', color: '#1e40af', bg: '#dbeafe' },
    assigned:    { label: 'Assigned',    color: '#1e40af', bg: '#dbeafe' },
    resolved:    { label: 'Resolved',    color: '#065f46', bg: '#d1fae5' },
  };
  const s = map[status] ?? map.pending;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function GuestLanding() {
  const router = useRouter();
  const { publicReports, fetchPublicReports, isLoading } = useReportStore();

  useEffect(() => { fetchPublicReports(); }, []);
  const onRefresh = useCallback(() => { fetchPublicReports(); }, []);
  const completedReports = publicReports.filter((report) => report.status === 'resolved');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── TOP NAV ── */}
      <View style={styles.nav}>
        <View style={styles.navLeft}>
          <View style={styles.navLogoCircle}>
            <Ionicons name="leaf" size={16} color="#fff" />
          </View>
          <Text style={styles.navName}>CleanLoop</Text>
        </View>
        <View style={styles.navRight}>
          <TouchableOpacity style={styles.loginBtn} onPress={() => router.navigate('/auth/login')}>
            <Text style={styles.loginBtnText}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.signupBtn} onPress={() => router.navigate('/auth/register')}>
            <Text style={styles.signupBtnText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#fff" />}
      >

        {/* ── HERO with background image ── */}
        <ImageBackground
          source={require('../../assets/images/recycling-hero.png')}
          style={styles.heroCard}
          imageStyle={styles.heroBgImage}
          resizeMode="cover"
        >
          <View style={styles.heroOverlay}>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadge}>
                <Ionicons name="location" size={11} color="#fff" />
                <Text style={styles.heroBadgeText}>GPS Enabled</Text>
              </View>
              <View style={styles.heroBadge}>
                <Ionicons name="time-outline" size={11} color="#fff" />
                <Text style={styles.heroBadgeText}>Avg 24h Cleanup</Text>
              </View>
            </View>
            <Text style={styles.heroHeadline}>
              Report waste.{'\n'}Keep your city{'\n'}clean.
            </Text>
            <Text style={styles.heroSub}>
              Join thousands making communities cleaner.
            </Text>
          </View>
        </ImageBackground>

        {/* ── BODY ── */}
        <View style={styles.body}>

          {/* Report Waste Card */}
          <View style={styles.actionCardWrap}>
            <View style={styles.actionCard}>
              <View style={styles.actionCardTop}>
                <View>
                  <View style={styles.liveRow}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                  <Text style={styles.actionCardTitle}>Report Waste Now</Text>
                </View>
                <View style={styles.cameraChip}>
                  <Ionicons name="camera-outline" size={13} color={HERO_GREEN} />
                  <Text style={styles.cameraChipText}>Camera</Text>
                </View>
              </View>
              <Text style={styles.actionCardSub}>
                Snap a photo, tag your location, and our crews will handle the rest.
              </Text>
              <TouchableOpacity
                style={styles.greenBtn}
                onPress={() => router.push('/(guest)/report')}
                activeOpacity={0.85}
              >
                <Ionicons name="camera" size={16} color="#fff" />
                <Text style={styles.greenBtnText}>Report Waste Now</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Community Feed */}
          <Text style={styles.sectionTitle}>Community Feed</Text>
          <Text style={styles.sectionSub}>Completed cleanups from your area</Text>

          {isLoading && completedReports.length === 0 ? (
            <ActivityIndicator color={HERO_GREEN} style={{ marginVertical: 20 }} />
          ) : completedReports.length === 0 ? (
            <View style={styles.emptyFeed}>
              <Ionicons name="leaf-outline" size={32} color="#bbb" />
              <Text style={styles.emptyFeedText}>No completed cleanups yet.</Text>
            </View>
          ) : (
            <View style={styles.communityCards}>
              {completedReports.slice(0, 3).map((report) => (
                <ReportCard key={report.reportId} report={report} style={styles.communityReportCard} />
              ))}
            </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: HERO_GREEN },
  scroll: { flexGrow: 1, paddingBottom: 40 },

  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    backgroundColor: HERO_GREEN,
  },
  navLeft:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLogoCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  navName:      { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  navRight:     { flexDirection: 'row', gap: 8 },
  loginBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#fff',
  },
  loginBtnText:  { fontSize: 13, fontWeight: '700', color: HERO_GREEN },
  signupBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: HERO_DARK,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },
  signupBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  heroCard:    { minHeight: 220 },
  heroBgImage: { opacity: 0.75 },
  heroOverlay: {
    backgroundColor: 'rgba(15, 50, 35, 0.55)',
    paddingHorizontal: 22, paddingTop: 8, paddingBottom: 30,
  },
  heroBadgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  heroBadgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  heroHeadline: {
    fontSize: 34, fontWeight: '900', color: '#fff',
    lineHeight: 40, letterSpacing: -0.8, marginBottom: 10,
  },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.72)', lineHeight: 20 },

  body: {
    backgroundColor: '#f2f6f4',
    paddingHorizontal: 18, paddingTop: 24,
  },
  communityCards: { marginHorizontal: -14 },
  communityReportCard: { marginHorizontal: 0 },

  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 4, padding: 18, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  actionCardWrap: { marginHorizontal: -14 },
  actionCardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8,
  },
  liveRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  liveDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  liveText: { fontSize: 10, fontWeight: '800', color: '#22c55e', letterSpacing: 0.8 },
  cameraChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e8f5f0', borderRadius: 12,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  cameraChipText:  { fontSize: 11, fontWeight: '600', color: HERO_GREEN },
  actionCardTitle: { fontSize: 17, fontWeight: '800', color: '#0f1f1a' },
  actionCardSub:   { fontSize: 13, color: '#6b7c76', lineHeight: 18, marginBottom: 14 },
  greenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: HERO_GREEN, borderRadius: 12, paddingVertical: 14,
  },
  greenBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#0f1f1a', marginBottom: 2 },
  sectionSub:   { fontSize: 12, color: '#6b7c76', marginBottom: 14 },
  feedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  feedIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#e8f5f0',
    alignItems: 'center', justifyContent: 'center',
  },
  feedTitle:    { fontSize: 13, fontWeight: '700', color: '#0f1f1a', marginBottom: 4 },
  feedMeta:     { flexDirection: 'row', alignItems: 'center' },
  feedLocation: { fontSize: 11, color: '#6b7c76', marginLeft: 2 },
  feedTime:     { fontSize: 11, color: '#aaa' },
  badge:        { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:    { fontSize: 10, fontWeight: '700' },
  emptyFeed:     { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyFeedText: { fontSize: 14, color: '#aaa' },
});