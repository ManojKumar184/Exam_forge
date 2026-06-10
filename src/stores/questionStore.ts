import { create } from 'zustand';
import {
  fetchQuestionsApi,
  approveQuestionApi,
  rejectQuestionApi,
  deleteQuestionApi,
  updateQuestionApi,
  createQuestionApi,
  bulkApproveQuestionsApi,
  bulkRejectQuestionsApi,
  bulkDeleteQuestionsApi,
  bulkUpdateQuestionsMetadataApi,
} from '../api/questions';
import { getApiErrorMessage } from '../api/client';
import type { Question } from '../types';

interface QuestionState {
  questions: Question[];
  isLoading: boolean;
  error: string | null;
  fetchQuestions: (filters?: Record<string, any>) => Promise<void>;
  createQuestion: (question: Partial<Question>) => Promise<{ data: Question | null; error: any }>;
  updateQuestion: (id: string, updates: Partial<Question>) => Promise<{ error: any }>;
  deleteQuestion: (id: string) => Promise<{ error: any }>;
  approveQuestion: (id: string) => Promise<{ error: any }>;
  rejectQuestion: (id: string, notes: string) => Promise<{ error: any }>;
  bulkApproveQuestions: (ids: string[]) => Promise<{ error: any }>;
  bulkRejectQuestions: (ids: string[], notes?: string) => Promise<{ error: any }>;
  bulkDeleteQuestions: (ids: string[]) => Promise<{ error: any }>;
  bulkUpdateQuestionsMetadata: (ids: string[], updates: Partial<Question>) => Promise<{ error: any }>;
  clearError: () => void;
}

export const useQuestionStore = create<QuestionState>((set, get) => ({
  questions: [],
  isLoading: false,
  error: null,

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

  bulkApproveQuestions: async (ids) => {
    try {
      await bulkApproveQuestionsApi(ids);
      set({
        questions: get().questions.map((q) =>
          ids.includes(q.id) ? { ...q, status: 'approved' as const } : q
        ),
      });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  bulkRejectQuestions: async (ids, notes) => {
    try {
      await bulkRejectQuestionsApi(ids, notes);
      set({
        questions: get().questions.map((q) =>
          ids.includes(q.id)
            ? { ...q, status: 'rejected' as const, review_notes: notes ?? null }
            : q
        ),
      });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  bulkDeleteQuestions: async (ids) => {
    try {
      await bulkDeleteQuestionsApi(ids);
      set({ questions: get().questions.filter((q) => !ids.includes(q.id)) });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  bulkUpdateQuestionsMetadata: async (ids, updates) => {
    try {
      await bulkUpdateQuestionsMetadataApi(ids, updates);
      set({
        questions: get().questions.map((q) =>
          ids.includes(q.id) ? { ...q, ...updates } : q
        ),
      });
      return { error: null };
    } catch (error) {
      return { error: { message: getApiErrorMessage(error) } };
    }
  },

  clearError: () => set({ error: null }),
}));
