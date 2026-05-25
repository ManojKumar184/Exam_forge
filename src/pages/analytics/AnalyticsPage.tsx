import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchAdminAnalyticsApi,
  fetchFacultyAnalyticsApi,
  fetchStudentAnalyticsApi,
  fetchTestPerformanceAnalyticsApi,
  type TestPerformanceAnalytics,
} from '../../api/analytics';
import { fetchTestsApi } from '../../api/tests';
import { Card, StatCard, Loading, Alert } from '../../components/ui';
import {
  Users,
  FileQuestion,
  FileText,
  BarChart3,
  TrendingUp,
  Target,
  Award,
} from 'lucide-react';
import type { AnalyticsData } from '../../types';

export function AnalyticsPage() {
  const { isAdmin, isFaculty, isStudent } = useAuth();
  const [adminData, setAdminData] = useState<AnalyticsData | null>(null);
  const [roleData, setRoleData] = useState<Record<string, number> | null>(null);
  const [testOptions, setTestOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [testPerf, setTestPerf] = useState<TestPerformanceAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (isAdmin) {
          const data = await fetchAdminAnalyticsApi();
          setAdminData(data);
        } else if (isFaculty) {
          const [data, tests] = await Promise.all([
            fetchFacultyAnalyticsApi(),
            fetchTestsApi(),
          ]);
          setRoleData(data);
          setTestOptions(tests.map((t) => ({ id: t.id, label: t.test_code })));
        } else if (isStudent) {
          const data = await fetchStudentAnalyticsApi();
          setRoleData(data);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isAdmin, isFaculty, isStudent]);

  useEffect(() => {
    if (!isFaculty || !selectedTestId) return;
    const loadTestPerf = async () => {
      try {
        const data = await fetchTestPerformanceAnalyticsApi(selectedTestId);
        setTestPerf(data);
      } catch {
        setTestPerf(null);
      }
    };
    void loadTestPerf();
  }, [isFaculty, selectedTestId]);

  if (isLoading) {
    return <Loading fullScreen text="Loading analytics..." />;
  }

  if (error) {
    return (
      <Alert variant="error" title="Analytics unavailable">
        {error}
      </Alert>
    );
  }

  if (isAdmin && adminData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Platform Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Overview across users, content, and tests</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Users"
            value={adminData.total_users}
            subtitle={`${adminData.total_students} students`}
            icon={<Users className="w-6 h-6" />}
            color="blue"
          />
          <StatCard
            title="Question Bank"
            value={adminData.total_questions}
            subtitle={`${adminData.pending_questions} pending`}
            icon={<FileQuestion className="w-6 h-6" />}
            color="green"
          />
          <StatCard
            title="Exam Papers"
            value={adminData.total_papers}
            icon={<FileText className="w-6 h-6" />}
            color="amber"
          />
          <StatCard
            title="Test Attempts"
            value={adminData.total_attempts}
            subtitle={`${adminData.total_tests} tests`}
            icon={<BarChart3 className="w-6 h-6" />}
            color="slate"
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Users by role</h3>
            <div className="space-y-3 text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Administrators</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {adminData.total_admins}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Faculty</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {adminData.total_faculty}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Students</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {adminData.total_students}
                </span>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Question pipeline</h3>
            <div className="space-y-3 text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Approved</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {adminData.approved_questions}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Pending review</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {adminData.pending_questions}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (isFaculty && roleData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Faculty Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Your papers, tests, and student performance</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Papers"
            value={roleData.total_papers ?? 0}
            icon={<FileText className="w-6 h-6" />}
            color="blue"
          />
          <StatCard
            title="Online Tests"
            value={roleData.total_tests ?? 0}
            icon={<BarChart3 className="w-6 h-6" />}
            color="green"
          />
          <StatCard
            title="Attempts"
            value={roleData.total_attempts ?? 0}
            icon={<Users className="w-6 h-6" />}
            color="amber"
          />
          <StatCard
            title="Avg. Score"
            value={`${roleData.average_score ?? 0}%`}
            icon={<TrendingUp className="w-6 h-6" />}
            color="slate"
          />
        </div>

        {testOptions.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white">Test performance</h3>
              <select
                value={selectedTestId}
                onChange={(e) => setSelectedTestId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm max-w-xs"
              >
                <option value="">Select a test…</option>
                {testOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {testPerf && (
              <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
                <p>
                  {testPerf.total_attempts} attempts · avg {testPerf.average_score}% ·{' '}
                  {testPerf.pending_grading} pending grading
                </p>
                {testPerf.weak_topics.length > 0 && (
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200 mb-2">Weak topics</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {testPerf.weak_topics.map((w) => (
                        <li key={w.topic}>
                          {w.topic}: {w.wrong_count} incorrect
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {testPerf.descriptive_analytics.length > 0 && (
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200 mb-2">
                      Descriptive performance
                    </p>
                    <ul className="space-y-1">
                      {testPerf.descriptive_analytics.map((d) => (
                        <li key={d.question_id}>
                          {d.chapter}: avg {d.avg_marks_awarded}/{d.max_marks} marks (
                          {d.graded_rate_pct}% graded)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    );
  }

  if (isStudent && roleData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Your Performance</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Attempt history and scores</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Attempts"
            value={roleData.total_attempts ?? 0}
            icon={<FileText className="w-6 h-6" />}
            color="blue"
          />
          <StatCard
            title="Completed"
            value={roleData.completed_attempts ?? 0}
            icon={<Target className="w-6 h-6" />}
            color="green"
          />
          <StatCard
            title="Average Score"
            value={`${roleData.average_score ?? 0}%`}
            icon={<TrendingUp className="w-6 h-6" />}
            color="amber"
          />
          <StatCard
            title="Best Score"
            value={`${roleData.best_score ?? 0}%`}
            icon={<Award className="w-6 h-6" />}
            color="slate"
          />
        </div>
      </div>
    );
  }

  return (
    <Alert variant="warning" title="No analytics">
      Analytics are not available for your role.
    </Alert>
  );
}
