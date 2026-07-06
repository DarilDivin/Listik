"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, Download, Info, Keyboard, List, Palette, Zap } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { ThemeSetting } from "@/components/ThemeSetting";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { TimePicker } from "@/components/ui/time-picker";
import { Button } from "@/components/ui/button";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { exportBackup } from "@/features/backup/export";

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
  const { settings, update } = useSettings();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const path = await exportBackup();
      if (path) toast.success("Sauvegarde enregistrée");
    } catch (e) {
      console.error("export_backup:", e);
      toast.error("Échec de la sauvegarde");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative h-full overflow-y-auto bg-secondary dark:bg-background">
      {/* Halo d'ambiance, cohérent avec le planner */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-80"
        style={{
          background:
            "radial-gradient(46% 60% at 50% -8%, oklch(0.62 0.10 265 / 0.10), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[42rem] px-6 pb-24 pt-12">
        <h1 className="text-large-title text-foreground">Réglages</h1>

        <div className="mt-8 space-y-7">
          <SettingsGroup title="Apparence" index={0}>
            <SettingsRow
              label="Thème"
              description="Suit le système par défaut."
              icon={Palette}
              iconClassName="bg-indigo-500/8 text-indigo-600 dark:text-indigo-400"
              stacked
            >
              <ThemeSetting />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Notifications" index={1}>
            <SettingsRow
              label="Résumé quotidien"
              description="Une notification listant les tâches du jour, à heure fixe."
              icon={Bell}
              iconClassName="bg-rose-500/8 text-rose-600 dark:text-rose-400"
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

          <SettingsGroup title="Raccourcis" index={2}>
            <SettingsRow
              label="Capture rapide"
              description="Ouvrir la barre de capture depuis n'importe où."
              icon={Zap}
              iconClassName="bg-orange-500/8 text-orange-600 dark:text-orange-400"
            >
              <kbd className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11px] text-foreground/80">
                Alt + Q
              </kbd>
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Données" index={3}>
            <SettingsRow
              label="Sauvegarder mes données"
              description="Exporte toutes tes tâches et notes dans un fichier JSON."
              icon={Download}
              iconClassName="bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
            >
              <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? "Export…" : "Exporter"}
              </Button>
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Prévu" index={4}>
            <SettingsRow
              label="Listes & projets"
              description="Renommer, réordonner et colorer tes listes."
              icon={List}
              iconClassName="bg-sky-500/8 text-sky-600 dark:text-sky-400"
              dimmed
            >
              <SoonBadge />
            </SettingsRow>
            <SettingsRow
              label="Raccourcis personnalisés"
              description="Choisir tes propres combinaisons de touches."
              icon={Keyboard}
              iconClassName="bg-violet-500/8 text-violet-600 dark:text-violet-400"
              dimmed
            >
              <SoonBadge />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="À propos" index={5}>
            <SettingsRow
              label="Listik"
              description="Gestionnaire de tâches, épuré."
              icon={Info}
              iconClassName="bg-slate-500/8 text-slate-600 dark:text-slate-400"
            >
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
