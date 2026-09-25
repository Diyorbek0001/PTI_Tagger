import { NextResponse } from 'next/server';
import { Bot } from 'grammy';
import { z } from 'zod';
import { db } from '@/lib/database';
import { formatPtiReference } from '@/lib/pti-reference';

const reviewSchema = z.object({
  decision: z.enum(['approved', 'resend_requested']),
  note: z.string().trim().max(2000).optional().default(''),
  reviewedBy: z.string().trim().min(1).max(120).optional().default('Fleet Team'),
}).superRefine((value, context) => {
  if (value.decision === 'resend_requested' && !value.note) context.addIssue({ code: 'custom', path: ['note'], message: 'Add a note explaining what needs to be resent.' });
});

export async function POST(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  try {
    const input = reviewSchema.parse(await request.json());
    const { submissionId } = await params;
    const { rows } = await db.query(`select s.*, u.unit_number from pti_submissions s join units u on u.id=s.unit_id where s.id=$1`, [submissionId]);
    const submission = rows[0] as { id:string; pti_number:string; status:string; source_chat_id:string; source_message_id:string; unit_number:string } | undefined;
    if (!submission) return NextResponse.json({ error: 'PTI submission not found.' }, { status: 404 });
    if (!['pending_review','resend_requested'].includes(submission.status)) return NextResponse.json({ error: 'This PTI submission is no longer awaiting review.' }, { status: 409 });

    if (input.decision === 'resend_requested') {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
      const bot = new Bot(token);
      await bot.api.sendMessage(submission.source_chat_id, `⚠️ PTI resend requested\n\nPTI ID: ${formatPtiReference(submission.pti_number)}\nUnit: ${submission.unit_number}\nFleet note: ${input.note}\n\nPlease send a new photo or video and reply to it with /pti.`, { reply_parameters: { message_id: Number(submission.source_message_id), allow_sending_without_reply: true } });
    }

    const { rows: updated } = await db.query(`update pti_submissions set status=$2, review_note=nullif($3,''), reviewed_by=$4, reviewed_at=now(), resend_requested_at=case when $2='resend_requested' then now() else null end where id=$1 returning *`, [submissionId,input.decision,input.note,input.reviewedBy]);
    return NextResponse.json({ submission: updated[0] });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid review' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to review PTI submission' }, { status: 500 });
  }
}
