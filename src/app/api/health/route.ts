import { NextResponse } from 'next/server';
import { db } from '@/lib/database';

export async function GET() {
  try {
    await db.query('select 1');
    return NextResponse.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json({ status: 'unhealthy', database: 'disconnected' }, { status: 503 });
  }
}
