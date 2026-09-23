import {
  ChatGptIcon,
  ClaudeIcon,
  GoogleGeminiIcon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import type { ProviderId } from "@/features/assistant/providers";

/** Les fournisseurs sont nommés et dessinés au même endroit dans l’Assistant et les Réglages. */
export const PROVIDER_META = {
  claude: { label: "Claude Code", icon: ClaudeIcon },
  codex: { label: "Codex CLI", icon: ChatGptIcon },
  antigravity: { label: "Antigravity CLI", icon: GoogleGeminiIcon },
  opencode: { label: "OpenCode", icon: TerminalIcon },
} satisfies Record<ProviderId, { label: string; icon: IconSvgElement }>;

export const PROVIDER_IDS = Object.keys(PROVIDER_META) as ProviderId[];
