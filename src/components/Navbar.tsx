'use client';

import { useTheme } from '@/context/ThemeContext';
import { useState } from 'react';
import Image from 'next/image';

export default function Navbar({ systemInfo }: { systemInfo?: { serverUsername: string; serverHostname: string; clientIp: string; clientUsername?: string; clientHostname?: string } }) {
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-black/90 border-b border-slate-200 dark:border-[#333] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <a href="/device-management-portal" className="flex items-center group relative z-0">
            <Image
              src="/logo.png"
              alt="Device Management Portal"
              width={280}
              height={64}
              className="h-[calc(var(--spacing)*27)] w-auto object-contain mix-blend-multiply block dark:hidden pointer-events-none"
              priority
              unoptimized
            />
            <Image
              src="/logo-dark.png"
              alt="Device Management Portal"
              width={220}
              height={56}
              className="h-[calc(var(--spacing)*27)] w-auto object-contain mix-blend-screen block hidden dark:block"
              priority
              unoptimized
            />
          </a>

          <div className="hidden md:flex items-center gap-2">
            {systemInfo ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#3d3d3f] text-xs">
                <span className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse" />
                <span className="text-slate-600 dark:text-[#f5f5f7]">
                  {systemInfo.clientUsername || systemInfo.serverUsername} ({systemInfo.clientHostname || systemInfo.serverHostname})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#3d3d3f] text-xs">
                <div className="w-3 h-3 border-2 border-slate-300 dark:border-[#4d4d4f] border-t-[#007AFF] rounded-full animate-spin" />
                <span className="text-slate-400 dark:text-[#86868b]">Connecting...</span>
              </div>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-[#3d3d3f] hover:bg-slate-200 dark:hover:bg-[#4d4d4f] transition-colors"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#3d3d3f]">
            <svg className="w-6 h-6 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-[#3d3d3f] p-4 space-y-2">
          {systemInfo && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {systemInfo.clientUsername || systemInfo.serverUsername} ({systemInfo.clientHostname || systemInfo.serverHostname}) | {systemInfo.clientIp}
            </div>
          )}
          <button onClick={toggleTheme} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#3d3d3f] text-sm text-slate-600 dark:text-[#f5f5f7]">
            {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </button>
        </div>
      )}
    </nav>
  );
}
