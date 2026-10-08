import type { PoolClient } from 'pg';
import { db } from '@/lib/database';
import { formatPtiReference } from '@/lib/pti-reference';
import { logAudit } from '@/services/audit';
import { dateOnly, ptiCycleStart, todayInTimeZone } from '@/lib/date-ranges';
import { getReminderSettings } from '@/services/reminder-settings';

export type CreatePtiSubmissionInput = {
  unitId: string; registrationId: string; sourceChatId: string; sourceChatTitle: string;
  sourceMessageLink: string;
  sourceMessageId: number; submittedByUserId?: string; submittedByUsername?: string;
  mediaType: 'photo' | 'video'; fileId: string; archiveChatId: string;
};

export async function findExistingSubmission(sourceChatId: string, sourceMessageId: number) {
  const { rows } = await db.query('select id, status from pti_submissions where source_chat_id=$1 and source_message_id=$2', [sourceChatId, sourceMessageId]);
  return rows[0] as { id: string; status: string } | undefined;
}

export async function createProcessingSubmission(input: CreatePtiSubmissionInput) {
  const cycleSettings = await getReminderSettings();
  const cycleStart = ptiCycleStart(todayInTimeZone(), cycleSettings.pti_cycle_days, dateOnly(cycleSettings.pti_cycle_anchor_date));
  const client = await db.connect();
  try {
    await client.query('begin');
    const previous = await latestResendRequest(client, input.unitId);
    const { rows } = await client.query(`insert into pti_submissions
      (unit_id, registration_id, source_chat_id, source_chat_title, source_message_id, source_message_link, submitted_by_user_id, submitted_by_username, media_type, telegram_file_id, archive_chat_id, resubmission_for_id, compliance_week_start)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      on conflict (source_chat_id, source_message_id) do update set
        unit_id=excluded.unit_id, registration_id=excluded.registration_id,
        source_chat_title=excluded.source_chat_title,
        source_message_link=excluded.source_message_link,
        submitted_by_user_id=excluded.submitted_by_user_id,
        submitted_by_username=excluded.submitted_by_username,
        media_type=excluded.media_type, telegram_file_id=excluded.telegram_file_id,
        archive_chat_id=excluded.archive_chat_id, archive_message_id=null,
        status='processing', failure_reason=null,
        resubmission_for_id=excluded.resubmission_for_id, compliance_week_start=excluded.compliance_week_start, updated_at=now()
      where pti_submissions.status='failed'
      returning id, pti_number`,
      [input.unitId,input.registrationId,input.sourceChatId,input.sourceChatTitle,input.sourceMessageId,input.sourceMessageLink,input.submittedByUserId??null,input.submittedByUsername??null,input.mediaType,input.fileId,input.archiveChatId,previous?.id??null,cycleStart]);
    if (!rows[0]) throw new Error('This photo or video has already been submitted for PTI review.');
    if (previous) await client.query("update pti_submissions set status='resubmitted' where id=$1", [previous.id]);
    await client.query('commit');
    return { id: rows[0].id as string, reference: formatPtiReference(rows[0].pti_number as string) };
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}

async function latestResendRequest(client: PoolClient, unitId: string) {
  const { rows } = await client.query("select id from pti_submissions where unit_id=$1 and status='resend_requested' order by created_at desc limit 1 for update", [unitId]);
  return rows[0] as { id: string } | undefined;
}

export async function markSubmissionForwarded(id: string, archiveMessageId: number) {
  const client=await db.connect();
  try { await client.query('begin'); const {rows}=await client.query("update pti_submissions set archive_message_id=$2, status='pending_review', failure_reason=null where id=$1 returning *", [id, archiveMessageId]);
    const item=rows[0]; if(item) await logAudit({actor:{type:'BOT',displayName:'PTI Bot'},action:item.resubmission_for_id?'PTI_REPLACEMENT_SUBMITTED':'PTI_SUBMITTED',entityType:'PTI',entityId:id,unitId:item.unit_id,driverId:item.driver_id,description:`${formatPtiReference(item.pti_number)} submitted`,metadata:{archiveMessageId}},client);
    await client.query('commit');
  } catch(error){await client.query('rollback');throw error;} finally{client.release();}
}

export async function markSubmissionFailed(id: string, reason: string) {
  await db.query("update pti_submissions set status='failed', failure_reason=$2 where id=$1", [id, reason.slice(0, 500)]);
}
