import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchAdminAnalyticsApi,
  fetchFacultyAnalyticsApi,
  fetchStudentAnalyticsApi,
} from '../../api/analytics';
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
          const data = await fetchFacultyAnalyticsApi();
          setRoleData(data);
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
