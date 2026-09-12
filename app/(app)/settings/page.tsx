"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  Bot,
  Download,
  Info,
  Keyboard,
  List,
  Activity,
  Navigation,
  Paintbrush,
  Palette,
  Sparkles,
  Zap,
} from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { ThemeSetting } from "@/components/ThemeSetting";
import { AccentPicker } from "@/components/settings/AccentPicker";
import { NavSetting } from "@/components/settings/NavSetting";
import { PulseSetting } from "@/components/settings/PulseSetting";
import { ShortcutsSetting } from "@/components/settings/ShortcutsSetting";
import { GroqApiKeySetting } from "@/components/settings/GroqApiKeySetting";
import { AiProviderSetting } from "@/components/settings/AiProviderSetting";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { TimePicker } from "@/components/ui/time-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { exportBackup, manquants, resume } from "@/features/backup/export";

const APP_VERSION = "0.1.0";

/** Petite pastille « Bientôt » pour les fonctionnalités prévues. */
function SoonBadge() {
  return (
    <Badge
      variant="secondary"
      className="rounded-full text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      Bientôt
    </Badge>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const bilan = await exportBackup();
      // Rien à dire quand le dialogue a été refermé : ce n'est pas un échec.
      if (!bilan) return;
      // Les nombres, pas « Enregistré » : c'est ce qui dit que le fichier
      // contient bien ce qu'on croit.
      toast.success(`Sauvegarde enregistrée — ${resume(bilan)}.`);
      const perdu = manquants(bilan);
      // Une pièce dont le fichier a disparu garde sa fiche, pas ses octets.
      // Le taire ferait croire la sauvegarde complète.
      if (perdu) toast.warning(perdu);
    } catch (e) {
      console.error("export_backup:", e);
      toast.error("Échec de la sauvegarde");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative h-full overflow-y-auto bg-background">
      {/* Halo d'ambiance, cohérent avec le planner */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-80"
        style={{
          background:
            "radial-gradient(46% 60% at 50% -8%, var(--brand-soft), transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[42rem] px-6 pb-24 pt-12">
        <h1 className="text-large-title text-foreground">Réglages</h1>

        <div className="mt-8 space-y-7">
          <SettingsGroup title="Personnalisation" index={0}>
            <SettingsRow
              label="Couleur d'accent"
              description="Teinte la progression, les sélections et les états actifs."
              icon={Paintbrush}
              iconClassName="bg-brand-soft text-brand"
              stacked
            >
              <AccentPicker />
            </SettingsRow>
            <SettingsRow
              label="Navigation"
              description="Dock flottant d'icônes, ou barre latérale repliable (Ctrl+B)."
              icon={Navigation}
              iconClassName="bg-sky-500/8 text-sky-600 dark:text-sky-400"
              stacked
            >
              <NavSetting />
            </SettingsRow>
            <SettingsRow
              label="Pouls du jour"
              description="Anneau : ce qui est fait. Cadran : l'écart avec le temps qui passe. Barre : une cellule par tâche. Compte : ce qui reste, en gros."
              icon={Activity}
              iconClassName="bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
              stacked
            >
              <PulseSetting />
            </SettingsRow>
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
              <Switch
                checked={settings.daily_digest_enabled}
                onCheckedChange={(daily_digest_enabled) => update({ daily_digest_enabled })}
                aria-label="Activer le résumé quotidien"
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

          {/* Une seule ligne « Alt + Q » vivait ici, avec un `kbd` fait main
              plutôt que le composant `Kbd`. Le groupe devient la référence
              complète : c'est le seul endroit de l'app où l'annulation est
              nommée depuis qu'on n'annonce plus ce qui se voit. */}
          <SettingsGroup title="Raccourcis" index={2}>
            <SettingsRow
              label="Au clavier"
              description="Ce que l'app écoute, et où."
              icon={Zap}
              iconClassName="bg-orange-500/8 text-orange-600 dark:text-orange-400"
              stacked
            >
              <ShortcutsSetting />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="IA" index={3}>
            <SettingsRow
              label="Agent de l'Assistant"
              description="Le CLI qui répond dans l'Assistant (mode Question) — doit être installé sur cette machine."
              icon={Bot}
              iconClassName="bg-indigo-500/8 text-indigo-600 dark:text-indigo-400"
              stacked
            >
              <AiProviderSetting />
            </SettingsRow>
            <SettingsRow
              label="Clé API Groq"
              description="Correction du texte à la capture (dates, priorité, projet). Sans clé, l'analyse locale continue de fonctionner."
              icon={Sparkles}
              iconClassName="bg-amber-500/8 text-amber-600 dark:text-amber-400"
              stacked
            >
              <GroqApiKeySetting />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Données" index={4}>
            <SettingsRow
              label="Sauvegarder mes données"
              description="Tâches, projets, journal et réglages dans un fichier JSON — les pièces jointes dans un dossier à côté."
              icon={Download}
              iconClassName="bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
            >
              <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting && <Spinner data-icon="inline-start" />}
                {exporting ? "Export…" : "Exporter"}
              </Button>
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Prévu" index={5}>
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

          <SettingsGroup title="À propos" index={6}>
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
