import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { notificationsApi, Notification } from '@/services/api';
import { useNotificationStore } from '@/store/notificationStore';
import { colors } from '@/theme/colors';

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const loadNotifications = useCallback(async () => {
    try {
      setError(null);
      const response = await notificationsApi.getAll();
      const items = response.data.data ?? [];
      setNotifications(items);
      useNotificationStore.setState({
        notifications: items,
        unreadCount: items.filter(notification => !notification.read).length,
      });
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
        err?.message ??
        'Failed to load notifications',
      );
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      const store = useNotificationStore.getState();
      useNotificationStore.setState({
        notifications: store.notifications.map(notification => ({ ...notification, read: true })),
        unreadCount: 0,
      });
    } catch {
      Alert.alert('Error', 'Could not mark notifications as read');
    }
  };

  const handlePress = async (notif: Notification) => {
    const notifId = notif.notificationId ?? notif.id;
    if (!notif.read && notifId) {
      try {
        await notificationsApi.markRead(notifId);
        setNotifications(prev =>
          prev.map(n =>
            (n.notificationId ?? n.id) === notifId ? { ...n, read: true } : n,
          ),
        );
        const store = useNotificationStore.getState();
        const wasUnread = store.notifications.some(
          notification => (notification.notificationId ?? notification.id) === notifId && !notification.read,
        );
        useNotificationStore.setState({
          notifications: store.notifications.map(notification =>
            (notification.notificationId ?? notification.id) === notifId ? { ...notification, read: true } : notification,
          ),
          unreadCount: Math.max(0, store.unreadCount - (wasUnread ? 1 : 0)),
        });
      } catch {
        // silent — navigate anyway
      }
    }
    if (notif.taskId) {
      router.push(`/(crew)/task/${notif.taskId}` as any);
    }
  };

  const handleDelete = async (notif: Notification) => {
    const notifId = notif.notificationId ?? notif.id;
    if (!notifId) return;
    try {
      await notificationsApi.delete(notifId);
      setNotifications(prev =>
        prev.filter(n => (n.notificationId ?? n.id) !== notifId),
      );
      const store = useNotificationStore.getState();
      const wasUnread = store.notifications.some(
        notification => (notification.notificationId ?? notification.id) === notifId && !notification.read,
      );
      useNotificationStore.setState({
        notifications: store.notifications.filter(notification => (notification.notificationId ?? notification.id) !== notifId),
        unreadCount: Math.max(0, store.unreadCount - (wasUnread ? 1 : 0)),
      });
    } catch {
      Alert.alert('Error', 'Could not delete notification');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.gray[300]} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadNotifications}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const grouped = groupByDate(notifications);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 ? (
            <Text style={styles.headerSub}>{unreadCount} unread</Text>
          ) : null}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyContainer : styles.listContainer
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.gray[300]} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyBody}>
              No notifications yet. We'll let you know when something needs your attention.
            </Text>
          </View>
        ) : (
          grouped.map(group => (
            <View key={group.label}>
              <Text style={styles.dateLabel}>{group.label}</Text>
              {group.items.map(notif => (
                <NotifCard
                  key={notif.notificationId ?? notif.id}
                  notif={notif}
                  onPress={() => handlePress(notif)}
                  onDelete={() => handleDelete(notif)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function NotifCard({
  notif,
  onPress,
  onDelete,
}: {
  notif: Notification;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, !notif.read ? styles.cardUnread : null]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.iconWrap, getIconBg(notif.type)]}>
        <Ionicons name={getIcon(notif.type)} size={20} color={getIconColor(notif.type)} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text
            style={[styles.cardTitle, !notif.read ? styles.cardTitleUnread : null]}
            numberOfLines={1}
          >
            {notif.title}
          </Text>
          <Text style={styles.cardTime}>{relativeTime(notif.createdAt)}</Text>
        </View>
        <Text style={styles.cardMsg} numberOfLines={2}>
          {notif.body}
        </Text>
        {notif.taskId ? (
          <View style={styles.taskLink}>
            <Ionicons name="arrow-forward-circle-outline" size={13} color={colors.primary} />
            <Text style={styles.taskLinkText}>View task</Text>
          </View>
        ) : null}
      </View>

      {!notif.read ? <View style={styles.unreadDot} /> : null}

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={onDelete}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <Ionicons name="close" size={16} color={colors.gray[500]} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getIcon(type: Notification['type']): any {
  switch (type) {
    case 'task_assigned':  return 'clipboard';
    case 'task_updated':   return 'pencil';
    case 'report_new':     return 'alert-circle';
    case 'task_overdue':   return 'time';
    default:               return 'megaphone';
  }
}

function getIconBg(type: Notification['type']) {
  switch (type) {
    case 'task_assigned':  return { backgroundColor: '#dcfce7' };
    case 'task_updated':   return { backgroundColor: '#dbeafe' };
    case 'report_new':     return { backgroundColor: '#fef3c7' };
    case 'task_overdue':   return { backgroundColor: '#fee2e2' };
    default:               return { backgroundColor: colors.gray[100] };
  }
}

function getIconColor(type: Notification['type']) {
  switch (type) {
    case 'task_assigned':  return '#16a34a';
    case 'task_updated':   return '#2563eb';
    case 'report_new':     return '#d97706';
    case 'task_overdue':   return '#dc2626';
    default:               return colors.gray[500];
  }
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function groupByDate(items: Notification[]) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups: Record<string, Notification[]> = {};

  items.forEach(n => {
    const d = new Date(n.createdAt).toDateString();
    const label =
      d === today
        ? 'Today'
        : d === yesterday
        ? 'Yesterday'
        : new Date(n.createdAt).toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
          });
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  });

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: colors.background },
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  headerTitle:       { fontSize: 22, fontWeight: '800', color: colors.gray[900] },
  headerSub:         { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 2 },
  markAllBtn:        { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.primaryLight, borderRadius: 8 },
  markAllText:       { fontSize: 12, fontWeight: '700', color: colors.primary },

  listContainer:     { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  emptyContainer:    { flex: 1 },

  dateLabel:         { fontSize: 11, fontWeight: '700', color: colors.gray[500], letterSpacing: 0.7, marginTop: 16, marginBottom: 8 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.white,
    borderRadius: 14, padding: 14, marginBottom: 8, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardUnread:        { borderLeftWidth: 3, borderLeftColor: colors.primary },
  iconWrap:          { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody:          { flex: 1 },
  cardTop:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle:         { fontSize: 14, fontWeight: '500', color: colors.gray[700], flex: 1, marginRight: 8 },
  cardTitleUnread:   { fontWeight: '700', color: colors.gray[900] },
  cardTime:          { fontSize: 11, color: colors.gray[500], flexShrink: 0 },
  cardMsg:           { fontSize: 13, color: colors.gray[500], lineHeight: 19 },
  taskLink:          { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  taskLinkText:      { fontSize: 12, fontWeight: '600', color: colors.primary },
  unreadDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 4, flexShrink: 0 },
  deleteBtn:         { padding: 2, flexShrink: 0 },

  emptyWrap:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 80 },
  emptyIcon:         { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:        { fontSize: 18, fontWeight: '700', color: colors.gray[700], marginBottom: 8 },
  emptyBody:         { fontSize: 14, color: colors.gray[500], textAlign: 'center', lineHeight: 21 },
  errorText:         { fontSize: 14, color: colors.gray[500], textAlign: 'center' },
  retryBtn:          { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 10 },
  retryText:         { fontSize: 14, fontWeight: '700', color: colors.white },
});