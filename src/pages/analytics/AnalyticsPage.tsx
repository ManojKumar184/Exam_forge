import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  fetchAdminAnalyticsApi,
  fetchFacultyAnalyticsApi,
  fetchStudentAnalyticsApi,
  fetchTestPerformanceAnalyticsApi,
  fetchSystemMonitorApi,
  fetchReplaySummaryApi,
  runReplayHarnessApi,
  type TestPerformanceAnalytics,
} from '../../api/analytics';
import { fetchTestsApi } from '../../api/tests';
import { Card, StatCard, Loading, Alert, Button, Badge } from '../../components/ui';
import {
  Users,
  FileQuestion,
  FileText,
  BarChart3,
  TrendingUp,
  Target,
  Award,
  Server,
  Activity,
  Play,
  FolderOpen
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

  // Super Admin additional tabs state
  const [activeTab, setActiveTab] = useState<'overview' | 'infrastructure' | 'replay'>('overview');
  const [systemMonitor, setSystemMonitor] = useState<any>(null);
  const [replaySummary, setReplaySummary] = useState<any>(null);
  const [isReplayTriggering, setIsReplayTriggering] = useState(false);

  const loadSystemMonitor = async () => {
    try {
      const data = await fetchSystemMonitorApi();
      setSystemMonitor(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadReplaySummary = async () => {
    try {
      const data = await fetchReplaySummaryApi();
      setReplaySummary(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerReplay = async () => {
    setIsReplayTriggering(true);
    try {
      await runReplayHarnessApi();
      alert('Replay harness test started in background! Wait a few seconds and refresh.');
      setTimeout(loadReplaySummary, 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsReplayTriggering(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (isAdmin) {
          const data = await fetchAdminAnalyticsApi();
          setAdminData(data);
          void loadSystemMonitor();
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
    if (!isAdmin) return;
    if (activeTab === 'infrastructure') {
      void loadSystemMonitor();
    } else if (activeTab === 'replay') {
      void loadReplaySummary();
    }
  }, [activeTab, isAdmin]);

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Platform Analytics & SaaS Infrastructure</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage global system performance, AI pipelines, and test validations</p>
        </div>

        {/* Tabs navigation */}
        <div className="flex space-x-1 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition-all duration-200 ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('infrastructure')}
            className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition-all duration-200 ${
              activeTab === 'infrastructure'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            Infrastructure Monitor
          </button>
          <button
            onClick={() => setActiveTab('replay')}
            className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition-all duration-200 ${
              activeTab === 'replay'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            Replay Corpus (Regression Testing)
          </button>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Users"
                value={adminData.total_users}
                subtitle={`${adminData.total_students || 0} students`}
                icon={<Users className="w-6 h-6" />}
                color="blue"
              />
              <StatCard
                title="Question Bank"
                value={adminData.total_questions}
                subtitle={`${adminData.pending_questions || 0} pending`}
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
                subtitle={`${adminData.total_tests || 0} tests`}
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
                  <div className="flex justify-between">
                    <span>Needs manual review</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {adminData.needs_review_questions || 0}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'infrastructure' && (
          <div className="space-y-6">
            {!systemMonitor ? (
              <Loading text="Loading infrastructure details..." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AI Pipeline Info */}
                <Card className="p-6 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Server className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="font-semibold text-slate-900 dark:text-white">Ollama Model Refinement</h3>
                    </div>
                    <Badge variant={systemMonitor.ollama.status === 'online' ? 'success' : 'error'}>
                      {systemMonitor.ollama.status === 'online' ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                  <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex justify-between">
                      <span>Base URL</span>
                      <span className="font-medium text-slate-900 dark:text-white">{systemMonitor.ollama.baseUrl}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Target Model</span>
                      <span className="font-medium text-slate-900 dark:text-white">{systemMonitor.ollama.model}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Model Installed</span>
                      <span>
                        <Badge variant={systemMonitor.ollama.modelInstalled ? 'success' : 'warning'}>
                          {systemMonitor.ollama.modelInstalled ? 'Installed' : 'Not Found'}
                        </Badge>
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Parser Health */}
                <Card className="p-6 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <h3 className="font-semibold text-slate-900 dark:text-white">Reconstruction Engine Health</h3>
                    </div>
                    <Badge
                      variant={
                        systemMonitor.parser.healthStatus === 'healthy'
                          ? 'success'
                          : systemMonitor.parser.healthStatus === 'warning'
                          ? 'warning'
                          : 'error'
                      }
                    >
                      {systemMonitor.parser.healthStatus.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>Parser Confidence (last {systemMonitor.parser.sampleCount} docs)</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{systemMonitor.parser.avgConfidence}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full"
                          style={{ width: `${systemMonitor.parser.avgConfidence}%` }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>Reconstruction Fidelity</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{systemMonitor.parser.avgFidelity}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-indigo-500 h-2 rounded-full"
                          style={{ width: `${systemMonitor.parser.avgFidelity}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span>Avg. Warnings per document</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{systemMonitor.parser.avgWarnings}</span>
                    </div>
                  </div>
                </Card>

                {/* Storage Capacities */}
                <Card className="p-6 space-y-4 lg:col-span-2">
                  <div className="flex items-center justify-between border-b pb-3 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-5 h-5 text-amber-500" />
                      <h3 className="font-semibold text-slate-900 dark:text-white">Database & File Storage Status</h3>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Capacity limit: {(systemMonitor.storage.limitBytes / (1024 * 1024 * 1024)).toFixed(1)} GB
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1 text-sm text-slate-600 dark:text-slate-400">
                          <span>SaaS Storage Allocated</span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {(systemMonitor.storage.usedBytes / (1024 * 1024)).toFixed(2)} MB ({systemMonitor.storage.percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
                          <div
                            className="bg-amber-500 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, systemMonitor.storage.percentage)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Questions</div>
                        <div className="font-bold text-slate-900 dark:text-white">{systemMonitor.database.questions}</div>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Papers</div>
                        <div className="font-bold text-slate-900 dark:text-white">{systemMonitor.database.papers}</div>
                      </div>
                      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Attempts</div>
                        <div className="font-bold text-slate-900 dark:text-white">{systemMonitor.database.attempts}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {activeTab === 'replay' && (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4 dark:border-slate-700">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                    <Play className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Replay Corpus & Regression Suite
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Triggers ingestion replay against document fixtures to check for parsing quality regressions.
                  </p>
                </div>
                <div>
                  <Button
                    onClick={handleTriggerReplay}
                    disabled={isReplayTriggering || (replaySummary?.status?.isRunning ?? false)}
                    className="flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {replaySummary?.status?.isRunning ? 'Running Regression...' : 'Run Regression Suite'}
                  </Button>
                </div>
              </div>

              {replaySummary?.status?.isRunning && (
                <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-900 text-sm animate-pulse flex items-center gap-2">
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>The validation harness is currently running in the background. Please wait a few seconds and refresh.</span>
                </div>
              )}

              {replaySummary && (
                <div className="mt-6 space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded border dark:border-slate-700">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Fixture Qs</div>
                      <div className="text-xl font-bold mt-1 text-slate-900 dark:text-white">
                        {replaySummary.summary.totalQuestions}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded border dark:border-slate-700">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Avg Stem Levenshtein</div>
                      <div className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                        {replaySummary.summary.avgStemSimilarityPercent}%
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded border dark:border-slate-700">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Options Match Rate</div>
                      <div className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                        {replaySummary.summary.optionsMatchRatePercent}%
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded border dark:border-slate-700">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Classification Match</div>
                      <div className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                        {replaySummary.summary.classificationMatchRatePercent}%
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded border dark:border-slate-700">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Parser Warnings</div>
                      <div className="text-xl font-bold mt-1 text-amber-500">
                        {replaySummary.summary.totalWarningsCount}
                      </div>
                    </div>
                  </div>

                  {replaySummary.summary.error && (
                    <Alert variant="warning" title="No Cached Report Found">
                      {replaySummary.summary.error}
                    </Alert>
                  )}

                  {/* Evaluations List */}
                  {replaySummary.evaluations && replaySummary.evaluations.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Ingestion Accuracy Details (First 50 questions)</h4>
                      <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
                        <table className="w-full text-sm text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b dark:border-slate-700">
                              <th className="p-3">Fixture</th>
                              <th className="p-3">Q Index</th>
                              <th className="p-3 text-right">Stem Similarity</th>
                              <th className="p-3 text-right">Options Match</th>
                              <th className="p-3 text-right">Warnings</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y dark:divide-slate-700 text-slate-600 dark:text-slate-400">
                            {replaySummary.evaluations.map((evalItem: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="p-3 font-mono text-xs">{evalItem.fixtureName}</td>
                                <td className="p-3">{evalItem.questionIndex}</td>
                                <td className={`p-3 text-right font-semibold ${
                                  Number(evalItem.stemSimilarityPercent) >= 90 ? 'text-emerald-600' : 'text-red-500'
                                }`}>
                                  {evalItem.stemSimilarityPercent}%
                                </td>
                                <td className="p-3 text-right">
                                  <Badge variant={evalItem.optionsMatched ? 'success' : 'error'}>
                                    {evalItem.optionsMatched ? 'Match' : 'Mismatch'}
                                  </Badge>
                                </td>
                                <td className="p-3 text-right">
                                  {evalItem.warnings?.length > 0 ? (
                                    <span className="text-amber-500 font-medium text-xs">{evalItem.warnings.length} warning(s)</span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">0</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
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
