import { create } from 'zustand';
import { fetchPapersApi, createPaperApi, updatePaperApi, deletePaperApi } from '../api/papers';
import { getApiErrorMessage } from '../api/client';
import type { Paper } from '../types';

interface PaperState {
  papers: Paper[];
  isLoading: boolean;
  error: string | null;
  fetchPapers: (filters?: Record<string, any>) => Promise<void>;
  createPaper: (paper: Partial<Paper>) => Promise<{ data: Paper | null; error: any }>;
  updatePaper: (id: string, updates: Partial<Paper>) => Promise<{ error: any }>;
  deletePaper: (id: string) => Promise<{ error: any }>;
}

export const usePaperStore = create<PaperState>((set, get) => ({
  papers: [],
  isLoading: false,
  error: null,

  fetchPapers: async (filters = {}) => {
    set({ isLoading: true });
    try {
      const papers = await fetchPapersApi(filters);
      set({ papers, isLoading: false });
    } catch (error) {
      set({ error: getApiErrorMessage(error), isLoading: false });
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
}));
