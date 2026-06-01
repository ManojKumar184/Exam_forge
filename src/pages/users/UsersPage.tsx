import { useEffect, useState } from 'react';
import { useDataStore } from '../../stores/dataStore';
import { Button, Badge, Input, Select, Loading, PageHeader, DataTable } from '../../components/ui';
import { Search } from 'lucide-react';
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
      <PageHeader title="Users" subtitle="Manage platform accounts" />

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
      ) : (
        <DataTable
          headers={[
            { label: 'User' },
            { label: 'Role & Status' },
            { label: 'Actions', align: 'right' }
          ]}
          isLoading={isLoading}
          emptyMessage="No users found"
        >
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                    {user.full_name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">
                      {user.full_name || 'Unnamed'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    {user.school_institute && (
                      <p className="text-[11px] text-slate-400 truncate">{user.school_institute}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
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
              </td>
              <td className="px-4 py-4 text-right">
                <div className="flex gap-2 justify-end">
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
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
