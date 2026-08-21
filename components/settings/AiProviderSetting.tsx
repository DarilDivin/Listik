"use client";

import { motion } from "motion/react";
import { Bot, TerminalSquare } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { useRovingRadioGroup } from "@/lib/use-roving-radio";

type Provider = "claude" | "opencode";

const OPTIONS: { value: Provider; label: string; Icon: typeof Bot }[] = [
  { value: "claude", label: "Claude Code", Icon: Bot },
  { value: "opencode", label: "OpenCode", Icon: TerminalSquare },
];
const VALUES: readonly Provider[] = OPTIONS.map((o) => o.value);

/**
 * Choix du CLI d'agent pour l'Assistant (même pattern que NavSetting) : le
 * CLI choisi doit être installé sur la machine, sinon l'Assistant répond
 * une erreur claire à la prochaine question posée (pas de vérification ici).
 */
export function AiProviderSetting() {
  const { settings, update } = useSettings();
  const active = (settings.ai_provider as Provider) || "claude";
  const setActive = (value: Provider) => update({ ai_provider: value });
  const { onKeyDown, getItemProps } = useRovingRadioGroup(VALUES, active, setActive);

  return (
    <div
      role="radiogroup"
      aria-label="CLI d'agent"
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 gap-1 rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-1"
    >
      {OPTIONS.map(({ value, label, Icon }, i) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setActive(value)}
            {...getItemProps(value, i)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[11px] font-medium transition-colors duration-200",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="ai-provider-setting-thumb"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-xl bg-card/90 ring-1 ring-foreground/10"
                style={{
                  boxShadow:
                    "inset 0 1px 0 0 color-mix(in oklch, white 22%, transparent), 0 1px 3px 0 rgb(0 0 0 / 0.10)",
                }}
                transition={{ type: "spring", bounce: 0.28, duration: 0.55 }}
              />
            )}
            <Icon size={15} className="relative" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
