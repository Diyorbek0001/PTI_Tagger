import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reassignDriver } from '@/services/assignments';
import { requestIp,webActor } from '@/services/audit';
import { requireWebRole } from '@/services/web-users';
import { canAccessUnit } from '@/services/company-access';
const schema=z.object({telegramUserId:z.string().trim().regex(/^\d+$/).nullable().optional(),username:z.string().trim().max(64).nullable().optional(),firstName:z.string().trim().max(120).nullable().optional(),lastName:z.string().trim().max(120).nullable().optional(),reason:z.string().trim().max(500).nullable().optional()}).superRefine((v,c)=>{if(!v.telegramUserId&&!v.username)c.addIssue({code:'custom',path:['username'],message:'Enter a Telegram username or numeric user ID.'});});
export async function POST(request:Request,{params}:{params:Promise<{unitId:string}>}) { try {const auth=await requireWebRole(request,['ADMIN','SUPERADMIN']);if('response'in auth)return auth.response;const {unitId}=await params;if(!await canAccessUnit(auth.user.id,auth.user.role,unitId,'edit'))return NextResponse.json({error:'You do not have edit access to this company.'},{status:403});const input=schema.parse(await request.json());return NextResponse.json(await reassignDriver({unitId,...input,actor:webActor(auth.user),ipAddress:requestIp(request)}));}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message},{status:400});return NextResponse.json({error:error instanceof Error?error.message:'Unable to reassign driver'},{status:400});}}
