'use client';

import { motion } from 'framer-motion';

export interface Step {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

export default function ProgressTracker({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;

  const activeIndex = steps.findIndex(s => s.status === 'active');
  const allDone = steps.every(s => s.status === 'completed');
  const hasError = steps.some(s => s.status === 'error');

  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative">
        {/* Connection line */}
        <div className="absolute top-6 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-700" />
        <motion.div
          className={`absolute top-6 left-0 h-0.5 ${hasError ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-violet-500'}`}
          initial={{ width: '0%' }}
          animate={{
            width: allDone ? '100%' : activeIndex >= 0 ? `${(activeIndex / (steps.length - 1)) * 100}%` : '0%',
          }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />

        {steps.map((step, i) => (
          <div key={step.id} className="relative flex flex-col items-center z-10" style={{ width: `${100 / steps.length}%` }}>
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-500
                ${step.status === 'completed'
                  ? 'bg-gradient-to-br from-green-400 to-emerald-500 border-green-400 shadow-lg shadow-green-500/30'
                  : step.status === 'active'
                  ? 'bg-gradient-to-br from-blue-400 to-violet-500 border-blue-400 shadow-lg shadow-blue-500/30'
                  : step.status === 'error'
                  ? 'bg-gradient-to-br from-red-400 to-rose-500 border-red-400 shadow-lg shadow-red-500/30'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                }`}
            >
              {step.status === 'completed' ? (
                <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </motion.svg>
              ) : step.status === 'active' ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : step.status === 'error' ? (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
              )}
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 + 0.2 }}
              className={`mt-3 text-xs font-medium text-center max-w-[100px] leading-tight
                ${step.status === 'completed' ? 'text-green-600 dark:text-green-400'
                  : step.status === 'active' ? 'text-blue-600 dark:text-blue-400'
                  : step.status === 'error' ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-400 dark:text-slate-500'
                }`}
            >
              {step.label}
            </motion.p>
          </div>
        ))}
      </div>
    </div>
  );
}
