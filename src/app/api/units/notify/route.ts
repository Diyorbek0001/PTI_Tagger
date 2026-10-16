import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Bulk reminders have been removed. Automatic reminders run daily at the configured company time.' }, { status: 410 });
}
