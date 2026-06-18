import { create } from 'zustand';
import { useCatalogStore } from './catalogStore';
import { useQuestionStore } from './questionStore';
import { usePaperStore } from './paperStore';
import { useTestStore } from './testStore';
import { useUserStore } from './userStore';
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
  fetchPapers: (filters?: Record<string, any>) => Promise<void>;
  fetchOnlineTests: (filters?: Record<string, any>) => Promise<void>;
  fetchTestAttempts: (testId?: string) => Promise<void>;
  fetchUsers: (filters?: Record<string, unknown>) => Promise<void>;
  updateUser: (id: string, updates: Partial<Profile>) => Promise<{ error: unknown }>;
  deleteUser: (id: string) => Promise<{ error: unknown }>;
  fetchAnalytics: () => Promise<AnalyticsData>;
  createQuestion: (question: Partial<Question>) => Promise<{ data: Question | null; error: any }>;
  updateQuestion: (id: string, updates: Partial<Question>) => Promise<{ error: any }>;
  deleteQuestion: (id: string) => Promise<{ error: any }>;
  approveQuestion: (id: string) => Promise<{ error: any }>;
  rejectQuestion: (id: string, notes: string) => Promise<{ error: any }>;
  bulkApproveQuestions: (ids: string[]) => Promise<{ error: any }>;
  bulkRejectQuestions: (ids: string[], notes?: string) => Promise<{ error: any }>;
  bulkDeleteQuestions: (ids: string[]) => Promise<{ error: any }>;
  bulkUpdateQuestionsMetadata: (ids: string[], updates: Partial<Question>) => Promise<{ error: any }>;
  createPaper: (paper: Partial<Paper>) => Promise<{ data: Paper | null; error: any }>;
  updatePaper: (id: string, updates: Partial<Paper>) => Promise<{ error: any }>;
  deletePaper: (id: string) => Promise<{ error: any }>;
  createOnlineTest: (test: Partial<OnlineTest>) => Promise<{ data: OnlineTest | null; error: any }>;
  updateOnlineTest: (id: string, updates: Partial<OnlineTest>) => Promise<{ error: any }>;
  deleteOnlineTest: (id: string) => Promise<{ error: any }>;
  clearError: () => void;
}

/** Merge reactive state from all 5 domain stores into a single snapshot. */
function mergeState() {
  const catalog = useCatalogStore.getState();
  const question = useQuestionStore.getState();
  const paper = usePaperStore.getState();
  const test = useTestStore.getState();
  const user = useUserStore.getState();

  return {
    subjects: catalog.subjects,
    chapters: catalog.chapters,
    examTypes: catalog.examTypes,
    questions: question.questions,
    papers: paper.papers,
    onlineTests: test.onlineTests,
    testAttempts: test.testAttempts,
    users: user.users,
    isLoading: question.isLoading || paper.isLoading || user.isLoading || test.isLoading,
    error: catalog.error ?? question.error ?? paper.error ?? test.error ?? user.error ?? null,
  };
}

export const useDataStore = create<DataState>((_set) => ({
  ...mergeState(),

  // ── Catalog domain ──────────────────────────────────────────────
  fetchSubjects: async () => {
    await useCatalogStore.getState().fetchSubjects();
    useDataStore.setState(mergeState());
  },

  fetchChapters: async (subjectId) => {
    await useCatalogStore.getState().fetchChapters(subjectId);
    useDataStore.setState(mergeState());
  },

  fetchExamTypes: async () => {
    await useCatalogStore.getState().fetchExamTypes();
    useDataStore.setState(mergeState());
  },

  // ── Question domain ─────────────────────────────────────────────
  fetchQuestions: async (filters) => {
    await useQuestionStore.getState().fetchQuestions(filters);
    useDataStore.setState(mergeState());
  },

  createQuestion: async (question) => {
    const result = await useQuestionStore.getState().createQuestion(question);
    useDataStore.setState(mergeState());
    return result;
  },

  updateQuestion: async (id, updates) => {
    const result = await useQuestionStore.getState().updateQuestion(id, updates);
    useDataStore.setState(mergeState());
    return result;
  },

  deleteQuestion: async (id) => {
    const result = await useQuestionStore.getState().deleteQuestion(id);
    useDataStore.setState(mergeState());
    return result;
  },

  approveQuestion: async (id) => {
    const result = await useQuestionStore.getState().approveQuestion(id);
    useDataStore.setState(mergeState());
    return result;
  },

  rejectQuestion: async (id, notes) => {
    const result = await useQuestionStore.getState().rejectQuestion(id, notes);
    useDataStore.setState(mergeState());
    return result;
  },

  bulkApproveQuestions: async (ids) => {
    const result = await useQuestionStore.getState().bulkApproveQuestions(ids);
    useDataStore.setState(mergeState());
    return result;
  },

  bulkRejectQuestions: async (ids, notes) => {
    const result = await useQuestionStore.getState().bulkRejectQuestions(ids, notes);
    useDataStore.setState(mergeState());
    return result;
  },

  bulkDeleteQuestions: async (ids) => {
    const result = await useQuestionStore.getState().bulkDeleteQuestions(ids);
    useDataStore.setState(mergeState());
    return result;
  },

  bulkUpdateQuestionsMetadata: async (ids, updates) => {
    const result = await useQuestionStore.getState().bulkUpdateQuestionsMetadata(ids, updates);
    useDataStore.setState(mergeState());
    return result;
  },

  // ── Paper domain ────────────────────────────────────────────────
  fetchPapers: async (filters) => {
    await usePaperStore.getState().fetchPapers(filters);
    useDataStore.setState(mergeState());
  },

  createPaper: async (paper) => {
    const result = await usePaperStore.getState().createPaper(paper);
    useDataStore.setState(mergeState());
    return result;
  },

  updatePaper: async (id, updates) => {
    const result = await usePaperStore.getState().updatePaper(id, updates);
    useDataStore.setState(mergeState());
    return result;
  },

  deletePaper: async (id) => {
    const result = await usePaperStore.getState().deletePaper(id);
    useDataStore.setState(mergeState());
    return result;
  },

  // ── Test domain ─────────────────────────────────────────────────
  fetchOnlineTests: async (filters) => {
    await useTestStore.getState().fetchOnlineTests(filters);
    useDataStore.setState(mergeState());
  },

  fetchTestAttempts: async (testId) => {
    await useTestStore.getState().fetchTestAttempts(testId);
    useDataStore.setState(mergeState());
  },

  createOnlineTest: async (test) => {
    const result = await useTestStore.getState().createOnlineTest(test);
    useDataStore.setState(mergeState());
    return result;
  },

  updateOnlineTest: async (id, updates) => {
    const result = await useTestStore.getState().updateOnlineTest(id, updates);
    useDataStore.setState(mergeState());
    return result;
  },

  deleteOnlineTest: async (id) => {
    const result = await useTestStore.getState().deleteOnlineTest(id);
    useDataStore.setState(mergeState());
    return result;
  },

  fetchAnalytics: async () => {
    return useTestStore.getState().fetchAnalytics();
  },

  // ── User domain ─────────────────────────────────────────────────
  fetchUsers: async (filters) => {
    await useUserStore.getState().fetchUsers(filters);
    useDataStore.setState(mergeState());
  },

  updateUser: async (id, updates) => {
    const result = await useUserStore.getState().updateUser(id, updates);
    useDataStore.setState(mergeState());
    return result;
  },

  deleteUser: async (id) => {
    const result = await useUserStore.getState().deleteUser(id);
    useDataStore.setState(mergeState());
    return result;
  },

  // ── Shared utilities ────────────────────────────────────────────
  clearError: () => {
    useCatalogStore.setState({ error: null });
    useQuestionStore.setState({ error: null });
    usePaperStore.setState({ error: null });
    useTestStore.setState({ error: null });
    useUserStore.setState({ error: null });
    useDataStore.setState(mergeState());
  },
}));

// ── Auto-sync: subscribe to all domain stores so the facade stays reactive ──
const syncFacade = () => useDataStore.setState(mergeState());
useCatalogStore.subscribe(syncFacade);
useQuestionStore.subscribe(syncFacade);
usePaperStore.subscribe(syncFacade);
useTestStore.subscribe(syncFacade);
useUserStore.subscribe(syncFacade);
