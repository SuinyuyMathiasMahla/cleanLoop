import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';

const GREEN = '#1a7a5e';
const DEEP_GREEN = '#14604a';

export function CrewHeader() {
  const router = useRouter();
  const { user } = useAuthStore();
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const initials = (user?.name ?? 'Crew').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="leaf" size={17} color="#fff" />
        </View>
        <Text style={styles.name}>CleanLoop</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => router.push('/(crew)/tabs/notifications')}
          accessibilityLabel="Open notifications"
        >
          <Ionicons name="notifications-outline" size={21} color="#fff" />
          {unreadCount > 0 && <View style={styles.unreadDot} />}
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: GREEN,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  name: { color: '#fff', fontSize: 17, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffdf70',
    borderWidth: 1,
    borderColor: GREEN,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DEEP_GREEN,
  },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
