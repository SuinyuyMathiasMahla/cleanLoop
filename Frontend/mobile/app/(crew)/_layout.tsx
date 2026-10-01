import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { colors } from '@/theme/colors';
import { useNotificationStore } from '@/store/notificationStore';
import { CrewHeader } from '@/components/crew/CrewHeader';

export default function CrewLayout() {
  const { unreadCount, fetchNotifications } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') fetchNotifications();
    }, 30000);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchNotifications();
    });
    return () => {
      clearInterval(poll);
      appState.remove();
    };
  }, [fetchNotifications]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2bd18b',
        tabBarInactiveTintColor: '#a6b4ae',
        tabBarStyle: {
          backgroundColor: '#0f1f1a',
          borderTopColor: 'rgba(255,255,255,0.12)',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="tabs/index"
        options={{
          title: 'Home',
          headerShown: true,
          header: () => <CrewHeader />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tabs/tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkbox-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tabs/notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#e5484d', color: colors.white, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="tabs/report"
        options={{
          title: 'Report',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tabs/profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="task/[id]" options={{ href: null }} />
    </Tabs>
  );
}