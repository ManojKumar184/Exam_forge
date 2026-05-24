import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Subject, Chapter, ExamType, Question, Paper, OnlineTest, TestAttempt, Profile, AnalyticsData } from '../types';
import type { PostgrestError } from '@supabase/supabase-js';

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
  createQuestion: (question: Partial<Question>) => Promise<{ data: Question | null; error: PostgrestError | null }>;
  updateQuestion: (id: string, updates: Partial<Question>) => Promise<{ error: PostgrestError | null }>;
  deleteQuestion: (id: string) => Promise<{ error: PostgrestError | null }>;
  approveQuestion: (id: string) => Promise<{ error: PostgrestError | null }>;
  rejectQuestion: (id: string, notes: string) => Promise<{ error: PostgrestError | null }>;
  createPaper: (paper: Partial<Paper>) => Promise<{ data: Paper | null; error: PostgrestError | null }>;
  updatePaper: (id: string, updates: Partial<Paper>) => Promise<{ error: PostgrestError | null }>;
  deletePaper: (id: string) => Promise<{ error: PostgrestError | null }>;
  createOnlineTest: (test: Partial<OnlineTest>) => Promise<{ data: OnlineTest | null; error: PostgrestError | null }>;
  updateOnlineTest: (id: string, updates: Partial<OnlineTest>) => Promise<{ error: PostgrestError | null }>;
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
    const { data, error } = await supabase.from('subjects').select('*').order('name');
    if (!error) set({ subjects: data || [] });
  },

  fetchChapters: async (subjectId) => {
    let query = supabase.from('chapters').select('*, subject:subjects(*)').order('chapter_number');
    if (subjectId) query = query.eq('subject_id', subjectId);
    const { data, error } = await query;
    if (!error) set({ chapters: data || [] });
  },

  fetchExamTypes: async () => {
    const { data, error } = await supabase.from('exam_types').select('*').order('name');
    if (!error) set({ examTypes: data || [] });
  },

  fetchQuestions: async (filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      let query = supabase
        .from('questions')
        .select('*, subject:subjects(*), chapter:chapters(*), exam_type:exam_types(*)')
        .order('created_at', { ascending: false });
      if (filters.subject_id) query = query.eq('subject_id', filters.subject_id);
      if (filters.chapter_id) query = query.eq('chapter_id', filters.chapter_id);
      if (filters.exam_type_id) query = query.eq('exam_type_id', filters.exam_type_id);
      if (filters.class) query = query.eq('class', filters.class);
      if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
      if (filters.question_type) query = query.eq('question_type', filters.question_type);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.search) query = query.ilike('question_text', '%' + filters.search + '%');
      const { data, error } = await query;
      if (error) throw error;
      set({ questions: data || [], isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchPapers: async () => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from('papers')
        .select('*, subject:subjects(*), exam_type:exam_types(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ papers: data || [], isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchOnlineTests: async () => {
    const { data, error } = await supabase
      .from('online_tests')
      .select('*, paper:papers(*)')
      .order('created_at', { ascending: false });
    if (!error) set({ onlineTests: data || [] });
  },

  fetchTestAttempts: async (testId) => {
    let query = supabase.from('test_attempts').select('*').order('started_at', { ascending: false });
    if (testId) query = query.eq('test_id', testId);
    const { data, error } = await query;
    if (!error) set({ testAttempts: data || [] });
  },

  fetchUsers: async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (!error) set({ users: data || [] });
  },

  fetchAnalytics: async () => {
    const [usersResult, questionsResult, papersResult, testsResult, attemptsResult] = await Promise.all([
      supabase.from('profiles').select('role'),
      supabase.from('questions').select('status'),
      supabase.from('papers').select('id'),
      supabase.from('online_tests').select('id'),
      supabase.from('test_attempts').select('id'),
    ]);
    const users = usersResult.data || [];
    const questions = questionsResult.data || [];
    return {
      total_users: users.length,
      total_admins: users.filter(u => u.role === 'super_admin').length,
      total_faculty: users.filter(u => u.role === 'faculty').length,
      total_students: users.filter(u => u.role === 'student').length,
      total_questions: questions.length,
      total_papers: papersResult.data?.length || 0,
      total_tests: testsResult.data?.length || 0,
      total_attempts: attemptsResult.data?.length || 0,
      pending_questions: questions.filter(q => q.status === 'pending').length,
      approved_questions: questions.filter(q => q.status === 'approved').length,
    };
  },

  createQuestion: async (question) => {
    const { data, error } = await supabase.from('questions').insert(question).select().single();
    if (!error && data) set({ questions: [data, ...get().questions] });
    return { data, error };
  },

  updateQuestion: async (id, updates) => {
    const { error } = await supabase.from('questions').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) set({ questions: get().questions.map(q => (q.id === id ? { ...q, ...updates } : q)) });
    return { error };
  },

  deleteQuestion: async (id) => {
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (!error) set({ questions: get().questions.filter(q => q.id !== id) });
    return { error };
  },

  approveQuestion: async (id) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('questions').update({ status: 'approved', reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq('id', id);
    if (!error) set({ questions: get().questions.map(q => q.id === id ? { ...q, status: 'approved' as const } : q) });
    return { error };
  },

  rejectQuestion: async (id, notes) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('questions').update({ status: 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_notes: notes }).eq('id', id);
    if (!error) set({ questions: get().questions.map(q => q.id === id ? { ...q, status: 'rejected' as const, review_notes: notes } : q) });
    return { error };
  },

  createPaper: async (paper) => {
    const { data, error } = await supabase.from('papers').insert(paper).select().single();
    if (!error && data) set({ papers: [data, ...get().papers] });
    return { data, error };
  },

  updatePaper: async (id, updates) => {
    const { error } = await supabase.from('papers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) set({ papers: get().papers.map(p => (p.id === id ? { ...p, ...updates } : p)) });
    return { error };
  },

  deletePaper: async (id) => {
    const { error } = await supabase.from('papers').delete().eq('id', id);
    if (!error) set({ papers: get().papers.filter(p => p.id !== id) });
    return { error };
  },

  createOnlineTest: async (test) => {
    const { data, error } = await supabase.from('online_tests').insert(test).select().single();
    if (!error && data) set({ onlineTests: [data, ...get().onlineTests] });
    return { data, error };
  },

  updateOnlineTest: async (id, updates) => {
    const { error } = await supabase.from('online_tests').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) set({ onlineTests: get().onlineTests.map(t => (t.id === id ? { ...t, ...updates } : t)) });
    return { error };
  },

  clearError: () => set({ error: null }),
}));
