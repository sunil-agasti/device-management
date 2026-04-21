export function detectDevice(userAgent: string): 'Mac' | 'iPhone' | 'iPad' | 'Unknown' {
  if (!userAgent) return 'Unknown';
  const ua = userAgent.toLowerCase();

  if (ua.includes('ipad') || (ua.includes('macintosh') && 'ontouchend' in globalThis)) {
    return 'iPad';
  }
  if (ua.includes('iphone')) {
    return 'iPhone';
  }
  if (ua.includes('macintosh') || ua.includes('mac os')) {
    return 'Mac';
  }
  return 'Unknown';
}

export function getDeviceIcon(device: string): string {
  switch (device) {
    case 'Mac': return '\uD83D\uDCBB';
    case 'iPhone': return '\uD83D\uDCF1';
    case 'iPad': return '\uD83D\uDCF2';
    default: return '\uD83D\uDDA5\uFE0F';
  }
}
