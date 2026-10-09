import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/database';
import { companyNamesForUser } from '@/services/company-access';
import { currentWebUser, requireWebRole } from '@/services/web-users';

const companySchema = z.object({ name: z.string().trim().min(1).max(120) });
const updateSchema = z.object({ oldName: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(120).optional(), isActive: z.boolean().optional() });

export async function GET(request: Request) {
  const current = await currentWebUser(request);
  if (!current) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const includeInactive = current.user.role === 'SUPERADMIN' && new URL(request.url).searchParams.get('includeInactive') === 'true';
  const allowed = await companyNamesForUser(current.user.id, current.user.role);
  const companyAdmin = ['SUPERADMIN','USERADMIN'].includes(current.user.role);
  const { rows } = await db.query(`select name,is_active from companies where ($1::boolean or is_active) and ($2::boolean or name=any($3::text[])) order by lower(name)`, [includeInactive, companyAdmin, allowed]);
  return NextResponse.json({ companies: rows });
}

export async function POST(request: Request) {
  const auth = await requireWebRole(request, ['SUPERADMIN']);
  if ('response' in auth) return auth.response;
  try {
    const { name } = companySchema.parse(await request.json());
    const { rows } = await db.query(`insert into companies(name,created_by) values($1,$2)
      on conflict(name) do update set is_active=true where companies.is_active=false returning name,is_active`, [name, auth.user.id]);
    if (!rows[0]) return NextResponse.json({ error: 'That company already exists.' }, { status: 409 });
    return NextResponse.json({ company: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add company.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireWebRole(request, ['SUPERADMIN']);
  if ('response' in auth) return auth.response;
  try {
    const input = updateSchema.parse(await request.json());
    const client = await db.connect();
    try {
      await client.query('begin');
      const current = await client.query('select name from companies where name=$1 for update', [input.oldName]);
      if (!current.rows[0]) throw new Error('Company not found.');
      if (input.name && input.name !== input.oldName) {
        const renamed = await client.query('update companies set name=$2 where name=$1 returning name,is_active', [input.oldName, input.name]);
        await client.query('update units set company=$2 where company=$1', [input.oldName, input.name]);
        await client.query('commit');
        return NextResponse.json({ company: renamed.rows[0] });
      }
      if (input.isActive === false) {
        const { rows } = await client.query('update companies set is_active=false where name=$1 returning name,is_active', [input.oldName]);
        await client.query('commit');
        return NextResponse.json({ company: rows[0] });
      }
      if (input.isActive === true) {
        const { rows } = await client.query('update companies set is_active=true where name=$1 returning name,is_active', [input.oldName]);
        await client.query('commit');
        return NextResponse.json({ company: rows[0] });
      }
      await client.query('rollback');
      return NextResponse.json({ error: 'Provide a new name or deactivate the company.' }, { status: 400 });
    } catch (error) {
      await client.query('rollback');
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505') return NextResponse.json({ error: 'A company with that name already exists.' }, { status: 409 });
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update company.' }, { status: 400 });
    } finally { client.release(); }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update company.' }, { status: 400 });
  }
}
