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
import { destinoDoAviso } from "../../src/lib/notificacoes/venda-paga";
import { textos } from "../../src/lib/internacional/idioma";

const NUMERO_ANTIGO = "12981409901"; // numero-antigo-de-proposito

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

  // Destino do aviso de venda: o caso que derruba é o branco invisível.
  // "WHATSAPP_DESTINO= " passa por qualquer teste de "está preenchida?" e
  // vira destino vazio na hora de enviar — a venda acontece e ninguém sabe.
  it.each([
    ["ausente", undefined],
    ["vazia", ""],
    ["só espaços", "   "],
    ["só um TAB", "\t"],
    ["pontuação sem dígito", "-- ()"],
  ])("aviso de venda cai no número da loja quando a variável está %s", (_, valor) => {
    expect(destinoDoAviso(valor as string | undefined)).toBe(WHATSAPP_REVERA);
  });

  it("aviso de venda respeita o destino configurado, limpo de pontuação", () => {
    expect(destinoDoAviso(" +55 (11) 99999-0000 ")).toBe("5511999990000");
  });

  // Varre código E documentação: a primeira revisão desta mudança pegou o
  // número velho vivo no README, mandando configurar de novo a variável que
  // acabara de ser aposentada. Documento errado reintroduz o defeito pela
  // mão do próximo que ler.
  it("não deixou nenhum resto do número antigo no projeto", () => {
    // `docs/` fica de fora: são atas datadas do que foi feito e conferido em
    // cada dia. Reescrever ata para o teste passar é apagar história — o que
    // não pode existir é INSTRUÇÃO viva mandando usar o número velho, e essa
    // mora em código, script, README ou .env.example.
    const alvos = [
      ...arquivos("src"),
      ...arquivos("scripts"),
      ...arquivos("tests"),
      "README.md",
      ".env.example",
    ];
    // A conferência é LINHA a linha, e a isenção também. Isentar o arquivo
    // inteiro (como esta guarda fazia antes) deixaria passar uma sobra nova
    // escrita logo abaixo da citação legítima. Quem precisa mesmo do número
    // velho escreve o marcador na própria linha, e só aquela linha escapa.
    const MARCADOR = ["numero", "antigo", "de", "proposito"].join("-");
    const sobras: string[] = [];
    for (const arquivo of alvos) {
      readFileSync(arquivo, "utf8")
        .split("\n")
        .forEach((linha, i) => {
          if (linha.includes(MARCADOR)) return;
          if (linha.replace(/\D/g, "").includes(NUMERO_ANTIGO)) {
            sobras.push(`${arquivo}:${i + 1}`);
          }
        });
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

/**
 * Os textos do WhatsApp existem nos TRÊS idiomas — 03/09/2026.
 *
 * A Reverá vende para fora desde 29/08 (Espanha) e cobra em dólar desde
 * 02/09. Um texto novo escrito só em português não quebra nada: ele
 * simplesmente não compila se faltar no tipo, e se alguém copiar o
 * português para as outras chaves, o cliente de fora recebe um botão em
 * português e não clica. Aqui se confere que cada idioma tem o SEU.
 */
describe("convite para comprar de novo, nos três idiomas", () => {
  const PEDIDO = "REV-ABC123";

  it.each(["pt", "en", "es"] as const)("%s tem botão e mensagem próprios", (idioma) => {
    const t = textos(idioma);
    expect(t.recompraBotao.trim().length).toBeGreaterThan(0);
    // A mensagem precisa citar o pedido: é por ele que a equipe descobre
    // quem está falando, sem perguntar.
    expect(t.recompraMensagem(PEDIDO)).toContain(PEDIDO);
  });

  it("cada idioma escreve o seu — nenhum é cópia do português", () => {
    const pt = textos("pt");
    expect(textos("en").recompraBotao).not.toBe(pt.recompraBotao);
    expect(textos("es").recompraBotao).not.toBe(pt.recompraBotao);
    expect(textos("en").recompraMensagem(PEDIDO)).not.toBe(pt.recompraMensagem(PEDIDO));
    expect(textos("es").recompraMensagem(PEDIDO)).not.toBe(pt.recompraMensagem(PEDIDO));
  });

  it("é conversa diferente da de suporte", () => {
    const t = textos("pt");
    expect(t.recompraMensagem(PEDIDO)).not.toBe(t.suporteMensagem(PEDIDO));
  });
});
