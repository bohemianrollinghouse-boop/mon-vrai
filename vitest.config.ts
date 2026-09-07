import { defineConfig } from "vitest/config";
import path from "node:path";

// Les tests couvrent la logique métier pure (prix, stock, numérotation, états de
// commande) : pas de Firestore, pas de réseau. Ce qui touche à l'infrastructure se
// vérifie contre les émulateurs, pas ici.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
