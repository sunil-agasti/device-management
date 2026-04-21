const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;

export function rateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);
