import { NextResponse } from 'next/server';
import { generateAuthorizationCode, codeExpiry } from '@/lib/authorization';
import { db } from '@/lib/database';
import { logAudit,requestIp,webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';
import { canAccessUnit } from '@/services/company-access';

export async function POST(request: Request, { params }: { params: Promise<{ unitId: string }> }) {
  try { const { unitId } = await params; const code = generateAuthorizationCode(); const expires = codeExpiry();
    const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;
    if(!await canAccessUnit(auth.user.id,auth.user.role,unitId,'edit'))return NextResponse.json({error:'You do not have edit access to this company.'},{status:403});
    const { rows } = await db.query('select issue_unit_authorization_code($1,$2,$3,$4) as id', [unitId, code, expires.toISOString(), 'local-admin']);
    await logAudit({actor:webActor(auth.user),action:'AUTHORIZATION_CODE_GENERATED',entityType:'UNIT',entityId:unitId,unitId,description:'Unit activation code generated',metadata:{authorizationId:rows[0].id,expiresAt:expires.toISOString()},ipAddress:requestIp(request)});
    return NextResponse.json({ code, expiresAt: expires.toISOString(), authorizationId: rows[0].id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to generate code' }, { status: 400 }); }
}
