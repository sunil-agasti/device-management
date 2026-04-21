export interface User {
  employeeId: string;
  email: string;
  username: string;
  hostname: string;
  vpnIp: string;
  lastSeen: string;
  createdAt: string;
}

export interface AccessLog {
  id: string;
  hostname: string;
  username: string;
  employeeId: string;
  email: string;
  vpnIp: string;
  grantedAt: string;
  duration: number;
  revokedAt: string | null;
  status: 'GRANTED' | 'REVOKED' | 'FAILED' | 'EXPIRED';
  requestedBy: string;
  type: 'admin' | 'github';
}

export interface SystemInfo {
  clientIp: string;
  serverHostname: string;
  serverUsername: string;
  remoteUsername?: string;
  remoteHostname?: string;
}

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message?: string;
}

export interface AIPromptResult {
  action: 'admin' | 'github' | 'hostname' | 'cleanup' | 'search' | 'unknown';
  ip?: string;
  employeeId?: string;
  duration?: number;
  hostname?: string;
  message: string;
  requiresInput?: boolean;
  missingFields?: string[];
}

export interface FormData {
  employeeId: string;
  email: string;
  hostname: string;
  vpnIp: string;
  username: string;
  duration: number;
  requestedBy: string;
}
