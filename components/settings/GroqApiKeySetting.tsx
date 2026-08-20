"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Clé API Groq pour la correction IA à la capture (Phase R2, remplace le
 * `.env` du sidecar Python retiré). Saisie explicite (pas d'update à chaque
 * frappe, contrairement aux autres réglages) : une clé API ne doit pas
 * partir en écriture tant qu'elle n'est pas confirmée.
 */
export function GroqApiKeySetting() {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasKey = Boolean(settings.groq_api_key);

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await update({ groq_api_key: draft.trim() });
      setDraft("");
      toast.success("Clé Groq enregistrée");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await update({ groq_api_key: "" });
      toast.success("Clé Groq retirée");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={visible ? "text" : "password"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={hasKey ? "Clé déjà configurée — saisir pour remplacer" : "gsk_…"}
            autoComplete="off"
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-2 grid place-items-center text-muted-foreground hover:text-foreground"
            aria-label={visible ? "Masquer la clé" : "Afficher la clé"}
            tabIndex={-1}
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || !draft.trim()}>
          {saving && <Spinner data-icon="inline-start" />}
          Enregistrer
        </Button>
      </div>
      {hasKey && (
        <button
          type="button"
          onClick={handleClear}
          disabled={saving}
          className="text-[0.8rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
        >
          Retirer la clé enregistrée
        </button>
      )}
    </div>
  );
}
