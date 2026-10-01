import axios from 'axios';
import { adminRefresh } from './cognito';

const BASE_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Request interceptor: attach Bearer token
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('cl_id_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 with refresh
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = sessionStorage.getItem('cl_refresh_token');
      if (!refreshToken) {
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const tokens = await adminRefresh(refreshToken);
        sessionStorage.setItem('cl_id_token', tokens.IdToken);
        sessionStorage.setItem('cl_access_token', tokens.AccessToken);
        if (tokens.RefreshToken) {
          sessionStorage.setItem('cl_refresh_token', tokens.RefreshToken);
        }
        processQueue(null, tokens.IdToken);
        originalRequest.headers.Authorization = `Bearer ${tokens.IdToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

function clearAuth() {
  sessionStorage.removeItem('cl_id_token');
  sessionStorage.removeItem('cl_access_token');
  sessionStorage.removeItem('cl_refresh_token');
}

// API methods
export const reportsApi = {
  list: (params?: Record<string, unknown>) => api.get('/reports', { params }),
  get: (id: string) => api.get(`/reports/${id}`),
  updateStatus: (id: string, status: string) => api.patch(`/reports/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/reports/${id}`),
};

export const tasksApi = {
  list: (params?: Record<string, unknown>) => api.get('/tasks', { params }),
  create: (data: object) => api.post('/tasks', data),
  update: (id: string, data: object) => api.patch(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

export const crewApi = {
  list: (params?: Record<string, unknown>) => api.get('/crew', { params }),
  create: (data: object) => api.post('/crew', data),
  updateLocation: (id: string, location: string, locationLat?: number, locationLng?: number) =>
    api.patch(`/crew/${id}`, { location, locationLat, locationLng }),
  deactivate: (id: string) => api.delete(`/crew/${id}`),
};

export const notificationsApi = {
  list: (params?: Record<string, unknown>) => api.get('/notifications', { params }),
  send: (data: Record<string, unknown>) => api.post('/notifications/send', data),
};

export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
};
