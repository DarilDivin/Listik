"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Settings as SettingsIcon } from "lucide-react";

import { useSettings } from "@/hooks/useSettings";
import { TimePicker } from "@/components/ui/time-picker";
import { ThemeSetting } from "@/components/ThemeSetting";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
      {children}
    </p>
  );
}

/**
 * Menu Réglages (engrenage) : accès rapide à l'apparence et au résumé quotidien,
 * et raccourci vers la page Paramètres complète. Surface « liquid glass ».
 */
export function SettingsMenu() {
  const { settings, update } = useSettings();
  const router = useRouter();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Réglages"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <SettingsIcon size={16} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={8}
        className="w-72 bg-popover/80 p-4 backdrop-blur-xl"
      >
        <section>
          <SectionLabel>Apparence</SectionLabel>
          <ThemeSetting />
        </section>

        <section className="mt-5">
          <SectionLabel>Résumé quotidien</SectionLabel>
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs leading-snug text-muted-foreground">
              Une notification listant les tâches du jour.
            </p>
            <ToggleSwitch
              checked={settings.daily_digest_enabled}
              onChange={(daily_digest_enabled) => update({ daily_digest_enabled })}
              label="Activer le résumé quotidien"
            />
          </div>

          {settings.daily_digest_enabled && (
            <div className="mt-3">
              <span className="mb-2 block text-xs text-muted-foreground">
                Heure d&apos;envoi
              </span>
              <TimePicker
                value={settings.daily_digest_time}
                onChange={(daily_digest_time) =>
                  update({ daily_digest_time: daily_digest_time || "08:00" })
                }
              />
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="mt-5 flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Ouvrir les paramètres
          <ArrowRight size={14} className="opacity-70" />
        </button>
      </PopoverContent>
    </Popover>
  );
}
