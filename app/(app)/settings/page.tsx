"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { AnimatePresence, motion } from "motion/react";
import {
  AiSettingIcon, CalendarClockIcon, CloudDownloadIcon, MagicWand01Icon, PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { ThemeSetting } from "@/components/ThemeSetting";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { REPLAY_ONBOARDING_EVENT } from "@/features/onboarding/onboarding";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import { AccentPicker } from "@/components/settings/AccentPicker";
import { AiProviderSetting } from "@/components/settings/AiProviderSetting";
import { GroqApiKeySetting } from "@/components/settings/GroqApiKeySetting";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { useUIPrefs, type NavStyle } from "@/components/ui-prefs";
import { Segmented } from "@/components/ui/segmented";
import { PulseSetting } from "@/components/settings/PulseSetting";
import { ReflectionSetting } from "@/components/settings/ReflectionSetting";
import { ShortcutsSetting } from "@/components/settings/ShortcutsSetting";
import { useSettings } from "@/hooks/useSettings";
import { exitTween, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { exportBackup, manquants, resume } from "@/features/backup/export";
import { chooseBackup, restoreBackup } from "@/features/backup/restore";

const NAV_OPTIONS: { value: NavStyle; label: string }[] = [
  { value: "dock", label: "Dock" },
  { value: "sidebar", label: "Barre latérale" },
];
const SECTIONS = [
  { id: "appearance", label: "Apparence", description: "Ce que vous voyez au quotidien", icon: PaintBoardIcon },
  { id: "rhythm", label: "Rythme", description: "Avancement et rappels", icon: CalendarClockIcon },
  { id: "quick", label: "Fenêtre rapide", description: "Capture et raccourcis", icon: MagicWand01Icon },
  { id: "assistant", label: "Assistant", description: "CLI et correction intelligente", icon: AiSettingIcon },
  { id: "data", label: "Données", description: "Sauvegarde et informations", icon: CloudDownloadIcon },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const contentMotion = {
  initial: { opacity: 0, y: 8, scale: 0.992 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { opacity: { duration: 0.16 }, default: spring.smooth } },
  exit: { opacity: 0, y: -4, scale: 0.992, transition: { opacity: { duration: 0.12 }, default: exitTween } },
};

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const [active, setActive] = useState<SectionId>("appearance");
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<string | null>(null);
  const handleExport = async () => {
    setExporting(true);
    try {
      const bilan = await exportBackup();
      if (!bilan) return;
      toast.success(`Sauvegarde enregistrée — ${resume(bilan)}.`);
      const perdu = manquants(bilan);
      if (perdu) toast.warning(perdu);
    } catch (error) {
      console.error("export_backup:", error);
      toast.error("Échec de la sauvegarde");
    } finally { setExporting(false); }
  };
  const handleChooseRestore = async () => {
    try { setBackupToRestore(await chooseBackup()); }
    catch (error) { console.error("choose_backup:", error); toast.error("Impossible d’ouvrir la sauvegarde"); }
  };
  const handleRestore = async () => {
    if (!backupToRestore) return;
    setRestoring(true);
    try {
      const bilan = await restoreBackup(backupToRestore);
      toast.success(`Sauvegarde restaurée — ${bilan.taches} tâche${bilan.taches > 1 ? "s" : ""}, ${bilan.jours} jour${bilan.jours > 1 ? "s" : ""} de journal.`);
      setBackupToRestore(null);
    } catch (error) { console.error("restore_backup:", error); toast.error("Échec de la restauration"); }
    finally { setRestoring(false); }
  };

  return <div className="h-full overflow-y-auto bg-background">
    <div className="mx-auto max-w-[58rem] px-5 pb-20 pt-10 sm:px-8 lg:pt-14">
      <h1 className="text-large-title text-foreground">Réglages</h1>
      <div className="mt-8 grid items-start gap-8 lg:mt-10 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-14">
        <SettingsNavigation active={active} onChange={setActive} />
        <AnimatePresence mode="wait" initial={false}><motion.section key={active} id={`${active}-panel`} role="region" aria-labelledby={`${active}-heading`} variants={contentMotion} initial="initial" animate="animate" exit="exit" className="min-w-0 max-w-[40rem]">
          {active === "appearance" && <AppearanceSection />}
          {active === "rhythm" && <RhythmSection settings={settings} update={update} />}
          {active === "quick" && <QuickSection />}
          {active === "assistant" && <AssistantSection />}
          {active === "data" && <DataSection exporting={exporting} restoring={restoring} onExport={handleExport} onChooseRestore={handleChooseRestore} />}
        </motion.section></AnimatePresence>
      </div>
    </div>
    <AlertDialog open={backupToRestore !== null} onOpenChange={(open) => { if (!open && !restoring) setBackupToRestore(null); }}><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Remplacer les données locales ?</AlertDialogTitle><AlertDialogDescription>Les tâches, projets, journal, réglages et pièces actuels seront remplacés par cette sauvegarde. Cette action ne peut pas être annulée.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={restoring}>Annuler</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={restoring} onClick={(event) => { event.preventDefault(); void handleRestore(); }}>{restoring && <Spinner data-icon="inline-start" />}{restoring ? "Restauration…" : "Restaurer"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

/** Rubriques : une liste sobre, comme le rail du Planificateur — la pastille de l'entrée active glisse. */
function SettingsNavigation({ active, onChange }: { active: SectionId; onChange: (section: SectionId) => void }) {
  return <nav aria-label="Rubriques des réglages" className="lg:sticky lg:top-8"><div className="flex flex-wrap gap-0.5 lg:flex-col">
    {SECTIONS.map((section) => { const selected = active === section.id; return <button key={section.id} type="button" onClick={() => onChange(section.id)} aria-current={selected ? "page" : undefined} aria-controls={`${section.id}-panel`} className={cn("relative isolate flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/50", selected ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
      {selected && <motion.span layoutId="settings-nav-pill" aria-hidden className="absolute inset-0 -z-10 rounded-lg bg-foreground/[0.055]" transition={spring.snappy} />}
      <AppIcon icon={section.icon} size={16} className={selected ? "text-brand" : undefined} />{section.label}
    </button>; })}
  </div></nav>;
}

function SettingsSection({ id, title, description, children }: { id: SectionId; title: string; description: string; children: ReactNode }) {
  return <div><div className="mb-7"><h2 id={`${id}-heading`} className="text-title-2 text-foreground">{title}</h2><p className="mt-1.5 text-sm text-muted-foreground">{description}</p></div><div className="flex flex-col gap-9">{children}</div></div>;
}

function NavStyleSetting() {
  const { nav, setNav } = useUIPrefs();
  return <Segmented options={NAV_OPTIONS} value={nav} onChange={setNav} aria-label="Navigation" />;
}

function AppearanceSection() { return <SettingsSection id="appearance" title="Apparence" description="Appliquée tout de suite, dans l’app comme dans la fenêtre rapide.">
  <SettingsGroup>
    <ThemeSetting />
    <SettingsRow label="Couleur d’accent" description="Sélections, progression et actions actives."><AccentPicker size="sm" /></SettingsRow>
    <SettingsRow label="Navigation" description="Un dock flottant ou une barre latérale."><NavStyleSetting /></SettingsRow>
  </SettingsGroup>
</SettingsSection>; }

function RhythmSection({ settings, update }: { settings: { daily_digest_enabled: boolean; daily_digest_time: string }; update: (payload: { daily_digest_enabled?: boolean; daily_digest_time?: string }) => Promise<void> }) { return <SettingsSection id="rhythm" title="Rythme" description="Ce qui vous accompagne au fil de la journée.">
  <SettingsGroup>
    <SettingsRow label="Pouls du jour" description="La façon dont le Planificateur montre votre avancement."><PulseSetting /></SettingsRow>
    <SettingsRow label="Résumé quotidien" description="Une notification avec les tâches du jour, à heure fixe."><Switch checked={settings.daily_digest_enabled} onCheckedChange={(daily_digest_enabled) => void update({ daily_digest_enabled })} aria-label="Activer le résumé quotidien" /></SettingsRow>
    <AnimatePresence initial={false}>{settings.daily_digest_enabled && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1, transition: { opacity: { duration: 0.18 }, default: spring.smooth } }} exit={{ height: 0, opacity: 0, transition: exitTween }} className="overflow-hidden">
      <SettingsRow nested label="Heure d’envoi"><TimePicker value={settings.daily_digest_time} onChange={(daily_digest_time) => void update({ daily_digest_time: daily_digest_time || "08:00" })} /></SettingsRow>
    </motion.div>}</AnimatePresence>
  </SettingsGroup>
</SettingsSection>; }

function QuickSection() { return <SettingsSection id="quick" title="Fenêtre rapide" description="La capture sans quitter ce que vous faites, et ses raccourcis.">
  <SettingsGroup title="Bulle de réflexion">
    <SettingsRow stacked label="Pendant que l’Assistant réfléchit" description="Seule la bulle choisie s’anime, pour que la page reste calme."><ReflectionSetting /></SettingsRow>
  </SettingsGroup>
  <div><h3 className="mb-4 text-sm font-medium text-foreground">Raccourcis clavier</h3><ShortcutsSetting /></div>
</SettingsSection>; }

function AssistantSection() { return <SettingsSection id="assistant" title="Assistant" description="Le CLI qui répond dans vos conversations. Il n’agit dans Listik que quand vous lui demandez.">
  <AiProviderSetting />
  <SettingsGroup title="Correction de capture">
    <SettingsRow stacked label="Clé Groq" description="Aide à comprendre une phrase saisie dans la fenêtre rapide. Distincte de l’Assistant."><GroqApiKeySetting /></SettingsRow>
  </SettingsGroup>
</SettingsSection>; }

function DataSection({ exporting, restoring, onExport, onChooseRestore }: { exporting: boolean; restoring: boolean; onExport: () => Promise<void>; onChooseRestore: () => Promise<void> }) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => { getVersion().then(setVersion).catch(() => setVersion(null)); }, []);
  return <SettingsSection id="data" title="Données" description="Vos données restent sur cet ordinateur. Gardez-en une copie.">
    <SettingsGroup>
      <SettingsRow label="Sauvegarder" description="Tâches, projets, journal et réglages dans un fichier JSON, pièces jointes dans un dossier voisin."><Button size="sm" variant="outline" onClick={() => void onExport()} disabled={exporting}>{exporting && <Spinner data-icon="inline-start" />}{exporting ? "Export…" : "Exporter"}</Button></SettingsRow>
      <SettingsRow label="Restaurer" description="Remplace les données de cet ordinateur par une sauvegarde Listik."><Button size="sm" variant="outline" onClick={() => void onChooseRestore()} disabled={restoring}>{restoring && <Spinner data-icon="inline-start" />}Choisir un fichier</Button></SettingsRow>
      <SettingsRow label="Accueil" description="Le parcours du premier lancement : capture rapide, couleur, navigation."><Button size="sm" variant="outline" onClick={() => window.dispatchEvent(new Event(REPLAY_ONBOARDING_EVENT))}>Revoir</Button></SettingsRow>
    </SettingsGroup>
    {version && <p className="text-xs text-muted-foreground">Listik <span className="tabular-nums">{version}</span></p>}
  </SettingsSection>;
}
