import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDataStore } from '../../stores/dataStore';
import { fetchTestLeaderboardApi } from '../../api/tests';
import { Card, Select, Loading, EmptyState, Badge } from '../../components/ui';
import { Trophy, Medal, Clock } from 'lucide-react';
import type { LeaderboardEntry } from '../../types';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function LeaderboardPage() {
  const location = useLocation();
  const preselectedTestId = (location.state as { testId?: string } | null)?.testId;
  const { onlineTests, fetchOnlineTests } = useDataStore();
  const [selectedTestId, setSelectedTestId] = useState(preselectedTestId || '');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOnlineTests();
  }, [fetchOnlineTests]);

  useEffect(() => {
    const loadLeaderboard = async () => {
      if (!selectedTestId) {
        setEntries([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const data = await fetchTestLeaderboardApi(selectedTestId);
        setEntries(data);
      } catch {
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadLeaderboard();
  }, [selectedTestId]);

  useEffect(() => {
    if (!selectedTestId && onlineTests.length > 0) {
      const completed = onlineTests.filter((t) => t.status === 'completed' || t.status === 'active');
      setSelectedTestId((completed[0] || onlineTests[0]).id);
    }
  }, [onlineTests, selectedTestId]);

  const rankIcon = (rank: number | null) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-amber-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="w-5 text-center text-sm font-medium text-slate-500">{rank}</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Leaderboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Rankings for completed test attempts
        </p>
      </div>

      <Card className="p-4">
        <Select
          label="Select test"
          options={onlineTests.map((t) => ({
            value: t.id,
            label: `${t.test_code} (${t.status})`,
          }))}
          value={selectedTestId}
          onChange={(e) => setSelectedTestId(e.target.value)}
          placeholder="Choose a test"
        />
      </Card>

      {isLoading ? (
        <Loading text="Loading rankings..." />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No rankings yet"
          description="Complete a test to populate the leaderboard"
          action={
            <Link to="/tests">
              <span className="text-blue-600 hover:underline text-sm font-medium">Browse tests</span>
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30"
              >
                <div className="w-8 flex justify-center">{rankIcon(entry.rank)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">
                    {entry.profile?.full_name || 'Student'}
                  </p>
                  {entry.profile?.email && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {entry.profile.email}
                    </p>
                  )}
                  <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDuration(entry.time_spent_seconds)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {entry.score} pts
                  </p>
                  <Badge size="sm" variant="success">
                    {entry.percentage.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
