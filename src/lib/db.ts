import fs from 'fs';
import path from 'path';
import { User, AccessLog } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');

function ensureFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf-8');
  }
}

function readJson<T>(filename: string): T[] {
  const filePath = path.join(DATA_DIR, filename);
  ensureFile(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function writeJson<T>(filename: string, data: T[]) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
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
}

export function updateLogStatus(id: string, type: 'admin' | 'github', status: AccessLog['status']) {
  const filename = type === 'admin' ? 'admin_logs.json' : 'github_logs.json';
  const logs = readJson<AccessLog>(filename);
  const idx = logs.findIndex(l => l.id === id);
  if (idx >= 0) {
    logs[idx].status = status;
    logs[idx].revokedAt = new Date().toISOString();
    writeJson(filename, logs);
  }
}

export function getAllLogs(): AccessLog[] {
  const admin = getAdminLogs();
  const github = getGithubLogs();
  return [...admin, ...github].sort((a, b) =>
    new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime()
  );
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
