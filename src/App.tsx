import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ApiConfigError } from './components/ApiConfigError';
import { apiConfig } from './config/api';
import { useAuth } from './hooks/useAuth';
import { useDataStore } from './stores/dataStore';
import { Loading } from './components/ui';

// Pages
import { LandingPage } from './pages/LandingPage';
import { LoginPage, RegisterPage } from './pages/auth';
import { DashboardRouter } from './pages/dashboard';
import { QuestionBankPage, UploadQuestionsPage } from './pages/questions';
import { PaperGeneratorPage, PapersListPage } from './pages/paper';
import { TestTakingPage, TestsListPage } from './pages/test';
import { LeaderboardPage } from './pages/leaderboard/LeaderboardPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { UsersPage } from './pages/users/UsersPage';

// Layout
import { Layout } from './components/layout/Layout';

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuth();

  if (!isInitialized) {
    return <Loading fullScreen text="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Admin Route wrapper
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();

  if (!profile || profile.role !== 'super_admin') {
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
        <Route index element={<QuestionBankPage />} />
      </Route>

      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <Layout />
            </AdminRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<UploadQuestionsPage />} />
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
            <TestTakingPage />
          </ProtectedRoute>
        }
      />

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
        <AppRoutes />
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            borderRadius: '12px',
          },
        }}
      />
    </>
  );
}

export default App;
