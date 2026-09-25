import { NextResponse } from 'next/server';
import { notifyAllMissing } from '@/services/pti-notifications';

export async function POST() {
  try {
    const result = await notifyAllMissing('website');
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send reminders.' }, { status: 500 });
  }
}
