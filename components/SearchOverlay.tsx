"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FolderOpen, Hash, Layers, ListTodo } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import useSWR from "swr";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { journalApi } from "@/features/journal/api";
import { morceaux } from "@/features/journal/extrait";
import { lexicalMatch } from "@/features/search/lexical";
import { SWR_KEYS } from "@/lib/swr-config";
import { cn } from "@/lib/utils";
import { usePlannerTodos } from "@/hooks/usePlannerTodos";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";

/**
 * Un résultat de la palette, uniformisé par TYPE. Tout est lexical (Phase R :
 * la recherche sémantique par embeddings a été mise de côté — pas le vrai
 * besoin derrière le pivot post-sidecar, voir docs/ROADMAP-PIVOT.md).
 *
 * Les notes (Phase C) ont disparu de la palette avec le reste du module
 * (Phase P, remplacé par le Journal) — jamais réintroduites ici.
 */
type QuickFindItem = {
  kind: "project" | "area" | "tag" | "task" | "journal";
  id: string;
  label: string;
  /**
   * Réservé au journal : on n'y cherche pas un NOM mais une phrase, et c'est
   * elle qu'il faut reconnaître avant de cliquer. `extrait` porte les marques
   * du surlignage, `jour` sert au deep-link.
   */
  extrait?: string;
  jour?: string;
};

const ICON = {
  project: FolderOpen,
  area: Layers,
  tag: Hash,
  task: ListTodo,
  journal: BookOpen,
} as const;

const GROUP_LABEL: Record<QuickFindItem["kind"], string> = {
  project: "Projets",
  area: "Domaines",
  tag: "Tags",
  task: "Tâches",
  journal: "Journal",
};

// Le journal EN DERNIER : la palette sert d'abord à aller quelque part, et un
// passage se lit, il ne se navigue pas. Il ne doit pas pousser une tâche hors
// de vue.
const GROUP_ORDER: QuickFindItem["kind"][] = ["project", "area", "tag", "task", "journal"];

/** Quelques-uns : une palette qui déroule trente passages n'est plus une palette. */
const PASSAGES = 5;

interface SearchOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Palette de recherche (Ctrl+K), globale à l'app shell — tâches, projets,
 * domaines, tags, tout en lexical local (insensible aux diacritiques).
 * `shouldFilter={false}` : on maîtrise nous-mêmes tout le classement, cmdk ne
 * refiltre pas par sous-chaîne.
 */
export function SearchOverlay({ open, onOpenChange: setOpen }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { projects, areas } = useProjects();
  const { tags } = useTags();
  const { todos } = usePlannerTodos();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  // Synchrone à chaque frappe, pas de débounce nécessaire pour un simple
  // filtre en mémoire sur quelques dizaines/centaines d'éléments. Tâches
  // limitées aux non-terminées : on cherche « où aller », pas l'historique.
  const lexicalResults = useMemo<QuickFindItem[]>(() => {
    if (!query.trim()) return [];
    const activeProjects = projects.filter((p) => p.status === "active");
    const openTodos = todos
      .filter((t) => t.status === "pending")
      .map((t) => ({ id: t.id, name: t.text }));
    return [
      ...lexicalMatch(activeProjects, query).map(
        (p): QuickFindItem => ({ kind: "project", id: p.id, label: p.name }),
      ),
      ...lexicalMatch(areas, query).map(
        (a): QuickFindItem => ({ kind: "area", id: a.id, label: a.name }),
      ),
      ...lexicalMatch(tags, query).map(
        (t): QuickFindItem => ({ kind: "tag", id: t.id, label: t.name }),
      ),
      ...lexicalMatch(openTodos, query).map(
        (t): QuickFindItem => ({ kind: "task", id: t.id, label: t.name }),
      ),
    ];
  }, [query, projects, areas, tags, todos]);

  /**
   * Le journal, lui, passe par SQLite (FTS5) : il ne peut pas être filtré en
   * mémoire comme le reste — on n'a pas les milliers de lignes sous la main,
   * et on ne les voudrait pas. D'où un débounce et un cache.
   */
  const [requete, setRequete] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setRequete(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const { data: passages, isLoading: chercheJournal } = useSWR(
    requete ? SWR_KEYS.JOURNAL_SEARCH(requete) : null,
    () => journalApi.search(requete, PASSAGES),
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  const grouped = useMemo(() => {
    const journal: QuickFindItem[] = (passages ?? []).map((h) => ({
      kind: "journal",
      id: h.id,
      label: format(new Date(h.written_at), "d MMMM yyyy", { locale: fr }),
      extrait: h.extrait,
      jour: h.target_day,
    }));
    const tout = [...lexicalResults, ...journal];
    return GROUP_ORDER.map((kind) => ({
      kind,
      label: GROUP_LABEL[kind],
      items: tout.filter((i) => i.kind === kind),
    })).filter((g) => g.items.length > 0);
  }, [lexicalResults, passages]);

  const hasAnyResult = grouped.length > 0;

  /**
   * On ne dit « aucun résultat » que quand on a fini de chercher. Le journal
   * répond après un aller-retour SQLite : l'annoncer vide entre-temps serait
   * un mensonge d'un dixième de seconde, et c'est celui qu'on lit.
   */
  const enCours = query.trim() !== requete || chercheJournal;

  // Remise à zéro à la fermeture, pour repartir propre à la prochaine ouverture.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const handleSelect = (item: QuickFindItem) => {
    setOpen(false);
    switch (item.kind) {
      case "project":
        router.push(`/?project=${item.id}`);
        break;
      case "area":
        router.push(`/?area=${item.id}`);
        break;
      case "tag":
        router.push(`/?tag=${item.id}`);
        break;
      case "task":
        router.push(`/?task=${item.id}`);
        break;
      case "journal":
        router.push(`/journal?jour=${item.jour}`);
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[26%] translate-y-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Recherche</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            placeholder="Rechercher une tâche, un projet, un passage…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {query.trim() && !hasAnyResult && !enCours && (
              <CommandEmpty>Aucun résultat.</CommandEmpty>
            )}
            {grouped.map((group) => {
              const Icon = ICON[group.kind];
              return (
                <CommandGroup key={group.kind} heading={group.label}>
                  {group.items.map((item) => (
                    <CommandItem
                      key={`${item.kind}:${item.id}`}
                      value={`${item.kind}:${item.id}`}
                      onSelect={() => handleSelect(item)}
                      className={item.extrait ? "items-start" : undefined}
                    >
                      <Icon className={item.extrait ? "mt-0.5" : undefined} />
                      {item.extrait ? (
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-xs text-muted-foreground">
                            {item.label}
                          </span>
                          {/* Le surlignage vient du SQL : le refaire ici
                              différerait de l'index et tomberait à côté. */}
                          <span className="line-clamp-2 text-sm">
                            {morceaux(item.extrait).map((m, i) => (
                              <span
                                key={i}
                                className={cn(
                                  m.trouve && "font-medium text-brand",
                                )}
                              >
                                {m.texte}
                              </span>
                            ))}
                          </span>
                        </span>
                      ) : (
                        <span className="truncate">{item.label}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
