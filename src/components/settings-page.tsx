'use client';
import { useEffect, useState } from 'react';

type Settings = { pti_cycle_days: number; pti_cycle_anchor_date: string; auto_reminder_interval_days: number };

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ pti_cycle_days: 7, pti_cycle_anchor_date: '2026-10-05', auto_reminder_interval_days: 2 });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => { void fetch('/api/reminder-settings').then(async response => { const body = await response.json(); if (response.ok) setSettings({ ...body, pti_cycle_anchor_date: new Date(body.pti_cycle_anchor_date).toISOString().slice(0,10) }); else setError(body.error || 'Unable to load settings.'); }); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try {
      const response = await fetch('/api/reminder-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ptiCycleDays: settings.pti_cycle_days, ptiCycleAnchorDate: settings.pti_cycle_anchor_date, intervalDays: settings.auto_reminder_interval_days }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to save settings.');
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save settings.'); }
    finally { setBusy(false); }
  };
  return <>
    <header className="mb-8"><p className="text-sm font-semibold text-blue-400">Fleet configuration</p><h1 className="text-3xl font-bold text-white">Settings</h1><p className="mt-2 text-slate-400">Control the PTI submission cycle and automatic reminder frequency.</p></header>
    <form onSubmit={save} className="space-y-5">
      <section className="rounded-xl border border-slate-800 bg-[#15191f] p-5 sm:p-6"><h2 className="text-xl font-semibold">PTI submission cycle</h2><p className="mt-1 text-sm text-slate-400">Each unit is expected to submit one PTI per cycle. Choose the cycle length and the date its schedule begins.</p><div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-300">Cycle length (days)<input type="number" min="1" max="31" required value={settings.pti_cycle_days} onChange={event => setSettings(value => ({ ...value, pti_cycle_days: Number(event.target.value) }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0f1216] px-3 py-2 text-white"/><span className="mt-1 block text-xs text-slate-500">1–31 days. Default: 7 days.</span></label><label className="text-sm font-medium text-slate-300">Cycle start date<input type="date" required value={settings.pti_cycle_anchor_date} onChange={event => setSettings(value => ({ ...value, pti_cycle_anchor_date: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0f1216] px-3 py-2 text-white"/><span className="mt-1 block text-xs text-slate-500">Sets the repeating cycle boundary.</span></label></div></section>
      <section className="rounded-xl border border-slate-800 bg-[#15191f] p-5 sm:p-6"><h2 className="text-xl font-semibold">Automatic reminder cycle</h2><p className="mt-1 text-sm text-slate-400">For registered units with Auto-send enabled, repeat reminders while their PTI is missing for the current cycle.</p><label className="mt-5 block max-w-sm text-sm font-medium text-slate-300">Remind every (days)<input type="number" min="1" max="14" required value={settings.auto_reminder_interval_days} onChange={event => setSettings(value => ({ ...value, auto_reminder_interval_days: Number(event.target.value) }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-[#0f1216] px-3 py-2 text-white"/><span className="mt-1 block text-xs text-slate-500">1–14 days. Manual reminders remain available from Assigned Units.</span></label></section>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}{saved && <p role="status" className="text-sm text-emerald-300">Settings saved.</p>}
      <button disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50">{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
  </>;
}
