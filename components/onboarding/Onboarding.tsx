"use client";

import localFont from "next/font/local";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft01Icon,
  Calendar03Icon,
  InboxIcon,
  Notebook01Icon,
  StarIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/ui/app-icon";
import { ListikLogotype } from "@/components/brand/ListikLogo";
import { ListikLogoAnimated } from "@/components/brand/ListikLogoAnimated";
import BarreTache from "@/components/BarreTache";
import { QUICK_NEXT_MODE_EVENT } from "@/components/QuickPills";
import { AccentPicker } from "@/components/settings/AccentPicker";
import { NavSetting } from "@/components/settings/NavSetting";
import { journalApi } from "@/features/journal/api";
import {
  ONBOARDING_DONE,
  ONBOARDING_KEY,
  REPLAY_ONBOARDING_EVENT,
  decideOnboarding,
  destinationOf,
  newIds,
  type Destination,
} from "@/features/onboarding/onboarding";
import { areasApi, projectsApi } from "@/features/projects/api";
import { TODOS_CHANGED, todosApi } from "@/features/todos/api";
import { useCaptureTask } from "@/features/todos/useCaptureTask";
import { todayLocalISODate } from "@/lib/date";
import { useAltKey, useCommandKey } from "@/lib/keys";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/*
 * Fraunces, la police du logotype, sert uniquement aux titres de l'accueil :
 * c'est le moment de marque de l'app. Le reste de l'interface garde la police
 * système (voir docs/DESIGN-SYSTEM.md).
 */
const fraunces = localFont({ src: "../../app/fonts/fraunces.woff2", weight: "300 600", display: "swap" });

const STEPS = ["Bienvenue", "Le geste", "Votre couleur", "C'est prêt"] as const;

interface Captured {
  text: string;
  destination: Destination;
}

function markDone() {
  try {
    localStorage.setItem(ONBOARDING_KEY, ONBOARDING_DONE);
  } catch {
    /* stockage indisponible : l'accueil pourra revenir, sans conséquence */
  }
}

/**
 * L'accueil du premier lancement : trois écrans et une fin, une minute, et
 * « Passer » toujours visible. Le moment qui compte est le deuxième : la
 * personne appuie vraiment sur Alt+Q, la fenêtre rapide s'ouvre en mode Tâche
 * (une seule fois, via QUICK_NEXT_MODE_EVENT), et l'accueil montre où la vraie
 * tâche a atterri. Si Alt+Q est pris par une autre application, un champ de
 * secours fait la même chose ici.
 */
export function Onboarding() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [fallback, setFallback] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Qui le voit : une installation neuve seulement (voir decideOnboarding).
  useEffect(() => {
    let alive = true;
    (async () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(ONBOARDING_KEY);
      } catch {
        return;
      }
      if (stored) return;
      try {
        const month = todayLocalISODate().slice(0, 7);
        const [todos, projects, areas, days] = await Promise.all([
          todosApi.list(),
          projectsApi.list(),
          areasApi.list(),
          journalApi.countByMonth(month),
        ]);
        if (!alive) return;
        const decision = decideOnboarding(stored, {
          todos: todos.length,
          projects: projects.length,
          areas: areas.length,
          journalDays: days.length,
        });
        if (decision === "show") setOpen(true);
        else if (decision === "mark-done") markDone();
      } catch {
        /* hors de Tauri (navigateur seul) : pas d'accueil */
      }
    })();

    const replay = () => {
      setStep(0);
      setCaptured(null);
      setFallback(false);
      setOpen(true);
    };
    window.addEventListener(REPLAY_ONBOARDING_EVENT, replay);
    return () => {
      alive = false;
      window.removeEventListener(REPLAY_ONBOARDING_EVENT, replay);
    };
  }, []);

  // Le geste : la prochaine ouverture d'Alt+Q se fait en mode Tâche, et la
  // tâche créée est repérée par différence avec l'instantané de départ
  // (todos:changed part aussi pour un simple réordonnancement).
  useEffect(() => {
    if (!open || step !== 1 || captured) return;
    let alive = true;
    let before: Set<string> | null = null;
    emit(QUICK_NEXT_MODE_EVENT, "tache").catch(() => {});
    todosApi
      .list()
      .then((all) => {
        before = new Set(all.map((t) => t.id));
      })
      .catch(() => {});

    const check = async () => {
      if (!before) return;
      const all = await todosApi.list();
      const ids = newIds(before, all);
      if (!alive || ids.length === 0) return;
      const todo = all.find((t) => t.id === ids[ids.length - 1]);
      if (!todo) return;
      setCaptured({ text: todo.text, destination: destinationOf(todo.scheduled_for, todayLocalISODate()) });
      // Si la capture venait d'Alt+Q depuis une autre application, Listik revient au premier plan.
      invoke("show_main_window").catch(() => {});
    };
    const unlisten = listen(TODOS_CHANGED, () => void check());
    return () => {
      alive = false;
      void unlisten.then((stop) => stop());
      emit(QUICK_NEXT_MODE_EVENT, null).catch(() => {});
    };
  }, [open, step, captured]);

  const finish = useCallback(() => {
    markDone();
    setOpen(false);
    router.push("/");
  }, [router]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  }, [step, finish]);

  // Échap = Passer, comme toute fenêtre de dialogue ; le focus suit l'étape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  useEffect(() => {
    if (open) primaryRef.current?.focus({ preventScroll: true });
  }, [open, step, captured]);

  const primaryLabel =
    step === 0 ? "Commencer" : step === 1 ? (captured ? "Continuer" : "Passer cette étape") : step === 2 ? "Continuer" : "Ouvrir Aujourd’hui";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background text-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.28 } }}
        >
          {/* Halo très doux de l'accent, comme les en-têtes de page de l'app. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[55%]"
            style={{ background: "radial-gradient(60% 70% at 50% 0%, var(--brand-soft), transparent 70%)" }}
          />

          <header className="relative flex items-center justify-between px-8 pt-6">
            <ol className="flex items-center gap-1.5" aria-label={`Étape ${step + 1} sur ${STEPS.length}`}>
              {STEPS.map((label, i) => (
                <li key={label} className="flex">
                  <motion.span
                    className={cn("block h-1.5 rounded-full", i <= step ? "bg-brand" : "bg-foreground/12")}
                    animate={{ width: i === step ? 28 : 8 }}
                    transition={spring.smooth}
                  />
                  <span className="sr-only">{label}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={finish}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            >
              Passer
            </button>
          </header>

          <main className="relative grid flex-1 place-items-center px-8 py-10">
            <div className="w-full max-w-[600px]">
              <AnimatePresence mode="wait">
                <motion.section
                  key={step}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.16 } }}
                  transition={{ opacity: { duration: 0.25 }, default: spring.smooth }}
                >
                  {step === 0 && <WelcomeStep />}
                  {step === 1 && (
                    <GestureStep captured={captured} fallback={fallback} onFallback={() => setFallback(true)} />
                  )}
                  {step === 2 && <ColorStep />}
                  {step === 3 && <ReadyStep />}
                </motion.section>
              </AnimatePresence>
            </div>
          </main>

          <footer className="relative flex items-center justify-between gap-4 px-8 pb-8">
            <div>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                >
                  <AppIcon icon={ArrowLeft01Icon} size={16} />
                  Retour
                </button>
              )}
            </div>
            <motion.button
              ref={primaryRef}
              type="button"
              onClick={next}
              whileTap={{ scale: 0.97 }}
              className={cn(
                "h-11 rounded-full px-6 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                step === 1 && !captured
                  ? "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                  : "bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              {primaryLabel}
            </motion.button>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h1
      id="onboarding-title"
      className={cn(fraunces.className, "text-balance text-[42px] font-[440] leading-[1.04] tracking-[-0.02em] text-foreground")}
    >
      {children}
    </h1>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}

function WelcomeStep() {
  return (
    <div>
      <ListikLogoAnimated className="h-[76px] w-auto text-foreground" delay={0.15} />
      <div className="mt-10">
        <Title>Une touche, l’idée est posée.</Title>
        <Lead>
          Listik note vos tâches, vos pensées et vos questions, puis les range dans un planificateur et un journal.
          Sans compte : vos tâches et votre journal sont enregistrés sur votre PC. Une minute pour bien démarrer.
        </Lead>
      </div>
    </div>
  );
}

/** Une touche de clavier sculptée, comme les plaques de l'app. */
function Key({ children, press = false }: { children: ReactNode; press?: boolean }) {
  return (
    <motion.kbd
      className="inline-grid h-[68px] min-w-[68px] place-items-center rounded-2xl border border-border bg-card px-5 font-sans text-xl font-semibold text-foreground shadow-[0_3px_0_0_var(--border),0_14px_30px_-16px_rgba(0,0,0,0.35)]"
      animate={press ? { y: [0, 0, 3, 0, 0] } : undefined}
      transition={press ? { duration: 2.4, times: [0, 0.55, 0.62, 0.72, 1], repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      {children}
    </motion.kbd>
  );
}

function GestureStep({
  captured,
  fallback,
  onFallback,
}: {
  captured: Captured | null;
  fallback: boolean;
  onFallback: () => void;
}) {
  const alt = useAltKey();
  const capture = useCaptureTask();

  if (captured) {
    const icon = captured.destination.view === "today" ? StarIcon : captured.destination.view === "upcoming" ? Calendar03Icon : InboxIcon;
    return (
      <div>
        <motion.span
          className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.bouncy}
        >
          <AppIcon icon={Tick02Icon} size={26} strokeWidth={2.2} />
        </motion.span>
        <div className="mt-8">
          <Title>C’est noté.</Title>
          <Lead>Voilà le geste. Où que vous soyez, une touche suffit, et Listik range la tâche à la bonne place.</Lead>
        </div>
        <motion.div
          className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.smooth, delay: 0.12 }}
        >
          <span className="min-w-0 text-[15px] font-medium text-foreground">{captured.text}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand">
            <AppIcon icon={icon} size={14} />
            {captured.destination.label}
          </span>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3" aria-hidden>
        <Key press>{alt}</Key>
        <span className="text-2xl font-light text-muted-foreground">+</span>
        <Key press>Q</Key>
      </div>
      <div className="mt-9">
        <Title>Appuyez sur {alt}+Q.</Title>
        <Lead>
          Depuis n’importe quelle application. Une petite fenêtre s’ouvre : écrivez une chose à faire, puis Entrée.
          Listik repère la date, le projet et la priorité.
        </Lead>
      </div>

      <div className="mt-7 rounded-2xl border border-border/70 bg-card/70 px-5 py-4">
        <p className="text-xs font-medium text-muted-foreground">Essayez par exemple</p>
        <p className="mt-1.5 text-[17px] text-foreground">
          Appeler Marc <Token className="text-blue-500">demain à 10h</Token> <Token className="text-violet-500">#maison</Token>{" "}
          <Token className="font-bold text-red-500">!</Token>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="text-blue-500">la date</span> · <span className="text-violet-500">le projet</span> ·{" "}
          <span className="text-red-500">« ! » la rend prioritaire</span>
        </p>
      </div>

      <div className="mt-5">
        <AnimatePresence initial={false} mode="wait">
          {fallback ? (
            <motion.div key="field" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
              <BarreTache
                onSubmit={async (data) => {
                  await capture(data);
                }}
                placeholder="Écrivez une chose à faire, puis Entrée"
                autoFocus
              />
            </motion.div>
          ) : (
            <motion.button
              key="link"
              type="button"
              onClick={onFallback}
              className="text-sm text-muted-foreground underline decoration-foreground/20 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/60"
              exit={{ opacity: 0 }}
            >
              {alt}+Q ne répond pas ? Essayez ici.
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Token({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-md px-1 [background:color-mix(in_oklch,currentColor_13%,transparent)]", className)}>{children}</span>
  );
}

function ColorStep() {
  return (
    <div>
      <ListikLogotype className="h-[60px] w-auto text-foreground" />
      <div className="mt-9">
        <Title>Votre couleur, votre espace.</Title>
        <Lead>L’accent marque les sélections, la progression et ce qui est actif. Même la goutte du logo le suit.</Lead>
      </div>
      <div className="mt-7 space-y-6">
        <div>
          <p className="mb-3 text-xs font-medium text-muted-foreground">Couleur d’accent</p>
          <AccentPicker />
        </div>
        <div>
          <p className="mb-3 text-xs font-medium text-muted-foreground">Navigation</p>
          <NavSetting />
        </div>
      </div>
    </div>
  );
}

function ReadyStep() {
  const cmd = useCommandKey();
  return (
    <div>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={spring.gentle}>
        <ListikLogotype className="h-[44px] w-auto text-foreground" />
      </motion.div>
      <div className="mt-9">
        <Title>Tout est prêt.</Title>
        <Lead>Trois repères pour la suite. Tous les raccourcis sont dans Réglages, rubrique Fenêtre rapide.</Lead>
      </div>
      <ul className="mt-7 divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
        <Tip keys={[cmd, "N"]}>Ajouter une tâche en tête de liste</Tip>
        <Tip keys={[cmd, "K"]}>Rechercher partout</Tip>
        <Tip icon={<AppIcon icon={Notebook01Icon} size={16} />}>Une page par jour dans le Journal, pour garder la trace</Tip>
      </ul>
      <p className="mt-5 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
        Un assistant IA est déjà installé sur ce PC, comme Claude Code ou Codex CLI ? Branchez-le dans Réglages, rubrique
        Assistant.
      </p>
    </div>
  );
}

function Tip({ keys, icon, children }: { keys?: string[]; icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm text-foreground">
      <span>{children}</span>
      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
        {keys
          ? keys.map((k) => (
              <kbd key={k} className="rounded-md border border-border bg-background px-2 py-0.5 font-sans text-xs font-semibold">
                {k}
              </kbd>
            ))
          : icon}
      </span>
    </li>
  );
}
