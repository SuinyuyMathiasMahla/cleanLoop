import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { colors } from '@/theme/colors';

export function CitizenHeader() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { unreadCount } = useNotificationStore();

  const firstLetter = user?.name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        {/* Left: logo icon + app name */}
        <View style={styles.left}>
          <View style={styles.logoBox}>
            <Ionicons name="leaf" size={18} color={colors.white} />
          </View>
          <Text style={styles.appName}>CleanLoop</Text>
        </View>

        {/* Right: bell + green avatar */}
        <View style={styles.right}>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => router.push('/(citizen)/tabs/notifications')}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.gray[700]} />
            {unreadCount > 0 && <View style={styles.bellDot} />}
          </TouchableOpacity>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{firstLetter}</Text>
          </View>
        </View>
      </View>

      {/* Gray horizontal underline */}
      <View style={styles.underline} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.gray[900],
    letterSpacing: -0.3,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  underline: {
    height: 1,
    backgroundColor: colors.gray[200],
  },
});