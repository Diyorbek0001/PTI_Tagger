'use client';

import { useEffect, useState } from 'react';
import { defectSeverities, defectStatuses, severityLabels, statusLabels } from '@/lib/fleet-constants';
import { canManage, useCurrentUser } from '@/lib/use-current-user';
import { Severity } from '@/components/defects-page';

type Data = { defect: any; timeline: any[]; repeatIssues: any[] };

export function DefectDetail({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const user = useCurrentUser();
  const mayManage = canManage(user)&&Boolean(data&&(user?.role==='SUPERADMIN'||user?.companyAccess?.some(access=>access.company_name===data.defect.company&&access.can_edit)));
  const load = () => void fetch(`/api/defects/${id}`).then(async response => {
    const body = await response.json();
    response.ok ? setData(body) : setError(body.error);
  });

  useEffect(load, [id]);
  if (error) return <p className="text-red-300">{error}</p>;
  if (!data) return <p className="text-slate-400">Loading defect…</p>;
  const d = data.defect;
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/defects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ severity: form.get('severity'), status: form.get('status'), assignedTo: form.get('assignedTo') || null, resolutionNotes: form.get('resolutionNotes') || null }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) setError(body.error); else load();
  };

  return <>
    <a href="/defects" className="text-blue-400">← All defects</a>
    <header className="mt-5 flex flex-wrap items-center gap-4"><div><p className="font-mono text-blue-400">{d.defect_reference}</p><h1 className="text-3xl font-bold">Unit {d.unit_number} · {d.category}</h1></div><Severity value={d.severity} /></header>
    {data.repeatIssues.map(issue => <div key={issue.category} className="mt-5 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-amber-200">⚠ Repeat Issue — Unit {issue.unit_number} has {issue.occurrences} {issue.category} defects in the last 8 weeks.</div>)}
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-800 bg-[#15191f] p-5"><h2 className="text-lg font-bold">Defect details</h2><dl className="mt-4 grid grid-cols-[9rem_1fr] gap-3 text-sm"><dt className="text-slate-500">Description</dt><dd>{d.description}</dd><dt className="text-slate-500">Driver</dt><dd>{d.driver_name_snapshot || d.driver_username_snapshot || 'Unknown'}</dd><dt className="text-slate-500">PTI</dt><dd>PTI-{String(d.pti_number).padStart(6, '0')}</dd><dt className="text-slate-500">Created</dt><dd>{new Date(d.created_at).toLocaleString()}</dd><dt className="text-slate-500">Created by</dt><dd>{d.created_by}</dd></dl></section>
      {mayManage ? <form onSubmit={save} className="rounded-xl border border-slate-800 bg-[#15191f] p-5"><h2 className="text-lg font-bold">Maintenance update</h2><label className="mt-4 block text-sm text-slate-400">Severity<select name="severity" defaultValue={d.severity} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">{defectSeverities.map(value => <option key={value} value={value}>{severityLabels[value]}</option>)}</select></label><label className="mt-3 block text-sm text-slate-400">Status<select name="status" defaultValue={d.status} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2">{defectStatuses.map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><label className="mt-3 block text-sm text-slate-400">Assigned to<input name="assignedTo" defaultValue={d.assigned_to || ''} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" /></label><label className="mt-3 block text-sm text-slate-400">Resolution notes<textarea name="resolutionNotes" defaultValue={d.resolution_notes || ''} className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 p-2" /></label><button disabled={busy} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 font-semibold">{busy ? 'Saving…' : 'Save changes'}</button></form> : <section className="rounded-xl border border-slate-800 bg-[#15191f] p-5"><h2 className="text-lg font-bold">Maintenance update</h2><p className="mt-4 text-sm text-slate-400">Viewer access is read-only. An admin can update severity, assignment, status, or resolution notes.</p><dl className="mt-4 grid grid-cols-[9rem_1fr] gap-3 text-sm"><dt className="text-slate-500">Assigned to</dt><dd>{d.assigned_to || 'Unassigned'}</dd><dt className="text-slate-500">Status</dt><dd>{statusLabels[d.status as keyof typeof statusLabels] || d.status}</dd><dt className="text-slate-500">Resolution</dt><dd>{d.resolution_notes || 'No resolution notes.'}</dd></dl></section>}
    </div>
    <section className="mt-6 rounded-xl border border-slate-800 bg-[#15191f] p-5"><h2 className="text-lg font-bold">Activity timeline</h2><div className="mt-4 space-y-3">{data.timeline.map(item => <div key={item.id} className="border-l border-slate-700 pl-3"><p>{item.description}</p><p className="text-xs text-slate-500">{new Date(item.occurred_at).toLocaleString()} · {item.actor_display_name || item.actor_type}</p></div>)}</div></section>
  </>;
}
