import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDataStore } from '../../stores/dataStore';
import { fetchFacultyAnalyticsApi } from '../../api/analytics';
import { Card, CardHeader, CardBody, StatCard, Button, Badge, Loading } from '../../components/ui';
import { FileText, FileQuestion, Users, TrendingUp, Plus, Clock, Calendar } from 'lucide-react';

export function FacultyDashboard() {
  const { profile } = useAuth();
  const { fetchPapers, fetchOnlineTests, papers, onlineTests, isLoading } = useDataStore();
  const [facultyStats, setFacultyStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchPapers(), fetchOnlineTests()]);
      try {
        const stats = await fetchFacultyAnalyticsApi();
        setFacultyStats(stats);
      } catch {
        setFacultyStats(null);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return <Loading fullScreen text="Loading dashboard..." />;
  }

  const myPapers = papers.slice(0, 5);
  const myTests = onlineTests.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome, {profile?.full_name?.split(' ')[0] || 'Faculty'}!
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage your question papers and online tests.
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/papers/new">
            <Button leftIcon={<Plus className="w-4 h-4" />}>Create Paper</Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Papers Created"
          value={papers.length}
          subtitle="Total generated"
          icon={<FileText className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Online Tests"
          value={onlineTests.length}
          subtitle="Active tests"
          icon={<FileQuestion className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Total Attempts"
          value={facultyStats?.total_attempts ?? 0}
          subtitle="Student attempts"
          icon={<Users className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="Avg. Score"
          value={`${facultyStats?.average_score ?? 0}%`}
          subtitle="Overall average"
          icon={<TrendingUp className="w-6 h-6" />}
          color="slate"
        />
      </div>

      {/* Papers and Tests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">My Papers</h3>
            <Link to="/papers">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardBody>
            {myPapers.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 dark:text-slate-400">No papers created yet</p>
                <Link to="/papers/new">
                  <Button variant="outline" size="sm" className="mt-3">
                    Create First Paper
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {myPapers.map((paper) => (
                  <div key={paper.id} className="py-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">{paper.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-slate-500">{paper.subject?.name || 'N/A'}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-sm text-slate-500">Class {paper.class}</span>
                        </div>
                      </div>
                      <Badge variant={paper.status === 'published' ? 'success' : 'default'} size="sm">
                        {paper.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">Online Tests</h3>
            <Link to="/tests">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardBody>
            {myTests.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 dark:text-slate-400">No online tests created</p>
                <Link to="/tests">
                  <Button variant="outline" size="sm" className="mt-3">
                    Create Test
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {myTests.map((test) => (
                  <div key={test.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {test.test_code}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Calendar className="w-4 h-4" />
                        {test.duration_minutes} mins
                      </div>
                    </div>
                    <Badge variant={test.status === 'active' ? 'success' : 'default'} size="sm">
                      {test.status}
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
