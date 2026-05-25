import { useEffect, useState } from 'react';
import { useDataStore } from '../../stores/dataStore';
import { Card, Button, Badge, Input, Select, Loading, EmptyState } from '../../components/ui';
import { Users, Search } from 'lucide-react';
import type { Profile } from '../../types';

export function UsersPage() {
  const { users, fetchUsers, updateUser } = useDataStore();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await fetchUsers({
        search: search || undefined,
        role: roleFilter || undefined,
      });
      setIsLoading(false);
    };
    const timer = setTimeout(load, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [search, roleFilter]);

  const toggleActive = async (user: Profile) => {
    await updateUser(user.id, { is_active: !user.is_active });
    fetchUsers({ search: search || undefined, role: roleFilter || undefined });
  };

  const roleBadge = (role: string) => {
    if (role === 'super_admin') return 'error';
    if (role === 'faculty') return 'info';
    return 'success';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Users</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage platform accounts</p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <Input
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
          className="max-w-xs"
        />
        <Select
          placeholder="All roles"
          options={[
            { value: '', label: 'All roles' },
            { value: 'super_admin', label: 'Admin' },
            { value: 'faculty', label: 'Faculty' },
            { value: 'student', label: 'Student' },
          ]}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-40"
        />
      </div>

      {isLoading ? (
        <Loading text="Loading users..." />
      ) : users.length === 0 ? (
        <EmptyState icon={<Users className="w-12 h-12" />} title="No users found" />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {users.map((user) => (
              <div key={user.id} className="flex items-center gap-4 px-6 py-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center font-semibold text-slate-600 dark:text-slate-200">
                  {user.full_name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">
                    {user.full_name || 'Unnamed'}
                  </p>
                  <p className="text-sm text-slate-500 truncate">{user.email}</p>
                </div>
                <Badge variant={roleBadge(user.role)} size="sm">
                  {user.role.replace('_', ' ')}
                </Badge>
                <Badge variant={user.is_active ? 'success' : 'default'} size="sm">
                  {user.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => toggleActive(user)}>
                  {user.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
