"use client";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import TitleBar from "@/components/TitleBar";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { SWRConfig } from "swr";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/components/theme-provider";

const SWR_OPTIONS = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  dedupingInterval: 2000,
} as const;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [showTitleBar, setShowTitleBar] = useState(false);
  // La barre de capture rapide est une fenêtre flottante transparente : elle ne
  // doit hériter ni du fond `bg-background` ni de la TitleBar.
  // `trailingSlash: true` (next.config) → le chemin est « /quick/ » : on normalise.
  const isQuick = usePathname()?.replace(/\/$/, "") === "/quick";

  return (
    <html lang="fr" className="h-full scroll-smooth" suppressHydrationWarning>
      <body
        className={`h-full m-0 p-0 ${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased text-foreground ${
          isQuick ? "bg-transparent" : "bg-background"
        }`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MotionConfig reducedMotion="user">
          {isQuick ? (
            <div className="h-screen w-screen overflow-hidden bg-transparent">
              <SWRConfig value={SWR_OPTIONS}>
                {children}
                <Toaster
                  position="top-right"
                  closeButton
                  toastOptions={{ duration: 3000 }}
                />
              </SWRConfig>
            </div>
          ) : (
            <>
              <div className="grain" aria-hidden />
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
                  style={{ overflow: "hidden" }}
                >
                  <TitleBar
                    title="Listik"
                    showMinimize
                    showMaximize
                    showClose
                    className="bg-transparent"
                  />
                </div>
              </div>

              <div
                className={`bg-background p-2 pt-0 w-full overflow-hidden transition-all duration-300 ${
                  showTitleBar ? "h-[calc(100vh-32px)]" : "h-[calc(100vh-8px)]"
                }`}
              >
                <SWRConfig value={SWR_OPTIONS}>
                  {children}
                  <Toaster
                    position="top-right"
                    closeButton
                    toastOptions={{ duration: 3000 }}
                  />
                </SWRConfig>
              </div>
            </>
          )}
          </MotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
