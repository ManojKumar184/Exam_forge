import { useCallback, useEffect, useState } from 'react';
import { apiClient, getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

type MemberRow = { _id: string; role: string; status: string; userId?: { _id: string; email: string; fullName: string; role: string } };
type InvitationRow = { _id: string; email: string; role: string; status: string; expiresAt: string };

export function InstitutionMembersPage() {
  const { profile } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'FACULTY' | 'STUDENT'>('FACULTY');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [memberResponse, invitationResponse] = await Promise.all([
        apiClient.get('/institutions/members'), apiClient.get('/institutions/invitations'),
      ]);
      setMembers(memberResponse.data.data);
      setInvitations(invitationResponse.data.data);
    } catch (cause) { setError(getApiErrorMessage(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setPreviewUrl('');
    try {
      const response = await apiClient.post('/institutions/invitations', { email, role });
      setPreviewUrl(response.data.data.developmentUrl || 'Invitation sent by the configured email provider.');
      setEmail(''); await load();
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(false); }
  };

  const updateMember = async (member: MemberRow, patch: { status?: string; role?: string }) => {
    if (!member.userId) return;
    setError('');
    try { await apiClient.patch(`/institutions/members/${member.userId._id}`, patch); await load(); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
  };

  const revoke = async (id: string) => {
    try { await apiClient.delete(`/institutions/invitations/${id}`); await load(); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
  };

  if (profile?.role === 'student') return <p className="p-6">Institution administrator access required.</p>;
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><header><h1 className="text-2xl font-semibold">Institution members</h1><p className="mt-1 text-sm text-slate-600">Invite faculty and students, then manage their institution access.</p></header>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {previewUrl && <p className="break-all rounded bg-emerald-50 p-3 text-sm text-emerald-800">{previewUrl.startsWith('http') ? <>Development invite link: <a className="underline" href={previewUrl}>{previewUrl}</a></> : previewUrl}</p>}
    <form onSubmit={invite} className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><label className="min-w-64 flex-1 text-sm">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border p-2 dark:bg-slate-800" /></label><label className="text-sm">Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)} className="mt-1 block rounded border p-2 dark:bg-slate-800"><option value="FACULTY">Faculty</option><option value="STUDENT">Student</option></select></label><button disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60">{busy ? 'Sending…' : 'Invite member'}</button></form>
    <section className="overflow-hidden rounded-xl border bg-white dark:border-slate-700 dark:bg-slate-900"><h2 className="border-b p-4 font-semibold">Members</h2><div className="divide-y">{members.map((member) => <div key={member._id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{member.userId?.fullName || member.userId?.email || 'Member'}</p><p className="text-sm text-slate-500">{member.userId?.email} · {member.role} · {member.status}</p></div><div className="flex gap-2">{member.role !== 'INSTITUTION_ADMIN' && <select aria-label="Member role" value={member.role} onChange={(event) => void updateMember(member, { role: event.target.value })} className="rounded border p-2 text-sm dark:bg-slate-800"><option value="FACULTY">Faculty</option><option value="STUDENT">Student</option></select>}<button onClick={() => void updateMember(member, { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })} className="rounded border px-3 py-2 text-sm">{member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button></div></div>)}{!members.length && <p className="p-4 text-sm text-slate-500">No members yet.</p>}</div></section>
    <section className="overflow-hidden rounded-xl border bg-white dark:border-slate-700 dark:bg-slate-900"><h2 className="border-b p-4 font-semibold">Invitations</h2><div className="divide-y">{invitations.map((invitation) => <div key={invitation._id} className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">{invitation.email} · {invitation.role} · {invitation.status}</p>{invitation.status === 'PENDING' && <button onClick={() => void revoke(invitation._id)} className="rounded border px-3 py-2 text-sm">Revoke</button>}</div>)}{!invitations.length && <p className="p-4 text-sm text-slate-500">No invitations.</p>}</div></section>
  </main>;
}
