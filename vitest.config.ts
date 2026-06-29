// Config Vitest en objet simple (évite d'importer 'vitest/config', ce qui
// permet de lancer les tests même avant `pnpm install`, via `npx vitest`).
export default {
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "features/**/*.test.ts"],
  },
};
