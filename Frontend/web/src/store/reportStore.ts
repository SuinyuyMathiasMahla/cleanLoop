import { create } from 'zustand';
import { reportsApi } from '../services/api';

export type ReportStatus = 'pending' | 'assigned' | 'in_progress' | 'resolved';
export type ReportType = 'overflow' | 'illegal_dumping' | 'damaged_bin' | 'missed_collection';

export interface Report {
  reportId: string;
  type: ReportType;
  address: string;
  description: string;
  status: ReportStatus;
  lat: number;
  lng: number;
  photoUrl?: string;
  submittedBy: string;
  submitterPhone?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  ward?: string;
}

export interface ReportFilters {
  status?: string;
  type?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

interface ReportState {
  reports: Report[];
  total: number;
  isLoading: boolean;
  error: string | null;
  filters: ReportFilters;
  selectedReport: Report | null;
  fetchReports: () => Promise<void>;
  fetchReport: (id: string) => Promise<void>;
  updateStatus: (id: string, status: ReportStatus) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  setFilters: (filters: Partial<ReportFilters>) => void;
  setSelectedReport: (report: Report | null) => void;
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],
  total: 0,
  isLoading: false,
  error: null,
  selectedReport: null,
  filters: { page: 1, limit: 20 },

  fetchReports: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters } = get();
      const params: Record<string, unknown> = {
        page: filters.page,
        limit: filters.limit,
      };
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      if (filters.search) params.search = filters.search;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const res = await reportsApi.list(params);
      set({
        reports: res.data.reports || res.data.items || [],
        total: res.data.total || 0,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch reports',
        isLoading: false,
      });
    }
  },

  fetchReport: async (id: string) => {
    try {
      const res = await reportsApi.get(id);
      set({ selectedReport: res.data });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch report' });
    }
  },

  updateStatus: async (id: string, status: ReportStatus) => {
    try {
      await reportsApi.updateStatus(id, status);
      set((state) => ({
        reports: state.reports.map((r) =>
          r.reportId === id ? { ...r, status } : r
        ),
        selectedReport: state.selectedReport?.reportId === id
          ? { ...state.selectedReport, status }
          : state.selectedReport,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update status' });
      throw err;
    }
  },

  deleteReport: async (id: string) => {
    try {
      await reportsApi.delete(id);
      set((state) => ({
        reports: state.reports.filter((report) => report.reportId !== id),
        total: Math.max(0, state.total - 1),
        selectedReport: state.selectedReport?.reportId === id ? null : state.selectedReport,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete report and image' });
      throw err;
    }
  },

  setFilters: (filters: Partial<ReportFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters, page: filters.page ?? 1 },
    }));
  },

  setSelectedReport: (report: Report | null) => set({ selectedReport: report }),
}));
