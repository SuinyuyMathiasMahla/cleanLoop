import { create } from 'zustand';
import { crewApi } from '../services/api';

export interface CrewMember {
  crewId: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  locationLat?: number | null;
  locationLng?: number | null;
  activeTasks: number;
  lastLogin?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface CreateCrewInput {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  locationLat?: number;
  locationLng?: number;
  temporaryPassword: string;
}

interface CrewState {
  crew: CrewMember[];
  total: number;
  isLoading: boolean;
  error: string | null;
  fetchCrew: () => Promise<void>;
  createCrew: (data: CreateCrewInput) => Promise<void>;
  updateLocation: (id: string, location: string, locationLat?: number, locationLng?: number) => Promise<void>;
  deactivateCrew: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useCrewStore = create<CrewState>((set) => ({
  crew: [],
  total: 0,
  isLoading: false,
  error: null,

  fetchCrew: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await crewApi.list();
      set({
        crew: res.data.crew || res.data.items || [],
        total: res.data.total || 0,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch crew',
        isLoading: false,
      });
    }
  },

  createCrew: async (data: CreateCrewInput) => {
    set({ error: null });
    try {
      const res = await crewApi.create(data);
      const newMember = res.data.crew || res.data;
      set((state) => ({
        crew: [newMember, ...state.crew],
        total: state.total + 1,
      }));
    } catch (err) {
      const responseData = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      const msg = responseData?.error ?? responseData?.message ?? (err instanceof Error ? err.message : 'Failed to create crew member');
      set({ error: msg });
      throw new Error(msg);
    }
  },

  updateLocation: async (id: string, location: string, locationLat?: number, locationLng?: number) => {
    try {
      const res = await crewApi.updateLocation(id, location, locationLat, locationLng);
      set((state) => ({
        crew: state.crew.map((member) => member.crewId === id
          ? { ...member, location: res.data.location, locationLat: res.data.locationLat, locationLng: res.data.locationLng }
          : member),
      }));
    } catch (err) {
      const responseData = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      const msg = responseData?.error ?? responseData?.message ?? (err instanceof Error ? err.message : 'Failed to update crew location');
      set({ error: msg });
      throw new Error(msg);
    }
  },

  deactivateCrew: async (id: string) => {
    try {
      await crewApi.deactivate(id);
      set((state) => ({
        crew: state.crew.filter((c) => c.crewId !== id),
        total: state.total - 1,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to deactivate crew member';
      set({ error: msg });
      throw new Error(msg);
    }
  },

  clearError: () => set({ error: null }),
}));