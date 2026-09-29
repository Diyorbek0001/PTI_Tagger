import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReminderSettings, setAutomaticReminderInterval } from '@/services/reminder-settings';
import { requireWebRole } from '@/services/web-users';

const schema = z.object({ intervalDays: z.number().int().min(1).max(14) });

export async function GET(request: Request) {
  const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']);
  if ('response' in auth) return auth.response;
  return NextResponse.json(await getReminderSettings());
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']);
    if ('response' in auth) return auth.response;
    const { intervalDays } = schema.parse(await request.json());
    await setAutomaticReminderInterval(intervalDays, auth.user.display_name);
    return NextResponse.json({ ok: true, intervalDays });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update automatic reminder settings.' }, { status: 400 });
  }
}
