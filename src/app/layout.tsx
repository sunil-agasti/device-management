import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import AuthGuard from "@/components/AuthGuard";
import SessionTimeout from "@/components/SessionTimeout";

export const metadata: Metadata = {
  title: "Device Management Portal - AI-Powered MacBook Management",
  description: "Secure MacBook Management & Access Control Portal with AI-powered commands",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#f5f5f7] dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] transition-colors font-sans">
        <ThemeProvider>
          <AuthGuard>
            <SessionTimeout />
            {children}
          </AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}
