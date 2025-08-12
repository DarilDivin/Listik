"use client";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ShortcutHelper from "@/components/ShortcutHelper";
import TitleBar from "@/components/TitleBar";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// export const metadata: Metadata = {
//   title: "Listik",
//   description: "Your daily task manager",
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [showTitleBar, setShowTitleBar] = useState(false);

  return (
    <html lang="fr" className="h-full scroll-smooth" suppressHydrationWarning>
      <body
        className={`h-full m-0 p-0 ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div
          className={`bg-transparent relative overflow-hidden transition-all duration-300 ease-in-out ${
            showTitleBar ? "py-0" : "py-1"
          }`}
          onMouseEnter={() => setShowTitleBar(true)}
          onMouseLeave={() => setShowTitleBar(false)}
        >
          <div
            className={`transition-all duration-300 ease-in-out ${
              showTitleBar
                ? "opacity-100 translate-y-0 pointer-events-auto h-8"
                : "opacity-0 -translate-y-4 pointer-events-none h-0"
            }`}
            style={{
              overflow: "hidden",
            }}
          >
            <TitleBar
              title="Listik"
              showMinimize={true}
              showMaximize={true}
              showClose={true}
              className="bg-slate-100/00"
            />
          </div>
        </div>

        <div
          className={`
          bg-white p-2 pt-0 w-full overflow-hidden transition-all duration-300
          ${showTitleBar ? "h-[calc(100vh-32px)]" : "h-[calc(100vh-8px)]"}
        `}
        >
          {children}
          <Toaster
            position="top-right" // ← Position du toast
            expand={false} // Ne pas étendre
            // richColors // Couleurs riches
            closeButton // Bouton fermer
            toastOptions={{
              duration: 3000,
              style: {
                background: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(0, 0, 0, 0.1)",
                borderRadius: "12px",
                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
              },
            }}
          />
        </div>
      </body>
    </html>
  );
}
