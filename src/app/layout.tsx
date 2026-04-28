import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import AuthGuard from "@/components/AuthGuard";
import SessionTimeout from "@/components/SessionTimeout";
import VisitorTracker from "@/components/VisitorTracker";

export const metadata: Metadata = {
  title: "Device Management Portal - MacBook Management",
  description: "Secure MacBook Management & Access Control Portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-white dark:bg-black text-[#1d1d1f] dark:text-[#f5f5f7] transition-colors font-sans">
        <ThemeProvider>
          <AuthGuard>
            <SessionTimeout />
            <VisitorTracker />
            {children}
          </AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}
