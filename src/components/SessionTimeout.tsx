'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const IDLE_TIMEOUT = 15 * 60 * 1000;
const WARNING_BEFORE = 2 * 60 * 1000;

export default function SessionTimeout() {
  const [lastActivity, setLastActivity] = useState(() => Date.now());
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
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-violet-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg w-full mx-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
        >
          <div className="p-10 text-center">
            {/* Clock icon */}
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-50 dark:bg-amber-500/10 border-2 border-amber-200 dark:border-amber-500/30 flex items-center justify-center">
              <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Session Timeout</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Your session has expired due to inactivity for more than 15 minutes.
            </p>

            {/* Why section */}
            <div className="text-left bg-slate-50 dark:bg-slate-700/30 rounded-xl p-5 mb-6 border border-slate-100 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Why did this happen?
              </h4>
              <ul className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                  Your session was inactive for more than 15 minutes
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                  The server may have restarted during this time
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                  This is a security measure to protect your account and managed devices
                </li>
              </ul>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-violet-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25"
            >
              Return to Portal Home
            </button>

            <p className="mt-5 text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              Your session data has been cleared for security
            </p>
          </div>
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
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Session Expiring Soon</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Your session will expire in <strong>{countdown}s</strong> due to inactivity. Any activity will reset the timer.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
