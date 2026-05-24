import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDataStore } from '../../stores/dataStore';
import { Card, StatCard, Button, Badge, Loading } from '../../components/ui';
import {
  Users,
  FileQuestion,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Upload,
  BookOpen,
  Plus,
} from 'lucide-react';

export function AdminDashboard() {
  const { profile } = useAuth();
  const {
    fetchAnalytics,
    fetchSubjects,
    fetchQuestions,
    fetchPapers,
    fetchUsers,
    questions,
    papers,
    users,
    subjects,
    isLoading,
  } = useDataStore();

  const [analytics, setAnalytics] = React.useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const data = await fetchAnalytics();
      setAnalytics(data);
      fetchSubjects();
      fetchQuestions({ status: 'pending' });
      fetchPapers();
      fetchUsers();
    };
    load();
  }, []);

  if (isLoading || !analytics) {
    return <Loading fullScreen text="Loading dashboard..." />;
  }

  const recentQuestions = questions.slice(0, 5);
  const recentPapers = papers.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'Admin'}!
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Here's what's happening with your platform today.
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/upload">
            <Button leftIcon={<Upload className="w-4 h-4" />}>Upload Questions</Button>
          </Link>
          <Link to="/papers/new">
            <Button variant="outline" leftIcon={<Plus className="w-4 h-4" />}>
              Create Paper
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={analytics.total_users}
          subtitle={`${analytics.total_students} students`}
          icon={<Users className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Question Bank"
          value={analytics.total_questions}
          subtitle={`${analytics.pending_questions} pending review`}
          icon={<FileQuestion className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Exam Papers"
          value={analytics.total_papers}
          subtitle="Total generated"
          icon={<FileText className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="Online Tests"
          value={analytics.total_tests}
          subtitle={`${analytics.total_attempts} attempts`}
          icon={<BarChart3 className="w-6 h-6" />}
          color="slate"
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
            Question Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-slate-600 dark:text-slate-400">Approved</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">
                {analytics.approved_questions}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                <span className="text-slate-600 dark:text-slate-400">Pending Review</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">
                {analytics.pending_questions}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-slate-600 dark:text-slate-400">Needs Attention</span>
              </div>
              <span className="font-semibold text-slate-900 dark:text-white">
                {questions.filter(q => q.ai_confidence < 50).length}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
            Users by Role
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Administrators</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {analytics.total_admins}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Faculty / Teachers</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {analytics.total_faculty}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Students</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {analytics.total_students}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
            Subjects
          </h3>
          <div className="space-y-2">
            {subjects.slice(0, 5).map((subject) => (
              <div
                key={subject.id}
                className="flex items-center justify-between py-1"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  <span className="text-slate-600 dark:text-slate-400">
                    {subject.name}
                  </span>
                </div>
                <Badge size="sm">
                  {questions.filter(q => q.subject_id === subject.id).length}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Recent Questions
            </h3>
            <Link to="/questions">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardBody>
            {recentQuestions.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                No questions yet
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {recentQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="py-3 flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 dark:text-white truncate">
                        {q.question_text.substring(0, 80)}...
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={q.status === 'approved' ? 'success' : 'warning'}
                          size="sm"
                        >
                          {q.status}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          Class {q.class} | {q.difficulty}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Recent Papers
            </h3>
            <Link to="/papers">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </CardHeader>
          <CardBody>
            {recentPapers.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                No papers generated yet
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {recentPapers.map((paper) => (
                  <div
                    key={paper.id}
                    className="py-3 flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {paper.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge size="sm">{paper.exam_type?.name || 'N/A'}</Badge>
                        <span className="text-xs text-slate-500">
                          {paper.total_questions}Q | {paper.total_marks}M
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={paper.status === 'published' ? 'success' : 'default'}
                      size="sm"
                    >
                      {paper.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
