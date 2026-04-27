export function sanitizeForShell(input: string): string {
  return input.replace(/[^a-zA-Z0-9 .,!?'_@\-]/g, '');
}

export function sanitizeIp(ip: string): string {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return '';
  const parts = match.slice(1).map(Number);
  if (parts.some(p => p < 0 || p > 255)) return '';
  return parts.join('.');
}

export function sanitizeHostname(hostname: string): string {
  return hostname.replace(/[^a-zA-Z0-9\-]/g, '');
}

export function sanitizeUsername(username: string): string {
  return username.replace(/[^a-zA-Z0-9._\-]/g, '');
}

export function sanitizeEmployeeId(id: string): string {
  return id.replace(/[^0-9]/g, '');
}

export function sanitizeEmail(email: string): string {
  return email.replace(/[^a-zA-Z0-9._@\-]/g, '');
}
