'use client';

import Navbar from '@/components/Navbar';
import Dashboard from '@/components/Dashboard';
import ExpiryWarning from '@/components/ExpiryWarning';
import ActivityFeed from '@/components/ActivityFeed';
import { motion } from 'framer-motion';

interface SystemInfo {
  serverUsername: string;
  serverHostname: string;
  clientIp: string;
  clientUsername?: string;
  clientHostname?: string;
}

export default function HomeClient({ systemInfo }: { systemInfo?: SystemInfo }) {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Navbar systemInfo={systemInfo} />
      <ExpiryWarning />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4 py-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
            Device Management Portal
          </h1>
          <p className="text-[#86868b] max-w-lg mx-auto text-sm">
            Manage MacBook access, grant permissions, update hostnames, and generate reports
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Dashboard />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <ActivityFeed />
        </motion.div>
      </main>

      <footer className="text-center py-6 text-xs text-[#86868b]">
        Device Management Portal &middot; Secure MacBook Management & Access Control
      </footer>
    </div>
  );
}
