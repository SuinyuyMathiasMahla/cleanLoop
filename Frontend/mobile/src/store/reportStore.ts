import { create } from 'zustand';
import { reportsApi, uploadToS3 } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

interface Report {
  reportId?: string;
  id?: string;
  type: string;
  status: string;
  address?: string;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
  assignedTaskId?: string;
  [key: string]: any;
}

interface ReportStore {
  publicReports: Report[];
  publicNextKey: string | null;
  publicStatus: string | undefined;
  myReports: Report[];
  allReports: Report[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;

  fetchPublicReports: (status?: string, append?: boolean) => Promise<void>;
  loadMorePublicReports: () => Promise<void>;
  fetchMyReports: () => Promise<void>;
  fetchAllReports: (status?: string) => Promise<void>;
  submitReport: (data: any) => Promise<void>;
  submitGuestReport: (data: any) => Promise<string>;
  clearError: () => void;
}

export const useReportStore = create<ReportStore>((set, get) => ({
  publicReports: [],
  publicNextKey: null,
  publicStatus: undefined,
  myReports: [],
  allReports: [],
  isLoading: false,
  isSubmitting: false,
  error: null,

  fetchPublicReports: async (status, append = false) => {
    set({ isLoading: true, error: null });
    try {
      const selectedStatus = append ? get().publicStatus : status;
      const response = await reportsApi.getPublic(
        50,
        append ? get().publicNextKey ?? undefined : undefined,
        selectedStatus,
        !!useAuthStore.getState().user,
      );
      set((state) => ({
        publicReports: append ? [...state.publicReports, ...(response.data.reports ?? [])] : response.data.reports ?? [],
        publicNextKey: response.data.nextKey ?? null,
        publicStatus: selectedStatus,
      }));
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to fetch reports' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadMorePublicReports: async () => {
    const { publicNextKey, publicStatus, isLoading } = get();
    if (publicNextKey && !isLoading) await get().fetchPublicReports(publicStatus, true);
  },

  fetchMyReports: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await reportsApi.getMine();         // ← was getMy()
      set({ myReports: response.data.reports ?? [] });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to fetch reports' });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchAllReports: async (status?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await reportsApi.getAll(status);
      set({ allReports: response.data.reports ?? [] });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to fetch reports' });
    } finally {
      set({ isLoading: false });
    }
  },

  submitReport: async (data: any) => {
    set({ isSubmitting: true, error: null });
    try {
      let photoKey: string | undefined;
      if (data.photo) {
        const filename = data.photo.split('/').pop() || 'report.jpg';
        const contentType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        const { data: upload } = await reportsApi.getPresignedUpload(contentType, filename);
        await uploadToS3(upload.url, data.photo, contentType);
        photoKey = upload.key;
      }
      await reportsApi.submit({                            // ← was create()
        type: data.type,
        lat: data.latitude,                               // ← map field names
        lng: data.longitude,
        address: data.address,
        description: data.description,
        photoKey,
      });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to submit report' });
      throw err;
    } finally {
      set({ isSubmitting: false });
    }
  },

  submitGuestReport: async (data: any) => {
    set({ isSubmitting: true, error: null });
    try {
      let photoKey: string | undefined;
      if (data.photo) {
        const filename = data.photo.split('/').pop() || 'report.jpg';
        const contentType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        const { data: upload } = await reportsApi.getPresignedUpload(contentType, filename);
        await uploadToS3(upload.url, data.photo, contentType);
        photoKey = upload.key;
      }
      const response = await reportsApi.submitGuest({     // ← was createGuest()
        type: data.type,
        lat: data.latitude,
        lng: data.longitude,
        address: data.address,
        description: data.description,
        photoKey,
        guestName: data.guestName,
        guestPhone: data.guestPhone,
      });
      return response.data.report.reportId;
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to submit report' });
      throw err;
    } finally {
      set({ isSubmitting: false });
    }
  },

  clearError: () => set({ error: null }),
}));