import type { PoolClient } from 'pg';
import { db } from '@/lib/database';
import { formatPtiReference } from '@/lib/pti-reference';

export type CreatePtiSubmissionInput = {
  unitId: string; registrationId: string; sourceChatId: string; sourceChatTitle: string;
  sourceMessageId: number; submittedByUserId?: string; submittedByUsername?: string;
  mediaType: 'photo' | 'video'; fileId: string; archiveChatId: string;
};

export async function findExistingSubmission(sourceChatId: string, sourceMessageId: number) {
  const { rows } = await db.query('select id, status from pti_submissions where source_chat_id=$1 and source_message_id=$2', [sourceChatId, sourceMessageId]);
  return rows[0] as { id: string; status: string } | undefined;
}

export async function createProcessingSubmission(input: CreatePtiSubmissionInput) {
  const client = await db.connect();
  try {
    await client.query('begin');
    const previous = await latestResendRequest(client, input.unitId);
    const { rows } = await client.query(`insert into pti_submissions
      (unit_id, registration_id, source_chat_id, source_chat_title, source_message_id, submitted_by_user_id, submitted_by_username, media_type, telegram_file_id, archive_chat_id, resubmission_for_id)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, pti_number`,
      [input.unitId,input.registrationId,input.sourceChatId,input.sourceChatTitle,input.sourceMessageId,input.submittedByUserId??null,input.submittedByUsername??null,input.mediaType,input.fileId,input.archiveChatId,previous?.id??null]);
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
  await db.query("update pti_submissions set archive_message_id=$2, status='pending_review', failure_reason=null where id=$1", [id, archiveMessageId]);
}

export async function markSubmissionFailed(id: string, reason: string) {
  await db.query("update pti_submissions set status='failed', failure_reason=$2 where id=$1", [id, reason.slice(0, 500)]);
}
