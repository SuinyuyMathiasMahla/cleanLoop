import { create } from 'zustand';
import { notificationsApi, Notification, getApiErrorMessage } from '../services/api';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearError: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchNotifications: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await notificationsApi.getAll();

      // Lambda returns { data: [...], notifications: [...] } — check all shapes
      const notifications: Notification[] =
        response.data?.data ??
        response.data?.notifications ??
        response.data?.items ??
        [];

      const unreadCount = notifications.filter((n) => !n.read).length;
      set({ notifications, unreadCount, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: getApiErrorMessage(err) });
    }
  },

  markRead: async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      set((state) => {
        const notifications = state.notifications.map((n) =>
          n.id === id || n.notificationId === id ? { ...n, read: true } : n
        );
        return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
      });
    } catch (err) {
      set({ error: getApiErrorMessage(err) });
    }
  },

  markAllRead: async () => {
    try {
      await notificationsApi.markAllRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (err) {
      set({ error: getApiErrorMessage(err) });
    }
  },
}));