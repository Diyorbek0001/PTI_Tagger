import { NextResponse } from 'next/server';
import { notifyAllMissing } from '@/services/pti-notifications';
import { logAudit,requestIp,webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';

export async function POST(request:Request) {
  try {
    const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;
    const result = await notifyAllMissing(auth.user.display_name);
    await logAudit({actor:webActor(auth.user),action:'BULK_REMINDER_SENT',entityType:'REMINDER',description:`Bulk PTI reminder completed: ${result.notified} sent`,metadata:{notified:result.notified,failed:result.failed.length},ipAddress:requestIp(request)});
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send reminders.' }, { status: 500 });
  }
}
