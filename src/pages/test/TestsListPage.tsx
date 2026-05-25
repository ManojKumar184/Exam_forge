import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDataStore } from '../../stores/dataStore';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Badge, Loading, EmptyState, Input } from '../../components/ui';
import { PlayCircle, Clock, Calendar, CheckCircle, Search, Plus } from 'lucide-react';
import type { OnlineTest } from '../../types';

export function TestsListPage() {
  const navigate = useNavigate();
  const { profile, isAdmin, isFaculty, isStudent } = useAuth();
  const { onlineTests, fetchOnlineTests, fetchTestAttempts, testAttempts, isLoading } = useDataStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchOnlineTests();
    if (isStudent) {
      fetchTestAttempts();
    }
  }, [profile?.id]);

  const filteredTests = onlineTests.filter((test) => {
    if (searchTerm && !test.test_code.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (statusFilter && test.status !== statusFilter) return false;
    return true;
  });

  const getTestStatus = (test: OnlineTest) => {
    const now = new Date();
    const start = test.start_time ? new Date(test.start_time) : null;
    const end = test.end_time ? new Date(test.end_time) : null;

    if (test.status !== 'active') return test.status;
    if (!start || now < start) return 'scheduled';
    if (end && now > end) return 'completed';
    return 'active';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'scheduled': return 'warning';
      case 'completed': return 'default';
      case 'draft': return 'default';
      default: return 'default';
    }
  };

  const hasAttempted = (testId: string) => {
    return testAttempts.some(a => a.test_id === testId && a.status !== 'in_progress');
  };

  if (isLoading) {
    return <Loading fullScreen text="Loading tests..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isStudent ? 'Available Tests' : 'Online Tests'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {filteredTests.length} tests found
          </p>
        </div>
        {(isAdmin || isFaculty) && (
          <Link to="/papers">
            <Button leftIcon={<Plus className="w-4 h-4" />}>Create Test from Paper</Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Input
          placeholder="Search tests..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Tests Grid */}
      {filteredTests.length === 0 ? (
        <EmptyState
          title="No tests found"
          description={isStudent ? "No tests available at the moment" : "Create a test from an exam paper"}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTests.map((test) => {
            const status = getTestStatus(test);
            const attempted = hasAttempted(test.id);

            return (
              <Card key={test.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{test.test_code}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {test.duration_minutes} minutes
                    </p>
                  </div>
                  <Badge variant={getStatusColor(status)}>{status}</Badge>
                </div>

                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                  {test.start_time && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Starts: {new Date(test.start_time).toLocaleString()}
                    </div>
                  )}
                  {test.end_time && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Ends: {new Date(test.end_time).toLocaleString()}
                    </div>
                  )}
                </div>

                {isStudent ? (
                  status === 'active' && !attempted ? (
                    <Button
                      className="w-full"
                      leftIcon={<PlayCircle className="w-4 h-4" />}
                      onClick={() => navigate(`/test/${test.id}`)}
                    >
                      Start Test
                    </Button>
                  ) : attempted ? (
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" className="w-full" disabled leftIcon={<CheckCircle className="w-4 h-4" />}>
                        Completed
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => navigate(`/test/${test.id}/review`)}
                      >
                        Review answers
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>
                      {status === 'scheduled' ? 'Not Started' : 'Closed'}
                    </Button>
                  )
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => navigate('/leaderboard', { state: { testId: test.id } })}
                  >
                    View leaderboard
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
