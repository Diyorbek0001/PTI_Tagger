import { NextResponse } from 'next/server';
import { notifyUnit } from '@/services/pti-notifications';
import { requireWebRole } from '@/services/web-users';
import { canAccessUnit } from '@/services/company-access';

export async function POST(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try {
    const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;
    const { unitId } = await params;
    if(!await canAccessUnit(auth.user.id,auth.user.role,unitId,'edit'))return NextResponse.json({error:'You do not have edit access to this company.'},{status:403});
    await notifyUnit(unitId, 'manual', auth.user.display_name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send reminder.' }, { status: 400 });
  }
}
