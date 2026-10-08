import { NextResponse } from 'next/server';
import { getRangeReport, reportCsv } from '@/services/reporting';
import { getCurrentPtiCycle } from '@/services/reminder-settings';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const current = await getCurrentPtiCycle();
    const startDate = params.get('start') || current.start;
    const endDate = params.get('end') || current.end;
    const company = params.get('company') || undefined;
    if (!datePattern.test(startDate) || !datePattern.test(endDate) || startDate > endDate) return NextResponse.json({ error: 'Choose a valid start and end date.' }, { status: 400 });
    const report = await getRangeReport(startDate, endDate, company);
    if (params.get('format') === 'csv') return new NextResponse(reportCsv(report), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="pti-report-${startDate}-to-${endDate}.csv"` } });
    return NextResponse.json(report);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to build report' }, { status: 500 }); }
}
