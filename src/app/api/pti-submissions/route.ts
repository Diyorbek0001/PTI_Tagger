import { NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { formatPtiReference } from '@/lib/pti-reference';

export async function GET() {
  try {
    const { rows } = await db.query(`select s.*, u.unit_number, u.company,
      (select count(*)::int from defects d where d.pti_submission_id=s.id) as defect_count,
      coalesce((select json_agg(json_build_object('id',d.id,'defect_number',d.defect_number,'category',d.category,'description',d.description,'severity',d.severity,'status',d.status) order by d.created_at) from defects d where d.pti_submission_id=s.id),'[]'::json) as defects
      from pti_submissions s join units u on u.id=s.unit_id
      order by s.created_at desc`);
    const submissions = rows.map(row => ({ ...row, pti_reference: formatPtiReference(row.pti_number), archive_url: archiveUrl(String(row.archive_chat_id), row.archive_message_id) }));
    return NextResponse.json({ submissions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load PTI submissions' }, { status: 500 });
  }
}

function archiveUrl(chatId: string, messageId: string | number | null) {
  if (!messageId || !chatId.startsWith('-100')) return null;
  return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
}
