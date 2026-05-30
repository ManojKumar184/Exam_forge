import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDataStore } from '../../stores/dataStore';
import { Card, CardHeader, CardBody, StatCard, Button, Badge, Loading } from '../../components/ui';
import { Trophy, Clock, FileText, Target, Award, Calendar } from 'lucide-react';

export function StudentDashboard() {
  const { profile } = useAuth();
  const { fetchOnlineTests, onlineTests, fetchTestAttempts, testAttempts } = useDataStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchOnlineTests(), fetchTestAttempts()]);
      setIsLoading(false);
    };
    load();
  }, [profile?.id]);

  if (isLoading) {
    return <Loading fullScreen text="Loading dashboard..." />;
  }

  const attempts = testAttempts;
  const completedTests = attempts.filter(a => a.status === 'submitted' || a.status === 'auto_submitted');
  const avgScore = completedTests.length > 0
    ? Math.round(completedTests.reduce((sum, a) => sum + (a.percentage || 0), 0) / completedTests.length)
    : 0;

  const getTestStatus = (test: any) => {
    const now = new Date();
    const start = test.start_time ? new Date(test.start_time) : null;
    const end = test.end_time ? new Date(test.end_time) : null;

    if (test.status === 'draft' || test.status === 'archived' || test.status === 'completed') {
      return test.status;
    }
    if (start && now < start) return 'scheduled';
    if (end && now > end) return 'completed';
    return 'active';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'scheduled': return 'warning';
      case 'completed': return 'default';
      default: return 'default';
    }
  };

  const availableTests = onlineTests.filter(
    test => getTestStatus(test) === 'active' && !attempts.some(a => a.test_id === test.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Welcome, {profile?.full_name?.split(' ')[0] || 'Student'}!
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Track your progress and take exams.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tests Attempted"
          value={attempts.length}
          subtitle="Total attempts"
          icon={<FileText className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Average Score"
          value={`${avgScore}%`}
          subtitle="Overall performance"
          icon={<Target className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Best Score"
          value={`${Math.max(...completedTests.map(a => a.percentage || 0), 0)}%`}
          subtitle="Highest achieved"
          icon={<Award className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="Available Tests"
          value={availableTests.length}
          subtitle="Ready to take"
          icon={<Clock className="w-6 h-6" />}
          color="slate"
        />
      </div>

      {/* Available Tests */}
      {availableTests.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-900 dark:text-white">Available Tests</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableTests.slice(0, 4).map((test) => {
                const status = getTestStatus(test);
                return (
                  <div
                    key={test.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{test.test_code}</p>
                        <p className="text-sm text-slate-500">{test.duration_minutes} minutes</p>
                      </div>
                      <Badge variant={getStatusColor(status)} size="sm">{status}</Badge>
                    </div>
                    <Link to={`/test/${test.id}`}>
                      <Button size="sm" className="w-full">Start Test</Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Recent Attempts */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-white">Recent Activity</h3>
          <Link to="/tests">
            <Button variant="ghost" size="sm">View All</Button>
          </Link>
        </CardHeader>
        <CardBody>
          {attempts.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">No tests attempted yet</p>
              <p className="text-sm text-slate-400 mt-1">Complete tests to see your progress here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {attempts.slice(0, 5).map((attempt) => (
                <div key={attempt.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        Test #{attempt.test_id.slice(0, 8)}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Calendar className="w-4 h-4" />
                        {new Date(attempt.started_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {attempt.percentage?.toFixed(1)}%
                    </p>
                    <Badge variant={attempt.status === 'submitted' ? 'success' : 'warning'} size="sm">
                      {attempt.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
