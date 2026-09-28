import type { PoolClient } from 'pg';
import { db } from '@/lib/database';

export type AuditActor = { type: 'WEB_USER'|'TELEGRAM_USER'|'SYSTEM'|'BOT'; id?: string|null; displayName?: string|null };
export type AuditEvent = {
  actor: AuditActor; action: string; entityType: string; entityId?: string|null;
  unitId?: string|null; driverId?: string|null; description: string;
  metadata?: Record<string, unknown>; ipAddress?: string|null;
};

export function webActor(user?:{id:string;display_name:string;username:string}): AuditActor {
  if(user)return {type:'WEB_USER',id:user.id,displayName:user.display_name||user.username};
  const username = process.env.WEB_ADMIN_USERNAME || 'Admin';
  return { type: 'WEB_USER', id: username, displayName: username };
}

export function requestIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip');
}

export async function logAudit(event: AuditEvent, client: Pick<PoolClient, 'query'> = db) {
  await client.query(`insert into audit_logs
    (actor_type,actor_id,actor_display_name,action,entity_type,entity_id,unit_id,driver_id,description,metadata,ip_address)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
      event.actor.type, event.actor.id ?? null, event.actor.displayName ?? null,
      event.action, event.entityType, event.entityId ?? null, event.unitId ?? null,
      event.driverId ?? null, event.description, JSON.stringify(event.metadata ?? {}), event.ipAddress ?? null,
    ]);
}
