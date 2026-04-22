import fs from 'fs';
import path from 'path';
import { User, AccessLog } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backup');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureFile(filePath: string) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf-8');
  }
}

function readJson<T>(filename: string, dir = DATA_DIR): T[] {
  const filePath = path.join(dir, filename);
  ensureFile(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function writeJson<T>(filename: string, data: T[], dir = DATA_DIR) {
  const filePath = path.join(dir, filename);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function appendToBackup(log: AccessLog) {
  const filename = log.type === 'admin' ? 'admin_logs_backup.json' : 'github_logs_backup.json';
  const logs = readJson<AccessLog>(filename, BACKUP_DIR);
  const idx = logs.findIndex(l => l.id === log.id);
  if (idx >= 0) {
    logs[idx] = log;
  } else {
    logs.unshift(log);
  }
  writeJson(filename, logs, BACKUP_DIR);
}

export function getUsers(): User[] {
  return readJson<User>('users.json');
}

export function findUserByUsername(username: string): User | undefined {
  return getUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
}

export function findUserByEmployeeId(employeeId: string): User | undefined {
  return getUsers().find(u => u.employeeId === employeeId);
}

export function findUserByIp(ip: string): User | undefined {
  return getUsers().find(u => u.vpnIp === ip);
}

export function upsertUser(user: Partial<User> & { username: string }): User {
  const users = getUsers();
  const idx = users.findIndex(u => u.username.toLowerCase() === user.username.toLowerCase());
  const now = new Date().toISOString();

  if (idx >= 0) {
    users[idx] = { ...users[idx], ...user, lastSeen: now };
    writeJson('users.json', users);
    return users[idx];
  }

  const newUser: User = {
    employeeId: user.employeeId || '',
    email: user.email || '',
    username: user.username,
    hostname: user.hostname || '',
    vpnIp: user.vpnIp || '',
    lastSeen: now,
    createdAt: now,
  };
  users.push(newUser);
  writeJson('users.json', users);
  return newUser;
}

export function getAdminLogs(): AccessLog[] {
  return readJson<AccessLog>('admin_logs.json');
}

export function getGithubLogs(): AccessLog[] {
  return readJson<AccessLog>('github_logs.json');
}

export function addLog(log: AccessLog) {
  const filename = log.type === 'admin' ? 'admin_logs.json' : 'github_logs.json';
  const logs = readJson<AccessLog>(filename);
  logs.unshift(log);
  writeJson(filename, logs);
  appendToBackup(log);
}

export function updateLogStatus(id: string, type: 'admin' | 'github', status: AccessLog['status']) {
  const filename = type === 'admin' ? 'admin_logs.json' : 'github_logs.json';
  const logs = readJson<AccessLog>(filename);
  const idx = logs.findIndex(l => l.id === id);
  if (idx >= 0) {
    logs[idx].status = status;
    logs[idx].revokedAt = new Date().toISOString();
    writeJson(filename, logs);
    appendToBackup(logs[idx]);
  }
}

export function getAllLogs(): AccessLog[] {
  const admin = getAdminLogs();
  const github = getGithubLogs();
  return [...admin, ...github].sort((a, b) =>
    new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime()
  );
}

export function getAllBackupLogs(): AccessLog[] {
  const admin = readJson<AccessLog>('admin_logs_backup.json', BACKUP_DIR);
  const github = readJson<AccessLog>('github_logs_backup.json', BACKUP_DIR);
  return [...admin, ...github].sort((a, b) =>
    new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime()
  );
}

export function getBackupAdminLogs(): AccessLog[] {
  return readJson<AccessLog>('admin_logs_backup.json', BACKUP_DIR);
}

export function getBackupGithubLogs(): AccessLog[] {
  return readJson<AccessLog>('github_logs_backup.json', BACKUP_DIR);
}

export function logsToCSV(logs: AccessLog[]): string {
  if (logs.length === 0) return '';
  const headers = ['ID', 'Type', 'Employee ID', 'Email', 'Hostname', 'Username', 'VPN IP', 'Granted At', 'Duration (min)', 'Revoked At', 'Status', 'Requested By', 'Device'];
  const rows = logs.map(l => [
    l.id, l.type, l.employeeId, l.email, l.hostname, l.username, l.vpnIp,
    l.grantedAt, l.duration.toString(), l.revokedAt || '', l.status, l.requestedBy, l.device || 'Unknown'
  ]);
  return [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
}
