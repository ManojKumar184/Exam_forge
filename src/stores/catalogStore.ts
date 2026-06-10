import { create } from 'zustand';
import { fetchChaptersApi, fetchExamTypesApi, fetchSubjectsApi } from '../api/catalog';
import { getApiErrorMessage } from '../api/client';
import type { Subject, Chapter, ExamType } from '../types';

interface CatalogState {
  subjects: Subject[];
  chapters: Chapter[];
  examTypes: ExamType[];
  error: string | null;
  fetchSubjects: () => Promise<void>;
  fetchChapters: (subjectId?: string) => Promise<void>;
  fetchExamTypes: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  subjects: [],
  chapters: [],
  examTypes: [],
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
}));
