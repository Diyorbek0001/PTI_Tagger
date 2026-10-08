'use client';
import { useEffect, useState } from 'react';

type PrintSection = 'summary'|'missing'|'lowCompliance'|'critical'|'repeatProblems'|'reassignments'|'defectSummary';
const printOptions: {key:PrintSection;label:string;description:string}[] = [
  {key:'summary',label:'Summary metrics',description:'Fleet totals and compliance summary'},
  {key:'missing',label:'Missing PTIs',description:'Units without a submission in the selected date range'},
  {key:'lowCompliance',label:'Low compliance',description:'Drivers below 80% across recent PTI cycles'},
  {key:'critical',label:'Critical defects',description:'Unresolved critical defects in the selected range'},
  {key:'repeatProblems',label:'Repeat problems',description:'Units with recurring defects'},
  {key:'reassignments',label:'Reassignments',description:'Driver/unit reassignments in the selected range'},
  {key:'defectSummary',label:'Defect summary',description:'Defects grouped by status, severity, and category'},
];
const allSelected = ():Record<PrintSection,boolean> => Object.fromEntries(printOptions.map(item=>[item.key,true])) as Record<PrintSection,boolean>;

export function ReportsPage(){
  const [start,setStart]=useState(''),[end,setEnd]=useState(''),[company,setCompany]=useState(''),[data,setData]=useState<any>(null),[error,setError]=useState('');
  const [loading,setLoading]=useState(true),[showPrintOptions,setShowPrintOptions]=useState(false),[printSections,setPrintSections]=useState<Record<PrintSection,boolean>>(allSelected);
  const load=async(from?:string,to?:string,companyName?:string)=>{
    setLoading(true);setError('');
    try{
      const params=new URLSearchParams();if(from&&to){params.set('start',from);params.set('end',to);}if(companyName)params.set('company',companyName);
      const response=await fetch(`/api/reports/weekly${params.size?`?${params}`:''}`),body=await response.json();
      if(!response.ok)throw new Error(body.error);setData(body);setStart(body.startDate);setEnd(body.endDate);setCompany(body.selectedCompany||'');
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to load report.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load()},[]);
  const apply=()=>{if(start&&end&&start<=end)void load(start,end,company)};
  const csvParams=new URLSearchParams({start,end,format:'csv',...(company?{company}:{})});
  const print=()=>{setShowPrintOptions(false);setTimeout(()=>window.print(),120);};
  const flip=(key:PrintSection)=>setPrintSections(value=>({...value,[key]:!value[key]}));
  const sectionClass=(key:PrintSection)=>printSections[key]?'':'print-hide-section';
  return <>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold text-blue-400">Management reporting</p><h1 className="text-3xl font-bold">PTI Report</h1><p className="mt-2 text-slate-400">Choose a company and date range for fleet activity and compliance.</p></div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-xs text-slate-400">Company<select aria-label="Filter report by company" value={company} onChange={event=>setCompany(event.target.value)} className="mt-1 block min-w-40 rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white"><option value="">All companies</option>{(data?.companies||[]).map((name:string)=><option value={name} key={name}>{name}</option>)}</select></label>
        <label className="text-xs text-slate-400">From<input aria-label="Report start date" type="date" value={start} onChange={event=>setStart(event.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white"/></label>
        <label className="text-xs text-slate-400">Through<input aria-label="Report end date" type="date" value={end} onChange={event=>setEnd(event.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white"/></label>
        <button disabled={!start||!end||start>end||loading} onClick={apply} className="rounded-lg bg-blue-600 px-4 py-2 disabled:opacity-50">{loading?'Loading…':'Apply filters'}</button>
        <a href={`/api/reports/weekly?${csvParams}`} className="rounded-lg border border-slate-700 px-4 py-2">Download CSV</a>
        <button onClick={()=>setShowPrintOptions(true)} className="rounded-lg bg-slate-800 px-4 py-2">Print / PDF</button>
      </div>
    </header>
    {error&&<p role="alert" className="text-red-300">{error}</p>}
    {data&&<>
      <p className="mb-5 text-slate-400">{data.selectedCompany?`Company: ${data.selectedCompany} · `:'All companies · '}Range: {data.startDate} through {data.endDate}</p>
      <section className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-5 ${sectionClass('summary')}`}>
        <Card label="Active units" value={data.summary.active_units}/><Card label="Expected" value={data.compliance.expected}/><Card label="Submitted" value={data.compliance.submitted}/><Card label="Missing" value={data.compliance.missing}/><Card label="Fleet compliance" value={data.compliance.score===null?'—':`${data.compliance.score}%`}/><Card label="Approved" value={data.reviews.approved}/><Card label="Resend requested" value={data.reviews.resend_requested}/><Card label="Defects opened" value={data.summary.defects_opened}/><Card label="Critical" value={data.summary.critical_defects} danger/><Card label="Resolved" value={data.summary.defects_resolved}/>
      </section>
      <Table className={sectionClass('missing')} title="Missing PTIs" heads={['Unit','Driver','Company','Last PTI','Last Notified','Group']} rows={data.missing.map((item:any)=>[item.unit_number,[item.driver_first_name,item.driver_last_name].filter(Boolean).join(' ')||item.driver_username||'Unknown',item.company,fmt(item.last_pti),fmt(item.last_notified),item.telegram_chat_title])}/>
      <Table className={sectionClass('lowCompliance')} title="Low compliance · last 8 PTI cycles" heads={['Driver','Score','Expected','Missing','Resends']} rows={data.lowCompliance.map((item:any)=>[[item.first_name,item.last_name].filter(Boolean).join(' ')||item.telegram_username||'Unknown',`${item.score}%`,item.expected,item.missing,item.resends])}/>
      <Table className={sectionClass('critical')} title="Critical defects" heads={['Defect','Unit','Driver','Category','Description','Status']} rows={data.critical.map((item:any)=>[`DEF-${String(item.defect_number).padStart(6,'0')}`,item.unit_number,item.driver_name_snapshot||item.driver_username_snapshot||'Unknown',item.category,item.description,item.status])}/>
      <Table className={sectionClass('repeatProblems')} title="Repeat problems" heads={['Unit','Company','Category','Occurrences','First','Latest']} rows={data.repeatIssues.map((item:any)=>[item.unit_number,item.company,item.category,item.occurrences,fmt(item.first_occurrence),fmt(item.latest_occurrence)])}/>
      <Table className={sectionClass('reassignments')} title="Reassignments" heads={['Unit','Driver','Company','Date','Reason']} rows={data.reassignments.map((item:any)=>[item.unit_number,[item.driver_first_name,item.driver_last_name].filter(Boolean).join(' ')||item.driver_username,item.company,fmt(item.created_at),item.reason||'—'])}/>
      <Table className={sectionClass('defectSummary')} title="Defect summary" heads={['Status','Severity','Category','Count']} rows={data.defectBreakdown.map((item:any)=>[item.status,item.severity,item.category,item.count])}/>
    </>}
    {showPrintOptions&&<div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4 print:hidden" role="dialog" aria-modal="true" aria-labelledby="print-options-title"><div className="w-full max-w-lg rounded-xl border border-slate-700 bg-[#171b21] p-6 shadow-2xl"><h2 id="print-options-title" className="text-xl font-bold">Choose PDF contents</h2><p className="mt-1 text-sm text-slate-400">Select the sections to include in the printed report.</p><div className="mt-5 space-y-3">{printOptions.map(item=><label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 p-3 hover:bg-slate-900"><input type="checkbox" checked={printSections[item.key]} onChange={()=>flip(item.key)} className="mt-1 accent-blue-500"/><span><span className="block text-sm font-semibold text-slate-100">{item.label}</span><span className="text-xs text-slate-400">{item.description}</span></span></label>)}</div><div className="mt-6 flex justify-between gap-3"><button onClick={()=>setPrintSections(allSelected())} className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Select all</button><div className="flex gap-3"><button onClick={()=>setShowPrintOptions(false)} className="rounded-lg border border-slate-700 px-4 py-2">Cancel</button><button disabled={!Object.values(printSections).some(Boolean)} onClick={print} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold disabled:opacity-50">Continue to print</button></div></div></div></div>}
  </>;
}

function Card({label,value,danger=false}:{label:string;value:string|number;danger?:boolean}){return <div className={`rounded-xl border bg-[#15191f] p-4 ${danger&&Number(value)?'border-red-700':'border-slate-800'}`}><p className="text-xs text-slate-400">{label}</p><p className={`text-2xl font-bold ${danger&&Number(value)?'text-red-400':''}`}>{value}</p></div>}
function Table({title,heads,rows,className=''}:{title:string;heads:string[];rows:any[][];className?:string}){return <section className={`mt-8 break-inside-avoid ${className}`}><h2 className="mb-3 text-xl font-bold">{title}</h2><div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#15191f]"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-slate-400"><tr>{heads.map(head=><th className="p-3" key={head}>{head}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index} className="border-t border-slate-800">{row.map((cell,cellIndex)=><td className="p-3" key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="p-5 text-slate-500">No records for this section.</p>}</div></section>}
function fmt(value:string|null){return value?new Date(value).toLocaleString():'Never'}
