import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { z } from 'zod';

const createUnitSchema = z.object({
  unitNumber: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, or hyphens only'),
  company: z.string().trim().min(1).max(120),
});

export async function GET() {
  try {
    const { rows } = await db.query(`select u.*,
      coalesce(registrations.items, '[]'::json) as unit_registrations,
      pti.last_pti_at,
      coalesce(pti.sent_this_week, false) as pti_sent_this_week,
      notifications.last_notified_at
      from units u
      left join lateral (
        select json_agg(r order by r.registered_at desc) as items
        from unit_registrations r where r.unit_id=u.id
      ) registrations on true
      left join lateral (
        select max(s.created_at) filter (where s.status not in ('processing','failed')) as last_pti_at,
          bool_or(s.created_at >= date_trunc('week', now()) and s.status not in ('processing','failed')) as sent_this_week
        from pti_submissions s where s.unit_id=u.id
      ) pti on true
      left join lateral (
        select max(n.sent_at) as last_notified_at from pti_notifications n where n.unit_id=u.id
      ) notifications on true
      order by u.unit_number`);
    return NextResponse.json({ units: rows });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const input = createUnitSchema.parse(await request.json());
    const { rows } = await db.query(
      'insert into units (unit_number, company) values ($1, $2) returning *',
      [input.unitNumber, input.company],
    );
    return NextResponse.json({ unit: { ...rows[0], unit_registrations: [] } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid unit' }, { status: 400 });
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') return NextResponse.json({ error: 'That unit number already exists.' }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add unit' }, { status: 500 });
  }
}
