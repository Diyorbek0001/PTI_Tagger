import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReminderSettings, setOperationalSettings } from '@/services/reminder-settings';
import { requireWebRole } from '@/services/web-users';
import { canAccessCompany } from '@/services/company-access';

const schema = z.object({ company: z.string().trim().min(1).max(120), reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), ptiCycleDays: z.number().int().min(1).max(31).optional() }).refine(value => value.reminderTime !== undefined || value.ptiCycleDays !== undefined);

export async function GET(request: Request) {
  const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']);
  if ('response' in auth) return auth.response;
  const company = new URL(request.url).searchParams.get('company') || '';
  if (!company || !await canAccessCompany(auth.user.id, auth.user.role, company, 'view')) return NextResponse.json({ error: 'You do not have access to that company.' }, { status: 403 });
  return NextResponse.json(await getReminderSettings(company));
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireWebRole(request, ['ADMIN', 'SUPERADMIN']);
    if ('response' in auth) return auth.response;
    const input = schema.parse(await request.json());
    if (!await canAccessCompany(auth.user.id, auth.user.role, input.company, 'edit')) return NextResponse.json({ error: 'You do not have edit access to that company.' }, { status: 403 });
    await setOperationalSettings({ company: input.company, reminderTime: input.reminderTime, ptiCycleDays: input.ptiCycleDays }, auth.user.display_name);
    return NextResponse.json({ ok: true, ...(input.reminderTime !== undefined && { reminderTime: input.reminderTime }), ...(input.ptiCycleDays !== undefined && { ptiCycleDays: input.ptiCycleDays }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update automatic reminder settings.' }, { status: 400 });
  }
}
