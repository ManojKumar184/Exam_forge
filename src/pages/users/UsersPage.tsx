import { useEffect, useState } from 'react';
import { useDataStore } from '../../stores/dataStore';
import { Card, Button, Badge, Input, Select, Loading, EmptyState } from '../../components/ui';
import { Users, Search } from 'lucide-react';
import type { Profile } from '../../types';

export function UsersPage() {
  const { users, fetchUsers, updateUser, deleteUser } = useDataStore();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const handleDeleteUser = async (user: Profile) => {
    if (confirm(`Are you sure you want to delete user ${user.full_name || user.email}?`)) {
      const res = await deleteUser(user.id);
      if (res?.error) {
        alert(typeof res.error === 'string' ? res.error : (res.error as any).message || 'Failed to delete user');
      } else {
        fetchUsers({ search: search || undefined, role: roleFilter || undefined });
      }
    }
  };

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

  const handleApprove = async (user: Profile) => {
    await updateUser(user.id, { approval_status: 'approved', is_active: true });
    fetchUsers({ search: search || undefined, role: roleFilter || undefined });
  };

  const handleReject = async (user: Profile) => {
    await updateUser(user.id, { approval_status: 'rejected', is_active: false });
    fetchUsers({ search: search || undefined, role: roleFilter || undefined });
  };

  const toggleActive = async (user: Profile) => {
    await updateUser(user.id, { is_active: !user.is_active });
    fetchUsers({ search: search || undefined, role: roleFilter || undefined });
  };

  const roleBadge = (role: string) => {
    if (role === 'super_admin') return 'error';
    if (role === 'faculty') return 'info';
    return 'success';
  };

  const approvalBadge = (status: string) => {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'error';
    return 'warning';
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
              <div key={user.id} className="flex items-center gap-4 px-6 py-4 flex-wrap sm:flex-nowrap">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center font-semibold text-slate-600 dark:text-slate-200">
                  {user.full_name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate">
                    {user.full_name || 'Unnamed'}
                  </p>
                  <p className="text-sm text-slate-500 truncate">{user.email}</p>
                  {user.school_institute && (
                    <p className="text-xs text-slate-400 truncate">{user.school_institute}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={roleBadge(user.role)} size="sm">
                    {user.role.replace('_', ' ')}
                  </Badge>
                  {user.role === 'faculty' && (
                    <Badge variant={approvalBadge(user.approval_status)} size="sm">
                      {user.approval_status.toUpperCase()}
                    </Badge>
                  )}
                  <Badge variant={user.is_active ? 'success' : 'default'} size="sm">
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {user.role === 'faculty' && user.approval_status === 'pending' ? (
                    <>
                      <Button variant="primary" size="sm" onClick={() => handleApprove(user)}>
                        Approve
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleReject(user)}>
                        Reject
                      </Button>
                    </>
                  ) : user.role === 'faculty' && user.approval_status === 'rejected' ? (
                    <Button variant="outline" size="sm" onClick={() => handleApprove(user)}>
                      Approve
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => toggleActive(user)}>
                      {user.is_active ? 'Suspend' : 'Activate'}
                    </Button>
                  )}
                  {user.role !== 'super_admin' && (
                    <Button variant="danger" size="sm" onClick={() => handleDeleteUser(user)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
