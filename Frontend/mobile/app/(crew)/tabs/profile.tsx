import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/common/Button';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/colors';

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function CrewProfile() {
  const { user, logout, isLoading } = useAuthStore();

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.headerBand}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="construct-outline" size={12} color={colors.primary} />
            <Text style={styles.roleText}>Crew Member</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.infoCard}>
            <InfoRow icon="mail-outline" label="Email" value={user.email} />
            <View style={styles.separator} />
            <InfoRow icon="shield-checkmark-outline" label="Role" value="Crew Member" />
            <View style={styles.separator} />
            <InfoRow icon="finger-print-outline" label="User ID" value={user.userId} mono />
          </View>

          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={16} color={colors.info} />
            <Text style={styles.noticeText}>
              Your account was created by an admin. Contact your supervisor for account changes.
            </Text>
          </View>

          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="danger"
            loading={isLoading}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: string;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={infoStyles.row}>
      <View style={infoStyles.iconBox}>
        <Ionicons name={icon as any} size={18} color={colors.primary} />
      </View>
      <View style={infoStyles.content}>
        <Text style={infoStyles.label}>{label}</Text>
        <Text
          style={[infoStyles.value, mono && infoStyles.mono]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: { flex: 1 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: { fontSize: 14, fontWeight: '500', color: colors.gray[900] },
  mono: { fontFamily: 'Courier', fontSize: 12, color: colors.gray[700] },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  headerBand: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 32,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: 14,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  roleText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  body: { paddingHorizontal: 16, paddingTop: 20 },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  separator: {
    height: 1,
    backgroundColor: colors.gray[100],
    marginHorizontal: 14,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 20,
  },
  noticeText: { flex: 1, fontSize: 13, color: colors.info, lineHeight: 18 },
});