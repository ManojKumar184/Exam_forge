import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiClient, getApiErrorMessage } from '../../api/client';

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const token = params.get('token') || '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/auth/accept-invitation', { token, fullName, password });
      window.location.assign('/dashboard');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">Invitation link is incomplete</h1><Link to="/login" className="mt-4 inline-block underline">Go to sign in</Link></main>;

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl border bg-white p-6 shadow dark:border-slate-700 dark:bg-slate-900"><h1 className="text-2xl font-semibold">Join your institution</h1><p className="text-sm text-slate-600 dark:text-slate-300">Accept the invitation to create or link your ExamForge account.</p>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<label className="block text-sm">Full name<input autoComplete="name" minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full rounded border p-2 dark:bg-slate-800" /></label><label className="block text-sm">Create a password (only for a new account)<input autoComplete="new-password" type="password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded border p-2 dark:bg-slate-800" /></label><button disabled={busy} className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60">{busy ? 'Accepting invitation…' : 'Accept invitation'}</button><Link to="/login" className="block text-center text-sm underline">Already have an account? Sign in first.</Link></form></main>;
}
