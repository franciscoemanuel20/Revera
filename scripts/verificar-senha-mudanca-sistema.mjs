#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const esperado = process.env.REVERA_SYSTEM_CHANGE_PASSWORD;

if (!esperado) {
  console.error(
    "REVERA_SYSTEM_CHANGE_PASSWORD ausente. Rode via: secret run revera prd -- npm run guard:system-change"
  );
  process.exit(1);
}

let recebido = "";
try {
  recebido = execFileSync("pbpaste", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  execFileSync("pbcopy", { input: "", stdio: ["pipe", "ignore", "ignore"] });
} catch {
  console.error("Nao consegui ler o clipboard para validar a senha.");
  process.exit(1);
}

if (!recebido) {
  console.error("Clipboard vazio. Copie a senha de mudanca do sistema Revera e rode novamente.");
  process.exit(1);
}

if (recebido !== esperado.trim()) {
  console.error("Senha de mudanca do sistema Revera invalida. Operacao bloqueada.");
  process.exit(1);
}

console.log("Senha de mudanca do sistema Revera validada. Pode seguir com esta operacao.");
