import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/database';
import { logAudit,requestIp,webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';

const bulkUnitsSchema = z.object({
  units: z.array(z.object({
    unitNumber: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/, 'Unit numbers may contain only letters, numbers, or hyphens.'),
    company: z.string().trim().min(1).max(120),
  })).min(1, 'Add at least one unit.').max(500, 'A batch can contain at most 500 units.'),
});

export async function POST(request: Request) {
  try {
    const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;
    const input = bulkUnitsSchema.parse(await request.json());
    const unique = [...new Map(input.units.map(unit => [unit.unitNumber, unit])).values()];
    const client=await db.connect();let rows:Array<{id:string;unit_number:string;company:string}>=[];
    try{await client.query('begin');const inserted=await client.query<{id:string;unit_number:string;company:string}>(`insert into units (unit_number, company)
      select * from unnest($1::text[], $2::text[])
      on conflict (unit_number) do nothing
      returning id,unit_number,company`, [unique.map(unit => unit.unitNumber), unique.map(unit => unit.company)]);rows=inserted.rows;
      for(const unit of rows)await logAudit({actor:webActor(auth.user),action:'UNIT_CREATED',entityType:'UNIT',entityId:unit.id,unitId:unit.id,description:`Unit ${unit.unit_number} created in bulk`,metadata:{company:unit.company,bulk:true},ipAddress:requestIp(request)},client);
      await client.query('commit');}catch(error){await client.query('rollback');throw error}finally{client.release()}
    const added = new Set(rows.map(row => row.unit_number));
    return NextResponse.json({
      added: added.size,
      skipped: input.units.length - added.size,
      addedUnits: [...added],
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid unit batch.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add units.' }, { status: 500 });
  }
}
