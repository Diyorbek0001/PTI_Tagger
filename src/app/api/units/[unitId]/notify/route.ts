import { NextResponse } from 'next/server';
import { notifyUnit } from '@/services/pti-notifications';

export async function POST(_request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try {
    const { unitId } = await params;
    await notifyUnit(unitId, 'manual', 'website');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send reminder.' }, { status: 400 });
  }
}
