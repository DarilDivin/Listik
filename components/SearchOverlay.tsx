"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, StickyNote } from "lucide-react";
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
import type { AiSource } from "@/features/omnibar/agent";

const DEBOUNCE_MS = 250;

interface SearchOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Palette de recherche sémantique (Ctrl+K), globale à l'app shell. Le
 * classement vient du serveur (similarité de sens, D2) — `shouldFilter={false}`
 * empêche cmdk de re-filtrer/trier localement par sous-chaîne. Contrôlée par
 * le parent pour qu'un bouton de la sidebar puisse aussi l'ouvrir.
 */
export function SearchOverlay({ open, onOpenChange: setOpen }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AiSource[]>([]);
  const router = useRouter();

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

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      aiSearch(query.trim(), 8)
        .then(setResults)
        .catch((e) => {
          console.error("ai_search:", e);
          setResults([]);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  // Remise à zéro à la fermeture, pour repartir propre à la prochaine ouverture.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const handleSelect = (item: AiSource) => {
    setOpen(false);
    router.push(item.type === "note" ? `/notes?id=${item.id}` : "/");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Recherche</DialogTitle>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher dans vos tâches et notes…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {query.trim() && results.length === 0 && (
              <CommandEmpty>Aucun résultat.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup heading="Résultats">
                {results.map((r) => (
                  <CommandItem key={r.id} value={r.id} onSelect={() => handleSelect(r)}>
                    {r.type === "note" ? <StickyNote /> : <ListTodo />}
                    <span className="truncate">{r.text.split("\n")[0]}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
