import { NextResponse } from 'next/server';
import { notifyUnit } from '@/services/pti-notifications';
import { requireWebRole } from '@/services/web-users';

export async function POST(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try {
    const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;
    const { unitId } = await params;
    await notifyUnit(unitId, 'manual', auth.user.display_name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send reminder.' }, { status: 400 });
  }
}
