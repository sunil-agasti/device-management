import { NextResponse } from 'next/server';
import { getAllLogs, getUsers } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    const logs = getAllLogs();
    const users = getUsers();
    const results = {
      expiredFixed: 0,
      orphanedUsers: 0,
      duplicatesRemoved: 0,
      staleLogsArchived: 0,
    };

    // 1. Fix stuck "GRANTED" entries that have already expired
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
          results.expiredFixed++;
        }
      }
    }

    // 2. Identify orphaned users (missing employee ID or email)
    results.orphanedUsers = users.filter(u => !u.employeeId || !u.email).length;

    // 3. Remove duplicate log entries (same user, hostname, grantedAt)
    for (const filename of ['admin_logs.json', 'github_logs.json']) {
      const filePath = path.join(process.cwd(), 'data', filename);
      const allLogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const seen = new Set<string>();
      const deduped = allLogs.filter((l: { username: string; hostname: string; grantedAt: string }) => {
        const key = `${l.username}-${l.hostname}-${l.grantedAt}`;
        if (seen.has(key)) {
          results.duplicatesRemoved++;
          return false;
        }
        seen.add(key);
        return true;
      });
      if (deduped.length !== allLogs.length) {
        fs.writeFileSync(filePath, JSON.stringify(deduped, null, 2));
      }
    }

    // 4. Archive logs older than 90 days
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    for (const filename of ['admin_logs.json', 'github_logs.json']) {
      const filePath = path.join(process.cwd(), 'data', filename);
      const allLogs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const active = allLogs.filter((l: { grantedAt: string }) => new Date(l.grantedAt).getTime() > ninetyDaysAgo);
      const archived = allLogs.filter((l: { grantedAt: string }) => new Date(l.grantedAt).getTime() <= ninetyDaysAgo);

      if (archived.length > 0) {
        results.staleLogsArchived += archived.length;
        fs.writeFileSync(filePath, JSON.stringify(active, null, 2));

        const archivePath = path.join(process.cwd(), 'data', `archive_${filename}`);
        let existing: unknown[] = [];
        if (fs.existsSync(archivePath)) {
          existing = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
        }
        fs.writeFileSync(archivePath, JSON.stringify([...existing, ...archived], null, 2));
      }
    }

    const total = results.expiredFixed + results.duplicatesRemoved + results.staleLogsArchived;

    return NextResponse.json({
      success: true,
      message: total > 0
        ? `Cleanup completed. Fixed ${results.expiredFixed} expired entries, removed ${results.duplicatesRemoved} duplicates, archived ${results.staleLogsArchived} old logs. ${results.orphanedUsers} users have incomplete profiles.`
        : `Database is clean. No issues found.${results.orphanedUsers > 0 ? ` ${results.orphanedUsers} users have incomplete profiles.` : ''}`,
      ...results,
      totalFixed: total,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Cleanup failed: ' + String(err) }, { status: 500 });
  }
}
