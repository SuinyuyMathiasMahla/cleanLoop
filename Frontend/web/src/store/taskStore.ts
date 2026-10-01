import { create } from 'zustand';
import { tasksApi } from '../services/api';

export type TaskStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  taskId: string;
  title: string;
  description?: string;
  reportIds: string[];
  crewLeadId: string;
  crewLeadName?: string;
  crewMemberIds: string[];
  scheduledAt: string;
  dueAt: string;
  notes?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  reportIds: string[];
  crewLeadId: string;
  crewMemberIds: string[];
  scheduledAt: string;
  dueAt: string;
  notes?: string;
}

interface TaskState {
  tasks: Task[];
  total: number;
  isLoading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (data: CreateTaskInput) => Promise<void>;
  updateTask: (id: string, data: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  total: 0,
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await tasksApi.list();
      set({
        tasks: res.data.tasks || res.data.items || [],
        total: res.data.total || 0,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch tasks',
        isLoading: false,
      });
    }
  },

  createTask: async (data: CreateTaskInput) => {
    set({ error: null });
    try {
      const res = await tasksApi.create(data);
      const newTask = res.data.task || res.data;
      set((state) => ({
        tasks: [newTask, ...state.tasks],
        total: state.total + 1,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create task';
      set({ error: msg });
      throw new Error(msg);
    }
  },

  updateTask: async (id: string, data: Partial<Task>) => {
    try {
      await tasksApi.update(id, data as Record<string, unknown>);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.taskId === id ? { ...t, ...data } : t)),
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update task';
      set({ error: msg });
      throw new Error(msg);
    }
  },

  deleteTask: async (id: string) => {
    try {
      await tasksApi.delete(id);
      set((state) => ({
        tasks: state.tasks.filter((t) => t.taskId !== id),
        total: state.total - 1,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete task';
      set({ error: msg });
      throw new Error(msg);
    }
  },

  clearError: () => set({ error: null }),
}));
