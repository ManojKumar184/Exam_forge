import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDataStore } from '../../stores/dataStore';
import { fetchTestLeaderboardApi } from '../../api/tests';
import { Card, Select, Loading, Badge, PageHeader, DataTable } from '../../components/ui';
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
      <PageHeader title="Leaderboard" subtitle="Rankings for completed test attempts" />

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
      ) : (
        <DataTable
          headers={[
            { label: 'Rank', align: 'center', className: 'w-16' },
            { label: 'Student' },
            { label: 'Time Spent', className: 'w-32' },
            { label: 'Score', align: 'right', className: 'w-28' }
          ]}
          isLoading={isLoading}
          emptyMessage="No rankings yet"
        >
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3.5 text-center">
                <div className="flex justify-center">{rankIcon(entry.rank)}</div>
              </td>
              <td className="px-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">
                    {entry.profile?.full_name || 'Student'}
                  </p>
                  {entry.profile?.email && (
                    <p className="text-xs text-slate-550 truncate mt-0.5">
                      {entry.profile.email}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-4 py-3.5">
                <p className="text-sm text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(entry.time_spent_seconds)}
                </p>
              </td>
              <td className="px-4 py-3.5 text-right">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {entry.score} pts
                </p>
                <Badge size="sm" variant="success" className="mt-1">
                  {entry.percentage.toFixed(1)}%
                </Badge>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
