import { NextRequest, NextResponse } from 'next/server';
import { getAllLogs, getAdminLogs, getGithubLogs, getAllBackupLogs, getBackupAdminLogs, getBackupGithubLogs, logsToCSV } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const format = searchParams.get('format');
  const source = searchParams.get('source');

  const useBackup = source === 'backup';

  let logs;
  if (type === 'admin') logs = useBackup ? getBackupAdminLogs() : getAdminLogs();
  else if (type === 'github') logs = useBackup ? getBackupGithubLogs() : getGithubLogs();
  else logs = useBackup ? getAllBackupLogs() : getAllLogs();

  if (format === 'csv') {
    const csv = logsToCSV(logs);
    const label = useBackup ? 'full_history' : 'recent';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="access_logs_${label}_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  }

  return NextResponse.json({ logs, source: useBackup ? 'backup' : 'active' });
}
