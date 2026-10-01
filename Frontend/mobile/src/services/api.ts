import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { refreshTokens } from './cognito';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

const isWeb = Platform.OS === 'web';

async function storageGet(key: string): Promise<string | null> {
  if (isWeb) return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function storageSet(key: string, value: string): Promise<void> {
  if (isWeb) { localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

async function storageDelete(key: string): Promise<void> {
  if (isWeb) { localStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Never add auth headers to S3 presigned URL requests —
    // presigned URLs use query-string signing; an Authorization header
    // causes S3 to reject the request with a SigV4 parse error.
    const url = config.url ?? '';
    const isS3 = url.startsWith('https://') && url.includes('.amazonaws.com');
    if (!isS3) {
      const idToken = await storageGet('idToken');
      if (idToken) config.headers.Authorization = `Bearer ${idToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

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

      try {
        const storedRefreshToken = await storageGet('refreshToken');
        if (!storedRefreshToken) throw new Error('No refresh token available');

        const tokens = await refreshTokens(storedRefreshToken);
        await storageSet('idToken', tokens.idToken);
        await storageSet('accessToken', tokens.accessToken);
        if (tokens.refreshToken) await storageSet('refreshToken', tokens.refreshToken);

        processQueue(null, tokens.idToken);
        originalRequest.headers.Authorization = `Bearer ${tokens.idToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await storageDelete('idToken');
        await storageDelete('accessToken');
        await storageDelete('refreshToken');
        await storageDelete('user');
        return Promise.reject(new AuthExpiredError());
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export class AuthExpiredError extends Error {
  constructor() {
    super('Session expired. Please sign in again.');
    this.name = 'AuthExpiredError';
  }
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof AuthExpiredError) return error.message;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    if (error.response?.status === 404) return 'Resource not found.';
    if (error.response?.status === 403) return 'You do not have permission to do this.';
    if (error.response?.status === 422) return 'Invalid data submitted.';
    if (error.response?.status === 500) return 'Server error. Please try again later.';
    if (error.code === 'ECONNABORTED') return 'Request timed out. Check your connection.';
    if (error.code === 'ERR_NETWORK') return 'No internet connection.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

/**
 * Upload a local file directly to an S3 presigned PUT URL.
 * Uses XMLHttpRequest — React Native's XHR handles local file:// and
 * content:// URIs natively, streaming bytes directly without loading
 * the file into JS memory. No Authorization header is sent — S3
 * presigned URLs are self-authenticating via query-string signature.
 */
export async function uploadToS3(
  presignedUrl: string,
  localUri: string,
  contentType: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('S3 upload network error'));
    xhr.ontimeout = () => reject(new Error('S3 upload timed out'));

    // React Native XHR accepts a local URI object directly as the body —
    // it reads and streams the file natively without fetch/FileReader.
    xhr.send({ uri: localUri, type: contentType, name: 'upload' } as any);
  });
}

// ---------- Reports ----------

export interface ReportPayload {
  type: 'overflow_bin' | 'illegal_dumping';
  lat: number;
  lng: number;
  address?: string;
  description?: string;
  photoKey?: string;
  guestName?: string;
  guestPhone?: string;
}

export interface Report {
  reportId: string;
  type: 'overflow' | 'dumping';
  address: string;
  lat: number;
  lng: number;
  ward?: string;
  description?: string;
  photoKey?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved';
  createdAt: string;
  updatedAt: string;
  submittedBy?: string;
  assignedTaskId?: string;
  submitterName?: string;
  photoUrl?: string;
  evidencePhotoUrls?: string[];
  completedAt?: string | null;
  likeCount?: number;
  likedByMe?: boolean;
  comments?: { commentId: string; userId: string; name: string; text: string; createdAt: string }[];
}

export const reportsApi = {
  submitGuest: (payload: ReportPayload) =>
    api.post<{ report: Report }>('/reports/guest', payload),

  submit: (payload: ReportPayload) =>
    api.post<{ report: Report }>('/reports', payload),

  getPublic: (limit = 50, lastKey?: string, status?: string, authenticated = false) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (lastKey) params.set('lastKey', lastKey);
    if (status) params.set('status', status);
    const path = authenticated ? '/reports/public/authenticated' : '/reports/public';
    return api.get<{ reports: Report[]; nextKey?: string | null }>(`${path}?${params}`);
  },

  getMine: (page = 1, limit = 20) =>
    api.get<{ reports: Report[] }>(`/reports/mine?limit=${limit}`),

  getById: (id: string) =>
    api.get<{ report: Report }>(`/reports/${id}`),

  getAll: (status?: string, limit = 500) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set('status', status);
    return api.get<{ reports: Report[] }>(`/reports?${params}`);
  },

  checkStatus: (id: string) =>
    api.get<{ status: string; updatedAt: string }>(`/reports/${id}/status`),

  getPresignedUpload: (contentType = 'image/jpeg', filename = 'photo.jpg') =>
    api.get<{ url: string; key: string }>(
      `/reports/presigned-upload?contentType=${encodeURIComponent(contentType)}&filename=${encodeURIComponent(filename)}`
    ),
  toggleLike: (id: string) => api.post<{ reportId: string; liked: boolean; likeCount: number }>(`/reports/${id}/like`),
  addComment: (id: string, text: string) => api.post(`/reports/${id}/comments`, { text }),
};

// ---------- Tasks ----------

export interface Task {
  taskId: string;
  id?: string;
  title: string;
  description?: string;
  status: 'scheduled' | 'assigned' | 'pending' | 'in_progress' | 'completed' | 'cancelled';
  scheduledAt: string;
  dueAt?: string;
  reportIds: string[];
  crewIds: string[];
  crewLeadId?: string;
  addresses: string[];
  notes?: string;
  evidencePhotoKeys?: string[];
}

export const tasksApi = {
  getAll: () => api.get<{ tasks: Task[] }>('/tasks'),

  getById: (id: string) => api.get<{ task: Task }>(`/tasks/${id}`),

  updateStatus: (id: string, status: string, evidencePhotoKeys?: string[]) =>
    api.patch<{ taskId: string; status: string }>(`/tasks/${id}/status`, {
      status,
      ...(evidencePhotoKeys ? { evidencePhotoKeys } : {}),
    }),

  getEvidenceUploadUrl: (id: string, contentType = 'image/jpeg', filename = 'evidence.jpg') =>
    api.get<{ url: string; key: string }>(
      `/tasks/${id}/evidence-upload?contentType=${encodeURIComponent(contentType)}&filename=${encodeURIComponent(filename)}`
    ),

  getEvidencePhotos: (id: string) =>
    api.get<{ photos: { url: string; key: string }[] }>(`/tasks/${id}/evidence-photos`),

  deleteEvidencePhoto: (id: string, key: string) =>
    api.delete(`/tasks/${id}/evidence-photos`, { data: { key } }),
};

// ---------- Notifications ----------

export interface Notification {
  notificationId?: string;
  id: string;
  type: 'task_assigned' | 'task_updated' | 'report_new' | 'task_overdue' | 'general';
  title: string;
  body: string;
  read: boolean;
  reportId?: string;
  taskId?: string;
  createdAt: string;
}

export const notificationsApi = {
  getAll: () => api.get<{ data?: Notification[]; notifications?: Notification[]; items?: Notification[] }>('/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
};

// ---------- Profile ----------

export interface ProfileUpdatePayload {
  name?: string;
  phone?: string;
}

export const profileApi = {
  get: () =>
    api.get<{ userId: string; email: string; name: string; phone: string; role: string }>('/profile'),
  update: (payload: ProfileUpdatePayload) => api.patch('/profile', payload),
};