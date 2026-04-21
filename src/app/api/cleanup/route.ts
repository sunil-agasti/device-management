import { NextResponse } from 'next/server';
import { getAllLogs } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    const logs = getAllLogs();
    let cleaned = 0;

    for (const log of logs.filter(l => l.status === 'GRANTED')) {
      const expiryTime = new Date(log.grantedAt).getTime() + log.duration * 60 * 1000;
      if (Date.now() > expiryTime) {
        const filename = log.type === 'admin' ? 'admin_logs.json' : 'github_logs.json';
        const filePath = path.join(process.cwd(), 'data', filename);
        const allLogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const idx = allLogs.findIndex((l: { id: string }) => l.id === log.id);
        if (idx >= 0) {
          allLogs[idx].status = 'EXPIRED';
          allLogs[idx].revokedAt = new Date().toISOString();
          fs.writeFileSync(filePath, JSON.stringify(allLogs, null, 2));
          cleaned++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleanup completed. Fixed ${cleaned} expired entries.`,
      cleaned,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Cleanup failed: ' + String(err) }, { status: 500 });
  }
}
