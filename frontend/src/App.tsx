import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ApiConfigError } from './components/ApiConfigError';
import { apiConfig } from './config/api';
import { useAuth } from './hooks/useAuth';
import { useDataStore } from './stores/dataStore';
import { Loading } from './components/ui';
import { COLORS, RADIUS } from './lib/designTokens';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage, RegisterPage } from './pages/auth';
import { DashboardRouter } from './pages/dashboard';
import { QuestionBankPage, ImportCenterPage, QuestionEditorPage, ModerationQueuePage, SyllabusManagerPage, QuestionBanksManagerPage, WorkspacePage, TemplateBuilderPage } from './pages/questions';
import { PaperGeneratorPage, PapersListPage, PaperExportWorkspace } from './pages/paper';
import { TestTakingPage, TestReviewPage, TestGradingPage, TestsListPage } from './pages/test';
import { LeaderboardPage } from './pages/leaderboard/LeaderboardPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { InstitutionProfilePage } from './pages/settings/InstitutionProfilePage';
import { AcceptInvitationPage } from './pages/auth/AcceptInvitationPage';
import { InstitutionMembersPage } from './pages/settings/InstitutionMembersPage';
import { UsersPage } from './pages/users/UsersPage';
import { apiClient, getActiveInstitutionId, setActiveInstitutionId } from './api/client';

// Layout
import { Layout } from './components/layout/Layout';
import { TenantProvider, useTenant, type TenantInstitution } from './context/TenantContext';

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuth();

  if (!isInitialized) {
    return <Loading fullScreen text="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <InstitutionGate>{children}</InstitutionGate>;
}

function InstitutionGate({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const { institutions, setInstitutions, activateInstitution } = useTenant();
  const [selectedId, setSelectedId] = useState(getActiveInstitutionId() || '');
  const [entered, setEntered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [type, setType] = useState('SCHOOL');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const endpoint = profile?.role === 'super_admin' ? '/institutions' : '/institutions/mine';
        const response = await apiClient.get(endpoint);
        const rawRows: unknown = response.data.data;
        const rows = (Array.isArray(rawRows) ? rawRows : []).flatMap((value: unknown) => {
          const row = value as { institutionId?: { _id?: string; id?: string; name?: string; type?: string }; _id?: string; id?: string; name?: string; type?: string; role?: TenantInstitution['role'] };
          const institution = row.institutionId || row;
          const id = institution._id || institution.id;
          return id && institution.name ? [{ id: String(id), name: institution.name, type: institution.type, role: row.role }] : [];
        });
        if (!alive) return;
        setInstitutions(rows);
        const active = getActiveInstitutionId();
        const next = active && rows.some((row: { id: string }) => row.id === active) ? active : rows[0]?.id || '';
        setSelectedId(next);
        if (rows.length === 1 && next) {
          const onlyInstitution = rows[0];
          setActiveInstitutionId(next);
          activateInstitution(next, onlyInstitution.role);
          setEntered(true);
        }
        else if (active && rows.some((row: { id: string }) => row.id === active)) setEntered(true);
        if (rows.length && next) setError('');
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Could not load institution access.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [profile?.role, setInstitutions]);

  const createInstitution = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const response = await apiClient.post('/institutions', { name, type });
      const institutionId = String(response.data.data.institution._id);
      setActiveInstitutionId(institutionId);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the institution.');
    }
  };

  if (loading) return <Loading fullScreen text="Loading institution access..." />;
  if (institutions.length > 0) {
    const active = institutions.find((institution) => institution.id === selectedId);
    if (!active) return <Loading fullScreen text="Selecting institution..." />;
    if (!entered && institutions.length > 1) return <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950"><div className="mx-auto mt-16 max-w-xl rounded-2xl border bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h1 className="text-2xl font-semibold">Choose your institution</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Your workspace, data, and permissions will follow this institution.</p><label className="mt-6 block text-sm font-medium">Institution<select className="mt-2 w-full rounded-lg border p-3 dark:bg-slate-800" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label><div className="mt-6 flex justify-between"><button className="text-sm underline" onClick={() => void signOut()}>Sign out</button><button className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white disabled:opacity-50" disabled={!selectedId} onClick={() => { const chosen = institutions.find((item) => item.id === selectedId); if (chosen) { setActiveInstitutionId(chosen.id); activateInstitution(chosen.id, chosen.role); setEntered(true); } }}>Continue</button></div></div></div>;
    return <>{children}</>;
  }

  if (profile?.role === 'faculty' || profile?.role === 'super_admin') return <div className="min-h-screen bg-slate-50 px-4 py-12 dark:bg-slate-950"><form onSubmit={createInstitution} className="mx-auto max-w-lg space-y-4 rounded-xl bg-white p-6 shadow dark:bg-slate-900"><h1 className="text-2xl font-semibold">Set up your institution</h1><p className="text-sm text-slate-600">Create a secure workspace to manage questions, papers, and exams.</p>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<label className="block text-sm">Institution name<input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border p-2" /></label><label className="block text-sm">Institution type<select value={type} onChange={(event) => setType(event.target.value)} className="mt-1 w-full rounded border p-2"><option value="SCHOOL">School</option><option value="COLLEGE">College</option><option value="UNIVERSITY">University</option><option value="COACHING">Coaching</option><option value="OTHER">Other</option></select></label><button className="rounded bg-blue-600 px-4 py-2 text-white">Create institution workspace</button><button type="button" className="ml-3 text-sm underline" onClick={() => void signOut()}>Sign out</button></form></div>;

  return <div className="p-8"><h1 className="text-xl font-semibold">Institution access required</h1><p className="mt-2">Ask your institution administrator to invite this account.</p><button className="mt-4 underline" onClick={() => void signOut()}>Sign out</button></div>;
}

// Admin Route wrapper
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

// Admin or Faculty Route wrapper
function AdminOrFacultyRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isFaculty } = useAuth();

  if (!isAdmin && !isFaculty) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardRouter />} />
      </Route>

      <Route
        path="/questions"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <AdminRoute>
              <QuestionBankPage />
            </AdminRoute>
          }
        />
        <Route
          path="moderation"
          element={
            <AdminRoute>
              <ModerationQueuePage />
            </AdminRoute>
          }
        />
        <Route path="new" element={<QuestionEditorPage />} />
        <Route
          path=":questionId/edit"
          element={
            <AdminOrFacultyRoute>
              <QuestionEditorPage />
            </AdminOrFacultyRoute>
          }
        />
      </Route>

      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <AdminOrFacultyRoute>
              <Layout />
            </AdminOrFacultyRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<WorkspacePage />} />
      </Route>

      <Route
        path="/import-center"
        element={
          <ProtectedRoute>
            <AdminOrFacultyRoute>
              <Layout />
            </AdminOrFacultyRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<ImportCenterPage />} />
      </Route>

      <Route
        path="/syllabus"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <Layout />
            </AdminRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<SyllabusManagerPage />} />
      </Route>

      <Route
        path="/question-banks"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<QuestionBanksManagerPage />} />
      </Route>

      <Route
        path="/papers"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PapersListPage />} />
      </Route>

      <Route
        path="/papers/:id/export"
        element={
          <ProtectedRoute>
            <PaperExportWorkspace />
          </ProtectedRoute>
        }
      />

      <Route
        path="/templates"
        element={
          <ProtectedRoute>
            <AdminOrFacultyRoute>
              <Layout />
            </AdminOrFacultyRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<TemplateBuilderPage />} />
      </Route>

      <Route
        path="/papers/new"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PaperGeneratorPage />} />
      </Route>

      <Route
        path="/papers/:paperId/edit"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PaperGeneratorPage />} />
      </Route>

      <Route
        path="/tests"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TestsListPage />} />
      </Route>

      <Route
        path="/test/:testId"
        element={
          <ProtectedRoute>
            <TestTakingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/test/:testId/review"
        element={
          <ProtectedRoute>
            <TestReviewPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/tests/:testId/grading"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TestGradingPage />} />
        <Route path=":attemptId" element={<TestGradingPage />} />
      </Route>

      <Route
        path="/leaderboard"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<LeaderboardPage />} />
      </Route>

      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AnalyticsPage />} />
      </Route>

      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SettingsPage />} />
        <Route path="institution" element={<InstitutionProfilePage />} />
        <Route path="members" element={<InstitutionMembersPage />} />
      </Route>

      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <Layout />
            </AdminRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<UsersPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const { isInitialized, isAuthenticated } = useAuth();
  const { fetchSubjects, fetchExamTypes } = useDataStore();

  useEffect(() => {
    if (!apiConfig.isConfigured || !isInitialized || !isAuthenticated) return;
    fetchSubjects();
    fetchExamTypes();
  }, [isInitialized, isAuthenticated, fetchSubjects, fetchExamTypes]);

  if (!apiConfig.isConfigured) {
    return <ApiConfigError />;
  }

  return (
    <>
      <BrowserRouter>
      <TenantProvider><AppRoutes /></TenantProvider>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: COLORS.neutral[800],
            color: COLORS.neutral[100],
            borderRadius: RADIUS.md,
            fontSize: '0.875rem',
          },
        }}
      />
    </>
  );
}

export default App;
