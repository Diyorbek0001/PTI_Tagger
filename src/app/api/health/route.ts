import { NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function GET() {
  try {
    const { rows } = await db.query(`select
      to_regclass('public.units') is not null as units_ready,
      to_regclass('public.unit_registrations') is not null as registrations_ready,
      to_regclass('public.pti_submissions') is not null as submissions_ready`);
    const schema = rows[0] as { units_ready: boolean; registrations_ready: boolean; submissions_ready: boolean };
    if (!schema.units_ready || !schema.registrations_ready || !schema.submissions_ready) {
      return NextResponse.json({ status: 'unhealthy', database: 'connected', schema: 'missing' }, { status: 503 });
    }
    return NextResponse.json({ status: 'healthy', database: 'connected', schema: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json({ status: 'unhealthy', database: 'disconnected' }, { status: 503 });
  }
}
