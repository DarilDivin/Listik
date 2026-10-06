"use client";

import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useAltKey, useCommandKey, useKeyLabels, useQuickShortcut } from "@/lib/keys";

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
  const quick = useQuickShortcut();

  return [
    {
      title: "Partout",
      items: [
        {
          label: "Capturer une tâche sans quitter ce qu'on fait",
          keys: quick,
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
    <div className="flex flex-col gap-7">
      {groups.map((group) => (
        <SettingsGroup key={group.title} title={group.title}>
          {group.items.map((item) => (
            <SettingsRow key={item.label} label={item.label} description={item.note}>
              <KbdGroup>
                {item.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </KbdGroup>
            </SettingsRow>
          ))}
        </SettingsGroup>
      ))}
    </div>
  );
}
