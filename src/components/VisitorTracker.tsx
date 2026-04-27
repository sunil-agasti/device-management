'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';
    fetch('/api/visitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ page: pathname }),
      credentials: 'same-origin',
    }).catch(() => {});
  }, [pathname]);

  return null;
}
