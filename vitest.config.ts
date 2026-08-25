import { defineConfig } from "vitest/config";
import path from "node:path";

// Só a estrutura por enquanto — tests/unit tem um exemplo (cálculo de
// desconto por quantidade). tests/integration e tests/e2e existem como
// pasta vazia (com .gitkeep) para as fases seguintes; nada aqui roda
// contra banco de verdade ainda.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
