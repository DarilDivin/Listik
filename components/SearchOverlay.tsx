"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Hash, Layers, ListTodo, StickyNote } from "lucide-react";
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
import { aiSearch } from "@/features/search/api";
import { lexicalMatch } from "@/features/search/lexical";
import { useProjects } from "@/hooks/useProjects";
import { useTags } from "@/hooks/useTags";
import type { AiSource } from "@/features/omnibar/agent";

const DEBOUNCE_MS = 250;

/**
 * Un résultat de la palette, uniformisé par TYPE. Union locale plutôt qu'une
 * extension d'`AiSource` : ce type appartient au contrat du sidecar, pas à
 * l'affichage de la palette. Les deux sources sont disjointes par
 * construction (sémantique → tâche/note ; lexicale → projet/domaine/tag) —
 * aucun risque de doublon entre elles.
 */
type QuickFindItem = {
  kind: "project" | "area" | "tag" | "task" | "note";
  id: string;
  label: string;
};

const ICON = {
  project: FolderOpen,
  area: Layers,
  tag: Hash,
  task: ListTodo,
  note: StickyNote,
} as const;

const GROUP_LABEL: Record<QuickFindItem["kind"], string> = {
  project: "Projets",
  area: "Domaines",
  tag: "Tags",
  task: "Tâches",
  note: "Notes",
};

// Ordre façon Things : correspondances lexicales instantanées d'abord
// (déterministes), puis les résultats sémantiques qui arrivent après le débounce.
const GROUP_ORDER: QuickFindItem["kind"][] = ["project", "area", "tag", "task", "note"];

interface SearchOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Palette de recherche (Ctrl+K), globale à l'app shell — tâches, notes
 * (sémantique, via le sidecar), projets/domaines/tags (lexical, local,
 * insensible aux diacritiques). `shouldFilter={false}` : on maîtrise
 * nous-mêmes tout le classement, cmdk ne refiltre pas par sous-chaîne.
 */
export function SearchOverlay({ open, onOpenChange: setOpen }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<AiSource[]>([]);
  const router = useRouter();
  const { projects, areas } = useProjects();
  const { tags } = useTags();

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

  // Sémantique (sidecar) : débattue, peut échouer si le sidecar est indisponible.
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setSemanticResults([]);
      return;
    }
    const timer = setTimeout(() => {
      aiSearch(query.trim(), 8)
        .then(setSemanticResults)
        .catch((e) => {
          console.error("ai_search:", e);
          setSemanticResults([]);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  // Lexicale (locale) : synchrone à chaque frappe, pas de débounce nécessaire
  // pour un simple filtre en mémoire sur quelques dizaines d'éléments.
  const lexicalResults = useMemo<QuickFindItem[]>(() => {
    if (!query.trim()) return [];
    const activeProjects = projects.filter((p) => p.status === "active");
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
    ];
  }, [query, projects, areas, tags]);

  const semanticItems = useMemo<QuickFindItem[]>(
    () =>
      semanticResults.map((r) => ({
        kind: r.type as "task" | "note",
        id: r.id,
        label: r.text.split("\n")[0],
      })),
    [semanticResults],
  );

  const grouped = useMemo(() => {
    const all = [...lexicalResults, ...semanticItems];
    return GROUP_ORDER.map((kind) => ({
      kind,
      label: GROUP_LABEL[kind],
      items: all.filter((i) => i.kind === kind),
    })).filter((g) => g.items.length > 0);
  }, [lexicalResults, semanticItems]);

  const hasAnyResult = grouped.length > 0;

  // Remise à zéro à la fermeture, pour repartir propre à la prochaine ouverture.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSemanticResults([]);
    }
  }, [open]);

  const handleSelect = (item: QuickFindItem) => {
    setOpen(false);
    switch (item.kind) {
      case "note":
        router.push(`/notes?id=${item.id}`);
        break;
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
            placeholder="Rechercher tâches, projets, tags, notes…"
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
