export function validateVpnIp(ip: string): { valid: boolean; message: string } {
  if (!ip || ip.trim() === '') {
    return { valid: false, message: 'VPN IP is required' };
  }
  const trimmed = ip.trim();
  if (!trimmed.startsWith('17.')) {
    return { valid: false, message: 'VPN IP must start with 17. (Apple VPN)' };
  }
  const parts = trimmed.split('.');
  if (parts.length !== 4) {
    return { valid: false, message: 'Invalid IP format. Expected: 17.x.x.x' };
  }
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) {
      return { valid: false, message: 'Invalid IP format. Each octet must be 0-255' };
    }
  }
  return { valid: true, message: '' };
}

const VALID_HOSTNAME_PREFIXES = ['02HW0', '01HW0', '34HW0', '3HW0', '4HW0'];

export function validateHostname(hostname: string): { valid: boolean; message: string } {
  if (!hostname || hostname.trim() === '') {
    return { valid: false, message: 'Hostname is required' };
  }
  const trimmed = hostname.trim().toUpperCase();
  const isValid = VALID_HOSTNAME_PREFIXES.some(prefix => trimmed.startsWith(prefix));
  if (!isValid) {
    return {
      valid: false,
      message: `Hostname is invalid. Must start with: ${VALID_HOSTNAME_PREFIXES.join(', ')}`,
    };
  }
  return { valid: true, message: '' };
}

export function validateEmployeeId(id: string): { valid: boolean; message: string } {
  if (!id || id.trim() === '') {
    return { valid: false, message: 'Employee ID is required' };
  }
  if (!/^\d+$/.test(id.trim())) {
    return { valid: false, message: 'Employee ID must be numeric' };
  }
  return { valid: true, message: '' };
}

export function validateEmail(email: string): { valid: boolean; message: string } {
  if (!email || email.trim() === '') {
    return { valid: false, message: 'Apple Email is required' };
  }
  if (!email.trim().endsWith('@apple.com')) {
    return { valid: false, message: 'Must be a valid @apple.com email address' };
  }
  return { valid: true, message: '' };
}

export function validateDuration(duration: number): { valid: boolean; message: string } {
  if (!duration || duration < 5) {
    return { valid: false, message: 'Duration must be at least 5 minutes' };
  }
  if (duration > 180) {
    return { valid: false, message: 'Duration cannot exceed 180 minutes (3 hours)' };
  }
  return { valid: true, message: '' };
}
