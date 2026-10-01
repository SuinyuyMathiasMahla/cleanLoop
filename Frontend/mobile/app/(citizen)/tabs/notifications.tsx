import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationItem } from '@/components/citizen/NotificationItem';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useNotificationStore } from '@/store/notificationStore';
import { colors } from '@/theme/colors';

export default function NotificationsScreen() {
  const { notifications, unreadCount, isLoading, fetchNotifications, markRead, markAllRead } =
    useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, []);

  const onRefresh = useCallback(() => {
    fetchNotifications();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Mark all read button */}
      {unreadCount > 0 && (
        <View style={styles.actionBar}>
          <Text style={styles.unreadText}>{unreadCount} unread</Text>
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading && notifications.length === 0 ? (
        <LoadingSpinner fullScreen message="Loading notifications..." />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem
              notification={item}
              onPress={() => markRead(item.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="No notifications"
              subtitle="You'll be notified here when your reports are updated."
            />
          }
          contentContainerStyle={notifications.length === 0 ? styles.emptyList : undefined}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  unreadText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[500],
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyList: {
    flex: 1,
  },
});
