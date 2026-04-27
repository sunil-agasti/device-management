import { NextResponse } from 'next/server';
import { getHostnameLogs } from '@/lib/db';

export async function GET() {
  return NextResponse.json({ logs: getHostnameLogs() });
}
