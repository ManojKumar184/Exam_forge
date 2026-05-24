import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types';

interface AuthState {
  user: any | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, role: UserRole, institution?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,
      isInitialized: false,

      initialize: async () => {
        try {
          set({ isLoading: true });

          // Get current session
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            // Fetch profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();

            set({
              user: session.user,
              profile,
              isAuthenticated: true,
              isLoading: false,
              isInitialized: true,
            });
          } else {
            set({
              user: null,
              profile: null,
              isAuthenticated: false,
              isLoading: false,
              isInitialized: true,
            });
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

              set({
                user: session.user,
                profile,
                isAuthenticated: true,
              });
            } else if (event === 'SIGNED_OUT') {
              set({
                user: null,
                profile: null,
                isAuthenticated: false,
              });
            }
          });
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ isLoading: false, isInitialized: true });
        }
      },

      signIn: async (email, password) => {
        try {
          set({ isLoading: true });

          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            set({ isLoading: false });
            return { error };
          }

          if (data.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.user.id)
              .maybeSingle();

            set({
              user: data.user,
              profile,
              isAuthenticated: true,
              isLoading: false,
            });
          }

          return { error: null };
        } catch (error) {
          set({ isLoading: false });
          return { error };
        }
      },

      signUp: async (email, password, fullName, role, institution) => {
        try {
          set({ isLoading: true });

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                role,
                institution,
              },
            },
          });

          if (error) {
            set({ isLoading: false });
            return { error };
          }

          if (data.user) {
            // Wait for profile to be created by trigger
            await new Promise(resolve => setTimeout(resolve, 1000));

            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.user.id)
              .maybeSingle();

            set({
              user: data.user,
              profile,
              isAuthenticated: true,
              isLoading: false,
            });
          }

          return { error: null };
        } catch (error) {
          set({ isLoading: false });
          return { error };
        }
      },

      signOut: async () => {
        try {
          await supabase.auth.signOut();
          set({
            user: null,
            profile: null,
            isAuthenticated: false,
          });
        } catch (error) {
          console.error('Sign out error:', error);
        }
      },

      updateProfile: async (updates) => {
        const { profile } = get();
        if (!profile) return { error: 'No profile found' };

        try {
          const { error } = await supabase
            .from('profiles')
            .update({
              ...updates,
              updated_at: new Date().toISOString(),
            })
            .eq('id', profile.id);

          if (!error) {
            set({ profile: { ...profile, ...updates } });
          }

          return { error };
        } catch (error) {
          return { error };
        }
      },

      refreshProfile: async () => {
        const { user } = get();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        set({ profile });
      },
    }),
    {
      name: 'examforge-auth',
      partialize: (state) => ({
        // Don't persist sensitive data to localStorage
      }),
    }
  )
);
