"use client";

import { useRef, useState } from "react";
import {
  Copy01Icon,
  Doc01Icon,
  Download01Icon,
  FileExportIcon,
  Image01Icon,
  Pdf01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { AppIcon } from "@/components/ui/app-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Portees } from "@/components/journal/JournalSheet";
import { blocsDepuisNoeuds, compterMots, piecesDe, type Bloc } from "@/features/journal/passage";
import { copier, exporterImages, exporterPdf, exporterWord } from "@/features/journal/partage";

type Portee = "selection" | "reprise" | "page";

interface Choix {
  portee: Portee;
  libelle: string;
  blocs: Bloc[];
  mots: number;
}

const mots = (n: number) => `${n.toLocaleString("fr-FR")} mot${n > 1 ? "s" : ""}`;

/** « 14:05 » → « 14 h 05 », comme on le dit. */
const heureDite = (h: string) => h.replace(":", " h ");

/**
 * Ce qu'on PEUT exporter, dans l'ordre où on le propose.
 *
 * « Ce passage » n'apparaît que si la page compte plusieurs moments : sur une
 * page d'un seul tenant, il serait la page elle-même, et deux choix qui disent
 * la même chose en font douter un.
 */
function choixDepuis(p: Portees): Choix[] {
  const choix: Choix[] = [];
  const ajouter = (portee: Portee, libelle: string, noeuds: Parameters<typeof blocsDepuisNoeuds>[0]) => {
    const blocs = blocsDepuisNoeuds(noeuds);
    if (blocs.length === 0) return;
    choix.push({ portee, libelle, blocs, mots: compterMots(blocs) });
  };
  if (p.selection) ajouter("selection", "La sélection", p.selection);
  if (p.reprise && p.moments > 1) {
    ajouter(
      "reprise",
      p.reprise.heure ? `Le passage de ${heureDite(p.reprise.heure)}` : "Ce passage",
      p.reprise.noeuds,
    );
  }
  ajouter("page", "Toute la page", p.page);
  return choix;
}

/**
 * Le menu d'export du journal : un PASSAGE, en texte, PDF, image ou Word —
 * et, en bas, tout le journal comme avant.
 *
 * Ce qui part se décide en ouvrant le menu, et le menu le DIT (« Le passage de
 * 14 h 05 · 1 240 mots ») : la frontière d'un moment est invisible sur la
 * page, on ne la devine pas.
 */
export function ExportPassage({
  lire,
  onToutLeJournal,
  toutLeJournalEnCours,
}: {
  lire: () => Portees | null;
  onToutLeJournal: () => void;
  toutLeJournalEnCours: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState<Choix[]>([]);
  const [portee, setPortee] = useState<Portee>("page");
  const [occupe, setOccupe] = useState(false);
  // Le menu s'ouvre-t-il après un `pointerdown` qui a déjà tout lu ?
  const luAuPointeur = useRef(false);

  /**
   * Lu au `pointerdown`, AVANT que le menu prenne le focus : on ne parie pas
   * sur ce qu'un menu qui s'ouvre fait de la sélection du texte.
   */
  const prendre = () => {
    luAuPointeur.current = true;
    const p = lire();
    const c = p ? choixDepuis(p) : [];
    setChoix(c);
    setPortee(c[0]?.portee ?? "page");
  };

  const courant = choix.find((c) => c.portee === portee) ?? choix[0];
  const vide = !courant || (courant.mots === 0 && piecesDe(courant.blocs).length === 0);

  const lancer = async (action: (blocs: Bloc[]) => Promise<string | null>) => {
    if (!courant) return;
    setOccupe(true);
    try {
      const message = await action(courant.blocs);
      if (message) toast.success(message);
    } catch (e) {
      console.error("export_passage:", e);
      toast.error("L'export a échoué.");
    } finally {
      setOccupe(false);
    }
  };

  const actions = [
    {
      icone: Copy01Icon,
      libelle: "Copier le texte",
      faire: async (b: Bloc[]) => (await copier(b), "Texte copié."),
    },
    {
      icone: Pdf01Icon,
      libelle: "PDF…",
      faire: async (b: Bloc[]) => {
        const ecrit = await exporterPdf(b);
        // `false` : le dialogue d'impression du système a pris le relais, il
        // dira lui-même où le fichier est allé.
        return ecrit ? "PDF enregistré." : null;
      },
    },
    {
      icone: Image01Icon,
      libelle: "Image…",
      faire: async (b: Bloc[]) => {
        const n = await exporterImages(b);
        if (!n) return null;
        return n === 1 ? "Image enregistrée." : `${n} images enregistrées, numérotées.`;
      },
    },
    {
      icone: Doc01Icon,
      libelle: "Word…",
      faire: async (b: Bloc[]) => ((await exporterWord(b)) ? "Document Word enregistré." : null),
    },
  ];

  return (
    <DropdownMenu
      open={ouvert}
      onOpenChange={(o) => {
        // Ouvert au CLAVIER, il n'y a pas eu de `pointerdown` : on lit ici.
        if (o && !luAuPointeur.current) prendre();
        luAuPointeur.current = false;
        setOuvert(o);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Exporter"
              disabled={occupe || toutLeJournalEnCours}
              onPointerDown={prendre}
            >
              <AppIcon icon={Download01Icon} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8}>
          Exporter
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        {choix.length > 1 ? (
          <>
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Exporter
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={courant?.portee}
              onValueChange={(v) => setPortee(v as Portee)}
            >
              {choix.map((c) => (
                <DropdownMenuRadioItem
                  key={c.portee}
                  value={c.portee}
                  // Choisir CE qui part ne fait encore rien partir : le menu
                  // reste ouvert pour qu'on dise COMMENT.
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="min-w-0 flex-1 truncate">{c.libelle}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {mots(c.mots)}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : (
          <DropdownMenuLabel className="flex items-baseline gap-2 text-xs font-medium text-muted-foreground">
            <span className="flex-1">{courant ? courant.libelle : "Page vide"}</span>
            {courant && <span className="tabular-nums">{mots(courant.mots)}</span>}
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.libelle}
            disabled={vide || occupe}
            onSelect={() => void lancer(a.faire)}
          >
            <AppIcon icon={a.icone} />
            {a.libelle}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={toutLeJournalEnCours} onSelect={onToutLeJournal}>
          <AppIcon icon={FileExportIcon} />
          Tout le journal (Markdown)…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
