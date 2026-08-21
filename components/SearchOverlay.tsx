"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Hash, Layers, ListTodo } from "lucide-react";
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
import { lexicalMatch } from "@/features/search/lexical";
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
  kind: "project" | "area" | "tag" | "task";
  id: string;
  label: string;
};

const ICON = {
  project: FolderOpen,
  area: Layers,
  tag: Hash,
  task: ListTodo,
} as const;

const GROUP_LABEL: Record<QuickFindItem["kind"], string> = {
  project: "Projets",
  area: "Domaines",
  tag: "Tags",
  task: "Tâches",
};

const GROUP_ORDER: QuickFindItem["kind"][] = ["project", "area", "tag", "task"];

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

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((kind) => ({
      kind,
      label: GROUP_LABEL[kind],
      items: lexicalResults.filter((i) => i.kind === kind),
    })).filter((g) => g.items.length > 0);
  }, [lexicalResults]);

  const hasAnyResult = grouped.length > 0;

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
            placeholder="Rechercher tâches, projets, tags…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {query.trim() && !hasAnyResult && (
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
                    >
                      <Icon />
                      <span className="truncate">{item.label}</span>
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
