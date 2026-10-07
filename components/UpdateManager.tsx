"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

function runsInListik(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Cherche une nouvelle version une fois par lancement du binaire.
 *
 * La recherche est silencieuse lorsqu'il n'y a rien à installer, ou lorsque
 * l'application est exécutée dans le navigateur pendant le développement.
 * Une mise à jour reste toujours une action explicite : l'utilisateur garde
 * ses modifications à l'écran et choisit le moment du redémarrage.
 */
export function UpdateManager() {
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current || !runsInListik()) return;
    checked.current = true;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const update = await check({ timeout: 10_000 });
          if (!update) return;

          // Les notes de version commencent par une phrase de résumé (voir
          // NOUVEAUTES.md) ; le détail vit sur la page Nouveautés du site. Le
          // lien part dans le navigateur (garde de navigation, navigation.rs).
          const summary = update.body?.split(/\n\s*\n/)[0]?.trim();
          toast(`Listik ${update.version} est disponible`, {
            description: (
              <span>
                {summary || "La mise à jour sera installée puis Listik redémarrera."}{" "}
                <a
                  href={`https://listik.daril.fr/nouveautes/#v${update.version}`}
                  className="underline underline-offset-2"
                >
                  Voir les nouveautés
                </a>
              </span>
            ),
            duration: Infinity,
            action: {
              label: "Installer",
              onClick: () => {
                void (async () => {
                  const installingToast = toast.loading("Téléchargement de la mise à jour…");
                  try {
                    await update.downloadAndInstall();
                    toast.success("Mise à jour installée. Redémarrage de Listik…", {
                      id: installingToast,
                    });
                    await relaunch();
                  } catch (error) {
                    toast.error("La mise à jour n’a pas pu être installée.", {
                      id: installingToast,
                      description: error instanceof Error ? error.message : undefined,
                    });
                  } finally {
                    await update.close();
                  }
                })();
              },
            },
          });
        } catch {
          // Pas de release encore publiée, connexion absente ou endpoint
          // momentanément indisponible : l'application reste pleinement utilisable.
        }
      })();
    }, 2_500);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
