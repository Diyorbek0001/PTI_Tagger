import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReminderSettings, setOperationalSettings } from '@/services/reminder-settings';
import { requireWebRole } from '@/services/web-users';

const schema = z.object({ intervalDays: z.number().int().min(1).max(14).optional(), ptiCycleDays: z.number().int().min(1).max(31).optional(), ptiCycleAnchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).refine(value => value.intervalDays !== undefined || value.ptiCycleDays !== undefined || value.ptiCycleAnchorDate !== undefined);

export async function GET(request: Request) {
  const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']);
  if ('response' in auth) return auth.response;
  return NextResponse.json(await getReminderSettings());
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']);
    if ('response' in auth) return auth.response;
    const input = schema.parse(await request.json());
    await setOperationalSettings({ reminderIntervalDays: input.intervalDays, ptiCycleDays: input.ptiCycleDays, ptiCycleAnchorDate: input.ptiCycleAnchorDate }, auth.user.display_name);
    return NextResponse.json({ ok: true, ...(input.intervalDays !== undefined && { intervalDays: input.intervalDays }), ...(input.ptiCycleDays !== undefined && { ptiCycleDays: input.ptiCycleDays }), ...(input.ptiCycleAnchorDate !== undefined && { ptiCycleAnchorDate: input.ptiCycleAnchorDate }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update automatic reminder settings.' }, { status: 400 });
  }
}
