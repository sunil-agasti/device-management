'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE = 2 * 60 * 1000; // Show warning 2 min before

export default function SessionTimeout() {
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showWarning, setShowWarning] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    if (timedOut) return;
    setLastActivity(Date.now());
    setShowWarning(false);
    setCountdown(120);
  }, [timedOut]);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => resetTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, [resetTimer]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivity;

      if (elapsed >= IDLE_TIMEOUT) {
        setTimedOut(true);
        setShowWarning(false);
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (elapsed >= IDLE_TIMEOUT - WARNING_BEFORE) {
        setShowWarning(true);
        const remaining = Math.ceil((IDLE_TIMEOUT - elapsed) / 1000);
        setCountdown(remaining);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lastActivity]);

  if (timedOut) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full mx-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-2xl"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Session Timed Out</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
            Your session has expired due to 15 minutes of inactivity. Please refresh to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25"
          >
            Refresh Session
          </button>
          <p className="mt-4 text-xs text-slate-400">
            This is a security measure to protect access controls.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {showWarning && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] max-w-sm w-full mx-4"
        >
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Session Expiring</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Logging out in <strong>{countdown}s</strong> due to inactivity. Move your mouse to stay.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
