'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AIPromptBarProps {
  onResult: (result: {
    action: string;
    formData?: Record<string, unknown>;
    message: string;
    found?: boolean;
    user?: Record<string, unknown>;
    suggestions?: string[];
    requiresInput?: boolean;
    missingFields?: string[];
  }) => void;
}

export default function AIPromptBar({ onResult }: AIPromptBarProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = [
    'grant admin to 17.x.x.x for 60 minutes',
    'give github access to 17.x.x.x',
    'search employee 1234567',
    'update hostname on 17.x.x.x',
    'run cleanup utility',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setShowSuggestions(false);
    try {
      const res = await fetch('/api/ai-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      onResult(data);
      if (data.action !== 'unknown') setPrompt('');
    } catch {
      onResult({ action: 'unknown', message: 'Failed to process command. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity" />
          <div className="relative flex items-center bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700">
            <div className="pl-5 pr-3">
              <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <input
              type="text"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setShowSuggestions(e.target.value.length === 0);
              }}
              onFocus={() => !prompt && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Ask AI: &quot;grant admin to 17.233.8.2&quot; or &quot;search employee 1255389&quot;"
              className="flex-1 py-4 px-2 bg-transparent text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none text-sm"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="mr-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-violet-600 text-white text-sm font-medium rounded-xl hover:from-blue-600 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  Run
                </span>
              )}
            </button>
          </div>
        </div>
      </form>

      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50"
          >
            <div className="px-4 py-2 text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Try these commands
            </div>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setPrompt(s); setShowSuggestions(false); }}
                className="w-full text-left px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-3"
              >
                <span className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400 text-xs font-bold">{i + 1}</span>
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
