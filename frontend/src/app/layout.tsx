import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DropToasts } from "@/components/dashboard/drop-toasts";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentCart — Autonomous Shopping Agent",
  description:
    "Autonomous agentic commerce and price-watch shopping assistant dashboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full text-zinc-100">
        <DropToasts />
        <div className="mx-auto flex h-dvh w-full max-w-[1600px] overflow-hidden">
          <div className="hidden w-72 shrink-0 lg:block">
            <Sidebar />
          </div>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}