"use client";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useAltKey, useCommandKey, useKeyLabels } from "@/lib/keys";

interface Shortcut {
  /** Ce que le geste FAIT, à la première personne du lecteur. */
  label: string;
  /** Une touche par entrée ; elles s'affichent côte à côte. */
  keys: string[];
  /** Précision qui ne tient pas dans le libellé. */
  note?: string;
}

interface Group {
  title: string;
  items: Shortcut[];
}

/**
 * Référence des raccourcis. Elle n'existait pas, et le seul endroit où
 * l'annulation était nommée était le toast « Annuler » — retiré des actions
 * fréquentes depuis qu'on n'annonce plus ce qui se voit. Sans cette page,
 * Ctrl+Z serait devenu introuvable.
 *
 * Volontairement limitée aux raccourcis GLOBAUX et à ceux de la liste : les
 * Entrée/Échap qui valident ou ferment un champ sont des conventions du
 * système, pas des raccourcis de l'app, et les lister noierait les autres.
 */
function useGroups(): Group[] {
  const cmd = useCommandKey();
  const alt = useAltKey();
  const key = useKeyLabels();

  return [
    {
      title: "Partout",
      items: [
        {
          label: "Capturer une tâche sans quitter ce qu'on fait",
          keys: [alt, "Q"],
          note: "Enregistré au niveau du système : fonctionne même quand la fenêtre n'est pas au premier plan.",
        },
        { label: "Rechercher", keys: [cmd, "K"] },
        {
          label: "Afficher ou masquer la barre latérale",
          keys: [cmd, "B"],
          note: "Quand la navigation est réglée sur la barre latérale.",
        },
      ],
    },
    {
      title: "Planificateur",
      items: [
        { label: "Ajouter une tâche en tête de liste", keys: [cmd, "N"] },
        {
          label: "Annuler la dernière action",
          keys: [cmd, "Z"],
          note: "À un pas, pendant cinq secondes. Couvre aussi les suppressions.",
        },
        { label: "Vider la sélection, refermer une vue", keys: [key.escape] },
      ],
    },
    {
      title: "Sur une tâche",
      items: [
        { label: "Passer d'une tâche à l'autre", keys: [key.up, key.down] },
        { label: "Ouvrir le détail", keys: [key.enter] },
        { label: "Déplacer la tâche dans la liste", keys: [alt, key.up] },
        { label: "Ajouter à la sélection", keys: [cmd, "clic"] },
        { label: "Étendre la sélection", keys: [key.shift, "clic"] },
      ],
    },
    {
      title: "Capture rapide",
      items: [
        { label: "Enregistrer", keys: [key.enter] },
        { label: "Fermer sans enregistrer", keys: [key.escape] },
      ],
    },
  ];
}

export function ShortcutsSetting() {
  const groups = useGroups();

  return (
    <div className="flex w-full flex-col gap-5">
      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.title}
          </h3>
          <div className="flex flex-col divide-y divide-border/60">
            {group.items.map((item) => (
              <div
                key={item.label}
                className="flex items-start justify-between gap-4 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[0.9375rem] leading-snug text-foreground">
                    {item.label}
                  </p>
                  {item.note && (
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {item.note}
                    </p>
                  )}
                </div>
                <KbdGroup className="mt-px shrink-0">
                  {item.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
