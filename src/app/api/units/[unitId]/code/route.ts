import { NextResponse } from 'next/server';
import { generateAuthorizationCode, codeExpiry } from '@/lib/authorization';
import { db } from '@/lib/database';

export async function POST(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try { const { unitId } = await params; const code = generateAuthorizationCode(); const expires = codeExpiry();
    const { rows } = await db.query('select issue_unit_authorization_code($1,$2,$3,$4) as id', [unitId, code, expires.toISOString(), 'local-admin']);
    return NextResponse.json({ code, expiresAt: expires.toISOString(), authorizationId: rows[0].id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to generate code' }, { status: 400 }); }
}
