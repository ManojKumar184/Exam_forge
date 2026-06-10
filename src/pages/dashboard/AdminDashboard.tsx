import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDataStore } from '../../stores/dataStore';
import { Card, CardHeader, CardBody, StatCard, Button, Badge, Loading, PageHeader } from '../../components/ui';
import { fetchSystemMonitorApi } from '../../api/analytics';
import {
  Users,
  FileQuestion,
  Clock,
  AlertCircle,
  BarChart3,
  Upload,
  Plus,
  Activity,
  Server,
  Library,
  GraduationCap,
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
    subjects,
    isLoading,
  } = useDataStore();

  const [analytics, setAnalytics] = React.useState<any>(null);
  const [systemHealth, setSystemHealth] = React.useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAnalytics();
        setAnalytics(data);
        const health = await fetchSystemMonitorApi();
        setSystemHealth(health);
      } catch (err) {
        console.error("Error loading admin dashboard analytics", err);
      }
      fetchSubjects();
      fetchQuestions({ status: 'pending' });
      fetchPapers();
      fetchUsers();
    };
    load();
  }, []);

  if (isLoading || !analytics) {
    return <Loading fullScreen text="Loading control center..." />;
  }

  const recentQuestions = questions.slice(0, 5);
  const recentPapers = papers.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`Welcome back, ${profile?.full_name?.split(' ')[0] || 'Admin'}!`}
        subtitle="SaaS Control Center: Platform telemetry and operational status."
        actions={
          <>
            <Link to="/upload">
              <Button leftIcon={<Upload className="w-4 h-4" />}>Upload Questions</Button>
            </Link>
            <Link to="/papers/new">
              <Button variant="outline" leftIcon={<Plus className="w-4 h-4" />}>
                Create Paper
              </Button>
            </Link>
          </>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Questions"
          value={analytics.total_questions}
          subtitle={`${analytics.approved_questions} approved`}
          icon={<FileQuestion className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Total Banks"
          value={analytics.total_banks || 0}
          subtitle="Active question banks"
          icon={<Library className="w-6 h-6" />}
          color="slate"
        />
        <StatCard
          title="Total Faculty"
          value={analytics.total_faculty}
          subtitle="Content creators"
          icon={<GraduationCap className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Total Students"
          value={analytics.total_students}
          subtitle="Active candidates"
          icon={<Users className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Total Tests"
          value={analytics.total_tests}
          subtitle={`${analytics.total_attempts} attempts`}
          icon={<BarChart3 className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="Active Tests"
          value={analytics.active_tests || 0}
          subtitle="Currently running"
          icon={<Clock className="w-6 h-6" />}
          color="red"
        />
        <StatCard
          title="Recent Imports"
          value={analytics.total_uploads}
          subtitle="Ingested batches"
          icon={<Upload className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Pending Reviews"
          value={analytics.pending_questions}
          subtitle="Awaiting moderation"
          icon={<AlertCircle className="w-6 h-6" />}
          color="amber"
        />
      </div>

      {/* Health Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">AI Hugging Face Status</h3>
                <p className="text-xs text-slate-500">Inference APIs for OCR, tagging & parsing</p>
              </div>
            </div>
            {systemHealth?.huggingFace?.status === 'online' ? (
              <Badge variant="success" className="animate-pulse">Active / Online</Badge>
            ) : systemHealth?.huggingFace?.status === 'invalid_token' ? (
              <Badge variant="error">Invalid Token</Badge>
            ) : systemHealth?.huggingFace?.status === 'degraded' ? (
              <Badge variant="warning">Degraded</Badge>
            ) : (
              <Badge variant="error">Offline</Badge>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Primary Model</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">Qwen/Qwen2.5-7B-Instruct</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Token Configuration</span>
              <span className="font-medium text-slate-950 dark:text-slate-100">
                {systemHealth?.huggingFace?.configured ? 'Configured (HF_TOKEN)' : 'Missing Token'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Model Routing</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">Automatic HF Inference Fallbacks</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Ingestion Pipeline Health</h3>
                <p className="text-xs text-slate-500">OCR Parsing and Reconstruction Fidelity</p>
              </div>
            </div>
            {systemHealth?.parser?.healthStatus === 'healthy' ? (
              <Badge variant="success">Healthy</Badge>
            ) : systemHealth?.parser?.healthStatus === 'warning' ? (
              <Badge variant="warning">Warning</Badge>
            ) : (
              <Badge variant="error">Critical</Badge>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Parser Confidence (Avg)</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {systemHealth?.parser?.avgConfidence ? `${systemHealth.parser.avgConfidence}%` : '90.0%'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">Reconstruction Fidelity</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {systemHealth?.parser?.avgFidelity ? `${systemHealth.parser.avgFidelity}%` : '85.0%'}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Average Warnings per File</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {systemHealth?.parser?.avgWarnings ?? '0.2'}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Activity Feed and Storage Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Feed */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Recent System Activity
            </h3>
            <Badge variant="default" size="sm">Real-time telemetry</Badge>
          </CardHeader>
          <CardBody className="max-h-[350px] overflow-y-auto pt-4">
            {!analytics.activity_feed || analytics.activity_feed.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                No recent activity recorded
              </p>
            ) : (
              <div className="relative border-l border-slate-200 dark:border-slate-800 ml-3 pl-6 space-y-6 py-2">
                {analytics.activity_feed.map((act: any) => {
                  let badgeClass = "bg-blue-500";
                  if (act.type === 'upload') badgeClass = "bg-purple-500";
                  if (act.type === 'test_attempt') badgeClass = "bg-emerald-500";
                  if (act.type === 'paper_generation') badgeClass = "bg-amber-500";

                  return (
                    <div key={act.id} className="relative group">
                      {/* Timeline dot */}
                      <span className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 ring-4 ring-white dark:ring-slate-950">
                        <span className={`h-2 w-2 rounded-full ${badgeClass}`} />
                      </span>
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm">
                            {act.user}
                          </span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {new Date(act.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {act.action}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Quick Stats: Subject Coverage & Storage */}
        <Card className="lg:col-span-1 p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wider">
              Storage Usage
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{((systemHealth?.storage?.usedBytes || 0) / (1024 * 1024)).toFixed(2)} MB / 5 GB</span>
                <span>{systemHealth?.storage?.percentage || '0.00'}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
                  style={{ width: `${systemHealth?.storage?.percentage || 0}%` }}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm uppercase tracking-wider">
              Subject Distribution
            </h3>
            <div className="space-y-3">
              {subjects.slice(0, 5).map((subject) => (
                <div key={subject.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subject.color }} />
                    <span className="text-slate-600 dark:text-slate-400 text-sm">{subject.name}</span>
                  </div>
                  <Badge size="sm">
                    {questions.filter(q => q.subject_id === subject.id).length} Q
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Activity Grid for Qs and Papers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
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
                      <p className="text-sm text-slate-900 dark:text-white truncate font-medium">
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
          <CardHeader className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
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
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">
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
