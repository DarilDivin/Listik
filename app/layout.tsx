"use client";
import "./globals.css";
import TitleBar from "@/components/TitleBar";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";
import { SWRConfig } from "swr";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UIPrefsProvider } from "@/components/ui-prefs";
import { UpdateManager } from "@/components/UpdateManager";
import { useIsMac } from "@/lib/keys";

const SWR_OPTIONS = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  dedupingInterval: 2000,
} as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [showTitleBar, setShowTitleBar] = useState(false);
  // La barre de capture rapide est une fenêtre flottante transparente : elle ne
  // doit hériter ni du fond `bg-background` ni de la TitleBar.
  // `trailingSlash: true` (next.config) → le chemin est « /quick/ » : on normalise.
  const pathname = usePathname()?.replace(/\/$/, "");
  const isQuick = pathname === "/quick";
  // Le panneau du tray : une fenêtre opaque sans chrome (ni TitleBar, ni
  // grain), dont la page occupe toute la surface.
  const isTray = pathname === "/tray";
  // Sur Mac, la fenêtre garde ses trois pastilles natives (barre de titre
  // « Overlay », voir tauri.macos.conf.json) : une bande fixe de 28 px leur
  // fait place et sert de poignée, à la place de la TitleBar Windows 11.
  const mac = useIsMac();

  return (
    <html lang="fr" className="h-full" suppressHydrationWarning>
      <body
        className={`h-full m-0 p-0 antialiased text-foreground ${
          isQuick ? "quick-window" : ""
        } ${
          isQuick ? "bg-transparent" : "bg-background"
        }`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <UIPrefsProvider>
            <TooltipProvider delayDuration={250}>
            <MotionConfig reducedMotion="user">
              {isTray ? (
                <SWRConfig value={SWR_OPTIONS}>{children}</SWRConfig>
              ) : isQuick ? (
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
                  {mac ? (
                    <div data-tauri-drag-region className="h-7 shrink-0 select-none" />
                  ) : (
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
                  )}

                  <div
                    className={`bg-background p-2 pt-0 w-full overflow-hidden transition-all duration-300 ${
                      mac ? "h-[calc(100vh-28px)]" : showTitleBar ? "h-[calc(100vh-32px)]" : "h-[calc(100vh-8px)]"
                    }`}
                  >
                  <SWRConfig value={SWR_OPTIONS}>
                    <UpdateManager />
                    {children}
                      <Toaster
                        position="bottom-right"
                        closeButton
                        offset={{ bottom: 20, right: 20 }}
                        toastOptions={{ duration: 3000 }}
                      />
                    </SWRConfig>
                  </div>
                </>
              )}
            </MotionConfig>
            </TooltipProvider>
          </UIPrefsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
