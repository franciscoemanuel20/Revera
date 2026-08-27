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
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Ver tests/stubs/server-only.ts — permite testar módulos de servidor
      // sem afrouxar a proteção real do bundle.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
