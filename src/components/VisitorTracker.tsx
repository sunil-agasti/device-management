'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const SESSION_KEY = 'visitor_session';
const IDLE_TIMEOUT = 15 * 60 * 1000;

export default function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;

    const now = Date.now();
    const lastVisit = parseInt(sessionStorage.getItem(SESSION_KEY) || '0');
    const isNewSession = !lastVisit || (now - lastVisit) > IDLE_TIMEOUT;

    if (!isNewSession) {
      sessionStorage.setItem(SESSION_KEY, String(now));
      return;
    }

    sessionStorage.setItem(SESSION_KEY, String(now));
    const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';
    fetch('/api/visitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ page: '/' }),
      credentials: 'same-origin',
    }).catch(() => {});
  }, [pathname]);

  return null;
}
