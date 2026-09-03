/**
 * O número da Reverá — 03/09/2026.
 *
 * Existe porque a troca de número é o tipo de mudança que falha CALADA: o
 * link continua clicável, o WhatsApp abre, e só não tem ninguém do outro
 * lado. Nenhuma tela quebra, nenhum log reclama, e o defeito só aparece
 * quando um cliente desiste. Então o que se testa aqui é justamente o que a
 * tela não denuncia: DDI presente, formato legível certo, e nenhum resto do
 * número antigo espalhado pelo código.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  WHATSAPP_REVERA,
  linkWhatsApp,
  whatsappLegivel,
} from "../../src/lib/config/whatsapp";

const NUMERO_ANTIGO = "12981409901";

describe("WhatsApp da Reverá", () => {
  it("é o número novo, com DDI e só dígitos", () => {
    expect(WHATSAPP_REVERA).toBe("5512981499901");
    expect(WHATSAPP_REVERA).toMatch(/^\d+$/);
    // Sem o 55 o wa.me abre um contato inexistente — falha silenciosa.
    expect(WHATSAPP_REVERA.startsWith("55")).toBe(true);
  });

  it("monta o link com a mensagem já digitada", () => {
    expect(linkWhatsApp("Olá, tudo bem?")).toBe(
      "https://wa.me/5512981499901?text=Ol%C3%A1%2C%20tudo%20bem%3F"
    );
  });

  it("escreve o número do jeito que se lê aqui e lá fora", () => {
    expect(whatsappLegivel()).toBe("(12) 98149-9901");
    expect(whatsappLegivel(true)).toBe("+55 12 98149-9901");
  });

  it("não deixou nenhum resto do número antigo em src/", () => {
    const sobras: string[] = [];
    for (const arquivo of arquivos("src")) {
      const conteudo = readFileSync(arquivo, "utf8");
      // O comentário histórico de whatsapp.ts pode citar o antigo: é ele que
      // explica a troca. Qualquer OUTRO arquivo citando é resto de verdade.
      if (arquivo.endsWith(join("config", "whatsapp.ts"))) continue;
      if (conteudo.replace(/\D/g, "").includes(NUMERO_ANTIGO)) sobras.push(arquivo);
    }
    expect(sobras).toEqual([]);
  });
});

function* arquivos(dir: string): Generator<string> {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) yield* arquivos(caminho);
    else if (/\.(ts|tsx)$/.test(nome)) yield caminho;
  }
}
