import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDataStore } from '../../stores/dataStore';
import { fetchTestLeaderboardApi } from '../../api/tests';
import { Card, Select, Loading, Badge, PageHeader, DataTable, Input } from '../../components/ui';
import { Trophy, Medal, Clock, Search } from 'lucide-react';
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
  const [testSearch, setTestSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  useEffect(() => {
    fetchOnlineTests();
  }, [fetchOnlineTests]);

  const filteredTests = onlineTests.filter((t) => {
    if (!testSearch.trim()) return true;
    const term = testSearch.toLowerCase();
    const codeMatch = t.test_code?.toLowerCase().includes(term);
    const titleMatch = t.paper?.title?.toLowerCase().includes(term);
    return codeMatch || titleMatch;
  });

  useEffect(() => {
    if (testSearch.trim() && filteredTests.length > 0) {
      const isCurrentInFiltered = filteredTests.some(t => t.id === selectedTestId);
      if (!isCurrentInFiltered) {
        setSelectedTestId(filteredTests[0].id);
      }
    }
  }, [testSearch, filteredTests, selectedTestId]);

  const filteredEntries = entries.filter((entry) => {
    if (!studentSearch.trim()) return true;
    const term = studentSearch.toLowerCase();
    const nameMatch = entry.profile?.full_name?.toLowerCase().includes(term);
    const emailMatch = entry.profile?.email?.toLowerCase().includes(term);
    return nameMatch || emailMatch;
  });

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <Input
            label="Search Test Code/Title"
            placeholder="Search test..."
            value={testSearch}
            onChange={(e) => setTestSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-slate-400" />}
            className="py-1 text-sm"
          />
          <Select
            label="Select test"
            options={filteredTests.map((t) => ({
              value: t.id,
              label: `${t.test_code} ${t.paper?.title ? `(${t.paper.title})` : ''} (${t.status})`,
            }))}
            value={selectedTestId}
            onChange={(e) => setSelectedTestId(e.target.value)}
            placeholder="Choose a test"
            className="py-1 text-sm"
          />
        </Card>

        <Card className="p-4 flex flex-col justify-end">
          <Input
            label="Search Student Name or Email"
            placeholder="Search student..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-slate-400" />}
            className="py-1 text-sm"
          />
        </Card>
      </div>

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
          {filteredEntries.map((entry) => (
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
