import { create } from 'zustand';
import { fetchChaptersApi, fetchExamTypesApi, fetchSubjectsApi } from '../api/catalog';
import {
  fetchQuestionsApi,
  approveQuestionApi,
  rejectQuestionApi,
  deleteQuestionApi,
  updateQuestionApi,
  createQuestionApi,
} from '../api/questions';
import { fetchPapersApi, createPaperApi, updatePaperApi, deletePaperApi } from '../api/papers';
import { fetchTestsApi, createTestApi, updateTestApi, fetchTestAttemptsApi } from '../api/tests';
import { fetchAdminAnalyticsApi } from '../api/analytics';
import { getApiErrorMessage } from '../api/client';
import type {
  Subject,
  Chapter,
  ExamType,
  Question,
  Paper,
  OnlineTest,
  TestAttempt,
  Profile,
  AnalyticsData,
} from '../types';

interface DataState {
  subjects: Subject[];
  chapters: Chapter[];
  examTypes: ExamType[];
  questions: Question[];
  papers: Paper[];
  onlineTests: OnlineTest[];
  testAttempts: TestAttempt[];
  users: Profile[];
  isLoading: boolean;
  error: string | null;
  fetchSubjects: () => Promise<void>;
  fetchChapters: (subjectId?: string) => Promise<void>;
  fetchExamTypes: () => Promise<void>;
  fetchQuestions: (filters?: Record<string, any>) => Promise<void>;
  fetchPapers: () => Promise<void>;
  fetchOnlineTests: () => Promise<void>;
  fetchTestAttempts: (testId?: string) => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchAnalytics: () => Promise<AnalyticsData>;
  createQuestion: (question: Partial<Question>) => Promise<{ data: Question | null; error: any }>;
  updateQuestion: (id: string, updates: Partial<Question>) => Promise<{ error: any }>;
  deleteQuestion: (id: string) => Promise<{ error: any }>;
  approveQuestion: (id: string) => Promise<{ error: any }>;
  rejectQuestion: (id: string, notes: string) => Promise<{ error: any }>;
  createPaper: (paper: Partial<Paper>) => Promise<{ data: Paper | null; error: any }>;
  updatePaper: (id: string, updates: Partial<Paper>) => Promise<{ error: any }>;
  deletePaper: (id: string) => Promise<{ error: any }>;
  createOnlineTest: (test: Partial<OnlineTest>) => Promise<{ data: OnlineTest | null; error: any }>;
  updateOnlineTest: (id: string, updates: Partial<OnlineTest>) => Promise<{ error: any }>;
  clearError: () => void;
}

export const useDataStore = create<DataState>((set, get) => ({
  subjects: [],
  chapters: [],
  examTypes: [],
  questions: [],
  papers: [],
  onlineTests: [],
  testAttempts: [],
  users: [],
  isLoading: false,
  error: null,

  fetchSubjects: async () => {
    try {
      const subjects = await fetchSubjectsApi();
      set({ subjects });
    } catch (error) {
      set({ error: getApiErrorMessage(error) });
    }
  },

  fetchChapters: async (subjectId) => {
    try {
      const chapters = await fetchChaptersApi(subjectId);
      set({ chapters });
    } catch (error) {
      set({ error: getApiErrorMessage(error) });
    }
  },

  fetchExamTypes: async () => {
    try {
      const examTypes = await fetchExamTypesApi();
      set({ examTypes });
    } catch (error) {
      set({ error: getApiErrorMessage(error) });
    }
  },

  fetchQuestions: async (filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const result = await fetchQuestionsApi({
        ...filters,
        class: filters.class ? Number(filters.class) : undefined,
        limit: Number(filters.limit || 100),
        page: Number(filters.page || 1),
      });
      set({ questions: result.items || [], isLoading: false });
    } catch (error: unknown) {
      set({ error: getApiErrorMessage(error), isLoading: false });
    }
  },

  fetchPapers: async () => {
    set({ isLoading: true });
    try {
      const papers = await fetchPapersApi();
      set({ papers, isLoading: false });
    } catch (error) {
      set({ error: getApiErrorMessage(error), isLoading: false });
    }
  },

  fetchOnlineTests: async () => {
    try {
      const onlineTests = await fetchTestsApi();
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

  fetchUsers: async () => {
    // user listing endpoint can be added in Phase 4 admin module
    set({ users: [] });
  },

  fetchAnalytics: async () => {
    return fetchAdminAnalyticsApi();
  },

  createQuestion: async (question) => {
    try {
      const data = await createQuestionApi(question);
      set({ questions: [data, ...get().questions] });
      return { data, error: null };
    } catch (error) {
      return { data: null, error: { message: getApiErrorMessage(error) } };
    }
  },

  updateQuestion: async (id, updates) => {
    try {
      const data = await updateQuestionApi(id, updates);
      set({ questions: get().questions.map((q) => (q.id === id ? data : q)) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  deleteQuestion: async (id) => {
    try {
      await deleteQuestionApi(id);
      set({ questions: get().questions.filter((q) => q.id !== id) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  approveQuestion: async (id) => {
    try {
      const data = await approveQuestionApi(id);
      set({ questions: get().questions.map((q) => (q.id === id ? data : q)) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  rejectQuestion: async (id, notes) => {
    try {
      const data = await rejectQuestionApi(id, notes);
      set({ questions: get().questions.map((q) => (q.id === id ? data : q)) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  createPaper: async (paper) => {
    try {
      const data = await createPaperApi(paper);
      set({ papers: [data, ...get().papers] });
      return { data, error: null };
    } catch (error) {
      return { data: null, error: { message: getApiErrorMessage(error) } };
    }
  },

  updatePaper: async (id, updates) => {
    try {
      const data = await updatePaperApi(id, updates);
      set({ papers: get().papers.map((p) => (p.id === id ? data : p)) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  deletePaper: async (id) => {
    try {
      await deletePaperApi(id);
      set({ papers: get().papers.filter((p) => p.id !== id) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
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

  clearError: () => set({ error: null }),
}));
