import { create } from 'zustand';
import { fetchUsersApi, updateUserApi, deleteUserApi } from '../api/users';
import { getApiErrorMessage } from '../api/client';
import type { Profile } from '../types';

interface UserState {
  users: Profile[];
  isLoading: boolean;
  error: string | null;
  fetchUsers: (filters?: Record<string, unknown>) => Promise<void>;
  updateUser: (id: string, updates: Partial<Profile>) => Promise<{ error: unknown }>;
  deleteUser: (id: string) => Promise<{ error: unknown }>;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  isLoading: false,
  error: null,

  fetchUsers: async (filters = {}) => {
    set({ isLoading: true });
    try {
      const data = await fetchUsersApi(filters);
      set({ users: data.items, isLoading: false });
    } catch (error) {
      set({ error: getApiErrorMessage(error), users: [], isLoading: false });
    }
  },

  updateUser: async (id, updates) => {
    try {
      const data = await updateUserApi(id, updates);
      set({ users: get().users.map((u) => (u.id === id ? data : u)) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  deleteUser: async (id) => {
    try {
      await deleteUserApi(id);
      set({ users: get().users.filter((u) => u.id !== id) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },
}));
