import { NextRequest, NextResponse } from 'next/server';
import { getAllLogs, getAdminLogs, getGithubLogs, logsToCSV } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const format = searchParams.get('format');

  let logs;
  if (type === 'admin') logs = getAdminLogs();
  else if (type === 'github') logs = getGithubLogs();
  else logs = getAllLogs();

  if (format === 'csv') {
    const csv = logsToCSV(logs);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="access_logs_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  return NextResponse.json({ logs });
}
