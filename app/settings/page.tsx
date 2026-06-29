"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { useSettings } from "@/hooks/useSettings";
import { ThemeSetting } from "@/components/ThemeSetting";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { TimePicker } from "@/components/ui/time-picker";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { SettingsRow } from "@/components/settings/SettingsRow";

const APP_VERSION = "0.1.0";

/** Petite pastille « Bientôt » pour les fonctionnalités prévues. */
function SoonBadge() {
  return (
    <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      Bientôt
    </span>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { settings, update } = useSettings();

  return (
    <div className="relative h-full overflow-y-auto bg-background">
      {/* Halo d'ambiance, cohérent avec le planner */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-80"
        style={{
          background:
            "radial-gradient(46% 60% at 50% -8%, oklch(0.62 0.10 265 / 0.10), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[40rem] px-8 pb-24 pt-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="-ml-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft size={16} />
          Retour
        </button>

        <h1 className="mt-5 font-serif text-4xl leading-none tracking-tight text-foreground">
          Paramètres
        </h1>

        <div className="mt-9 space-y-8">
          <SettingsGroup title="Apparence">
            <SettingsRow
              label="Thème"
              description="Suit le système par défaut."
              stacked
            >
              <ThemeSetting />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Notifications">
            <SettingsRow
              label="Résumé quotidien"
              description="Une notification listant les tâches du jour, à heure fixe."
            >
              <ToggleSwitch
                checked={settings.daily_digest_enabled}
                onChange={(daily_digest_enabled) => update({ daily_digest_enabled })}
                label="Activer le résumé quotidien"
              />
            </SettingsRow>

            {settings.daily_digest_enabled && (
              <SettingsRow label="Heure d'envoi" stacked>
                <TimePicker
                  value={settings.daily_digest_time}
                  onChange={(daily_digest_time) =>
                    update({ daily_digest_time: daily_digest_time || "08:00" })
                  }
                />
              </SettingsRow>
            )}
          </SettingsGroup>

          <SettingsGroup title="Raccourcis">
            <SettingsRow
              label="Capture rapide"
              description="Ouvrir la barre de capture depuis n'importe où."
            >
              <kbd className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground/80">
                Alt + Q
              </kbd>
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Prévu">
            <SettingsRow
              label="Listes & projets"
              description="Renommer, réordonner et colorer tes listes."
              dimmed
            >
              <SoonBadge />
            </SettingsRow>
            <SettingsRow
              label="Export des données"
              description="Sauvegarder et restaurer tes tâches."
              dimmed
            >
              <SoonBadge />
            </SettingsRow>
            <SettingsRow
              label="Raccourcis personnalisés"
              description="Choisir tes propres combinaisons de touches."
              dimmed
            >
              <SoonBadge />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="À propos">
            <SettingsRow label="Listik" description="Gestionnaire de tâches, épuré.">
              <span className="font-mono text-xs text-muted-foreground/70">
                v{APP_VERSION}
              </span>
            </SettingsRow>
          </SettingsGroup>
        </div>
      </div>
    </div>
  );
}
