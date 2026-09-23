"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Activity01Icon, AiSettingIcon, BrushIcon, CalendarClockIcon, CloudDownloadIcon,
  InformationCircleIcon, KeyboardIcon, MagicWand01Icon, Notification01Icon, PaintBoardIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { ThemeSetting } from "@/components/ThemeSetting";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { TimePicker } from "@/components/ui/time-picker";
import { AccentPicker } from "@/components/settings/AccentPicker";
import { AiProviderSetting } from "@/components/settings/AiProviderSetting";
import { GroqApiKeySetting } from "@/components/settings/GroqApiKeySetting";
import { NavSetting } from "@/components/settings/NavSetting";
import { PulseSetting } from "@/components/settings/PulseSetting";
import { ReflectionSetting } from "@/components/settings/ReflectionSetting";
import { ShortcutsSetting } from "@/components/settings/ShortcutsSetting";
import { useSettings } from "@/hooks/useSettings";
import { exitTween, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { exportBackup, manquants, resume } from "@/features/backup/export";
import { chooseBackup, restoreBackup } from "@/features/backup/restore";

const APP_VERSION = "0.1.0";
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

  return <div className="relative h-full overflow-y-auto bg-background">
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[24rem] opacity-90" style={{ background: "radial-gradient(44% 54% at 52% -10%, var(--brand-soft), transparent 74%)" }} />
    <div className="relative mx-auto max-w-[70rem] px-5 pb-20 pt-10 sm:px-8 lg:pt-14">
      <header className="max-w-xl"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Listik</p><h1 className="mt-2 text-large-title text-foreground">Réglages</h1><p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">Ajustez l’application à votre manière de planifier, de capturer et de demander.</p></header>
      <div className="mt-10 grid items-start gap-7 lg:grid-cols-[12.5rem_minmax(0,42rem)] lg:gap-12">
        <SettingsNavigation active={active} onChange={setActive} />
        <AnimatePresence mode="wait" initial={false}><motion.section key={active} id={`${active}-panel`} role="region" aria-labelledby={`${active}-heading`} variants={contentMotion} initial="initial" animate="animate" exit="exit" className="min-w-0">
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

function SettingsNavigation({ active, onChange }: { active: SectionId; onChange: (section: SectionId) => void }) {
  return <nav aria-label="Sections des réglages" className="lg:sticky lg:top-8"><p className="mb-2 hidden px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:block">Rubriques</p><div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:flex lg:flex-col">
    {SECTIONS.map((section) => { const selected = active === section.id; return <button key={section.id} type="button" onClick={() => onChange(section.id)} aria-pressed={selected} aria-controls={`${section.id}-panel`} className={cn("group relative flex min-h-12 items-center gap-2 rounded-xl px-2.5 py-2 text-left outline-none transition-colors duration-150 focus-visible:bg-brand-soft", selected ? "bg-brand-soft text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}>
      <AppIcon icon={section.icon} size={17} className={selected ? "text-brand" : "text-muted-foreground group-hover:text-foreground"} /><span className="min-w-0"><span className="block text-sm font-medium">{section.label}</span><span className="hidden text-[11px] leading-tight text-muted-foreground lg:block">{section.description}</span></span>
    </button>; })}
  </div></nav>;
}

function SettingsSection({ id, eyebrow, title, description, children }: { id: SectionId; eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <div><div className="mb-7 max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</p><h2 id={`${id}-heading`} className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></div><div className="space-y-8">{children}</div></div>;
}

function SettingBlock({ icon, title, description, children }: { icon: IconSvgElement; title: string; description: string; children: ReactNode }) {
  return <section className="px-1 py-1 sm:px-2"><div className="flex items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><AppIcon icon={icon} size={17} /></span><div className="min-w-0"><h3 className="text-sm font-semibold text-foreground">{title}</h3><p className="mt-0.5 max-w-[58ch] text-xs leading-relaxed text-muted-foreground">{description}</p></div></div><div className="mt-4 pl-0 sm:pl-11">{children}</div></section>;
}

function AppearanceSection() { return <SettingsSection id="appearance" eyebrow="Personnaliser" title="Votre espace de travail" description="Les changements s’appliquent tout de suite, dans l’application comme dans la fenêtre rapide.">
  <SettingBlock icon={BrushIcon} title="Thème" description="Choisissez comment Listik suit la lumière autour de vous."><ThemeSetting /></SettingBlock>
  <SettingBlock icon={PaintBoardIcon} title="Couleur d’accent" description="Elle marque les sélections, la progression et les actions actives."><AccentPicker /></SettingBlock>
  <SettingBlock icon={Activity01Icon} title="Navigation" description="Choisissez l’accès qui convient le mieux à votre espace de travail."><NavSetting /></SettingBlock>
</SettingsSection>; }

function RhythmSection({ settings, update }: { settings: { daily_digest_enabled: boolean; daily_digest_time: string }; update: (payload: { daily_digest_enabled?: boolean; daily_digest_time?: string }) => Promise<void> }) { return <SettingsSection id="rhythm" eyebrow="Au fil de la journée" title="Rythme et rappels" description="Gardez visible ce qui compte aujourd’hui, avec le niveau de présence qui vous convient.">
  <SettingBlock icon={Activity01Icon} title="Pouls du jour" description="Affichage de votre avancement dans le Planificateur."><PulseSetting /></SettingBlock>
  <SettingBlock icon={Notification01Icon} title="Résumé quotidien" description="Recevez un rappel des tâches du jour à l’heure qui vous convient."><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-medium text-foreground">Recevoir le résumé</p><p className="mt-0.5 text-xs text-muted-foreground">Une seule notification, à heure fixe.</p></div><Switch checked={settings.daily_digest_enabled} onCheckedChange={(daily_digest_enabled) => void update({ daily_digest_enabled })} aria-label="Activer le résumé quotidien" /></div><AnimatePresence initial={false}>{settings.daily_digest_enabled && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={spring.snappy} className="mt-4 rounded-xl bg-background/70 p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Heure d’envoi</p><TimePicker value={settings.daily_digest_time} onChange={(daily_digest_time) => void update({ daily_digest_time: daily_digest_time || "08:00" })} /></motion.div>}</AnimatePresence></SettingBlock>
</SettingsSection>; }

function QuickSection() { return <SettingsSection id="quick" eyebrow="Capturer sans interrompre" title="Fenêtre rapide" description="Réglez le geste qui ouvre Listik et la présence qui accompagne l’attente de l’Assistant.">
  <SettingBlock icon={MagicWand01Icon} title="Bulle de réflexion" description="Fusion est le mouvement par défaut : les pastilles se rejoignent pendant la réponse."><ReflectionSetting /></SettingBlock>
  <SettingBlock icon={KeyboardIcon} title="Raccourcis clavier" description="Les gestes disponibles partout et dans chaque partie de Listik."><ShortcutsSetting /></SettingBlock>
</SettingsSection>; }

function AssistantSection() { return <SettingsSection id="assistant" eyebrow="Conversation et capture" title="Assistant" description="Connectez un CLI installé sur cet ordinateur, puis choisissez celui qui répond dans vos conversations.">
  <SettingBlock icon={AiSettingIcon} title="Assistant conversationnel" description="Le CLI choisi peut lire et agir dans Listik seulement lorsque vous lui adressez une demande."><AiProviderSetting /></SettingBlock>
  <SettingBlock icon={MagicWand01Icon} title="Correction de capture" description="Groq aide à comprendre une phrase saisie dans la fenêtre rapide. Cette clé reste distincte de l’Assistant conversationnel."><GroqApiKeySetting /></SettingBlock>
</SettingsSection>; }

function DataSection({ exporting, restoring, onExport, onChooseRestore }: { exporting: boolean; restoring: boolean; onExport: () => Promise<void>; onChooseRestore: () => Promise<void> }) { return <SettingsSection id="data" eyebrow="Garder la main" title="Données et application" description="Conservez une copie de vos données et retrouvez les informations de cette version de Listik.">
  <SettingBlock icon={CloudDownloadIcon} title="Sauvegarder mes données" description="Tâches, projets, journal et réglages dans un fichier JSON ; les pièces jointes restent dans un dossier voisin."><Button size="sm" variant="outline" onClick={() => void onExport()} disabled={exporting}>{exporting && <Spinner data-icon="inline-start" />}{exporting ? "Export en cours…" : "Exporter une sauvegarde"}</Button></SettingBlock>
  <SettingBlock icon={CloudDownloadIcon} title="Restaurer une sauvegarde" description="Remplace les données de cet appareil par une sauvegarde Listik et son dossier de pièces jointes."><Button size="sm" variant="outline" onClick={() => void onChooseRestore()} disabled={restoring}>{restoring && <Spinner data-icon="inline-start" />}Restaurer depuis un fichier</Button></SettingBlock>
  <section className="flex items-center gap-3 px-1 py-2 text-muted-foreground"><AppIcon icon={InformationCircleIcon} size={17} /><p className="text-xs">Listik <span className="font-mono">v{APP_VERSION}</span> <span className="mx-1 text-foreground/20">·</span> Les listes et raccourcis personnalisés arrivent bientôt.</p></section>
</SettingsSection>; }
