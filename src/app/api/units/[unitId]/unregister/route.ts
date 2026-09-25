import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
export async function POST(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try { const { unitId } = await params; await db.query('select unregister_unit($1,$2)', [unitId, 'local-admin']); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to unregister' }, { status: 400 }); }
}
