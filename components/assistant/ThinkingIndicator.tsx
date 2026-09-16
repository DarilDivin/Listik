/**
 * Attente de la réponse, façon template shadcn/chatbot : un libellé qui
 * miroite plutôt que trois points. L'appel passe par un CLI local, il dure
 * plusieurs secondes — un mot dit mieux qu'une animation ce qui se passe.
 * (`.shimmer` est défini dans `globals.css` : le template l'hérite de
 * `shadcn/tailwind.css`, que nous n'avons pas.)
 */
export function ThinkingIndicator() {
  return (
    <p className="shimmer px-1 text-[15px] text-muted-foreground" aria-live="polite">
      Réflexion…
    </p>
  );
}
