"use client";

import { useUIPrefs, PULSE_STYLES } from "@/components/ui-prefs";
import { Segmented } from "@/components/ui/segmented";

const OPTIONS = PULSE_STYLES.map(({ id, label }) => ({ value: id, label }));

/**
 * Choix du traitement du pouls du jour : quatre mots, appliqués tout de
 * suite. Ce que chacun met en avant vit dans la description de la ligne.
 */
export function PulseSetting() {
  const { pulse, setPulse } = useUIPrefs();
  return <Segmented options={OPTIONS} value={pulse} onChange={setPulse} aria-label="Pouls du jour" />;
}
