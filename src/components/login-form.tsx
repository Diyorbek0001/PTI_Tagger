'use client';

import { useState } from 'react';

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.error ?? 'Unable to sign in.');
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.assign(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
  }

  return <form onSubmit={submit} className="mt-8 space-y-5">
    <label className="block text-sm font-medium text-slate-300">Username<input autoFocus required autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0d1117] px-4 py-3 text-white placeholder:text-slate-600" placeholder="Admin username" /></label>
    <label className="block text-sm font-medium text-slate-300">Password<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0d1117] px-4 py-3 text-white placeholder:text-slate-600" placeholder="••••••••••••" /></label>
    {error && <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>}
    <button disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500">{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>;
}
