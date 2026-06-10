import { create } from 'zustand';
import { fetchTestsApi, createTestApi, updateTestApi, fetchTestAttemptsApi, deleteTestApi } from '../api/tests';
import { fetchAdminAnalyticsApi } from '../api/analytics';
import { getApiErrorMessage } from '../api/client';
import type { OnlineTest, TestAttempt, AnalyticsData } from '../types';

interface TestState {
  onlineTests: OnlineTest[];
  testAttempts: TestAttempt[];
  isLoading: boolean;
  error: string | null;
  fetchOnlineTests: (filters?: Record<string, any>) => Promise<void>;
  fetchTestAttempts: (testId?: string) => Promise<void>;
  createOnlineTest: (test: Partial<OnlineTest>) => Promise<{ data: OnlineTest | null; error: any }>;
  updateOnlineTest: (id: string, updates: Partial<OnlineTest>) => Promise<{ error: any }>;
  deleteOnlineTest: (id: string) => Promise<{ error: any }>;
  fetchAnalytics: () => Promise<AnalyticsData>;
}

export const useTestStore = create<TestState>((set, get) => ({
  onlineTests: [],
  testAttempts: [],
  isLoading: false,
  error: null,

  fetchOnlineTests: async (filters = {}) => {
    try {
      const onlineTests = await fetchTestsApi(filters);
      set({ onlineTests });
    } catch (error) {
      set({ error: getApiErrorMessage(error) });
    }
  },

  fetchTestAttempts: async (testId) => {
    try {
      const data = await fetchTestAttemptsApi(testId);
      set({ testAttempts: data || [] });
    } catch (error) {
      set({ error: getApiErrorMessage(error) });
    }
  },

  createOnlineTest: async (test) => {
    try {
      const data = await createTestApi(test);
      set({ onlineTests: [data, ...get().onlineTests] });
      return { data, error: null };
    } catch (error) {
      return { data: null, error: { message: getApiErrorMessage(error) } };
    }
  },

  updateOnlineTest: async (id, updates) => {
    try {
      const data = await updateTestApi(id, updates);
      set({ onlineTests: get().onlineTests.map((t) => (t.id === id ? data : t)) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  deleteOnlineTest: async (id) => {
    try {
      await deleteTestApi(id);
      set({ onlineTests: get().onlineTests.filter((t) => t.id !== id) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  fetchAnalytics: async () => {
    return fetchAdminAnalyticsApi();
  },
}));
