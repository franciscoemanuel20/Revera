import { describe, it, expect } from "vitest";
import { LANG_HTML, TEXTOS, textos, type Dicionario } from "@/lib/internacional/idioma";
import {
  idiomaDoPais,
  localeDoPais,
  nomeDoPais,
  regraDoPais,
  PAISES,
} from "@/lib/internacional/paises";
import {
  formatarDinheiroParaComprador,
  formatarDinheiro,
  ehMoedaSuportada,
} from "@/lib/internacional/moeda";
import { localeDaStripe } from "@/lib/payments/stripe-provider";
import { aceiteInternacional, ACEITE_INTERNACIONAL_VERSAO } from "@/lib/internacional/aceite";
import { validarEndereco } from "@/lib/internacional/endereco";

describe("dicionário de idioma", () => {
  /**
   * A interface `Dicionario` já obriga o inglês a existir em tempo de
   * compilação. Este teste cobre o que o tipo não vê: uma chave que virou
   * string num idioma e função no outro compila (as duas satisfazem a
   * interface se a interface for frouxa) e explode na tela.
   */
  it("as três línguas têm exatamente as mesmas chaves, com a mesma forma", () => {
    const pt = TEXTOS.pt as unknown as Record<string, unknown>;
    for (const lingua of ["en", "es"] as const) {
      const outra = TEXTOS[lingua] as unknown as Record<string, unknown>;
      expect(Object.keys(outra).sort(), lingua).toEqual(Object.keys(pt).sort());
      for (const chave of Object.keys(pt)) {
        expect(typeof outra[chave], `${lingua}.${chave}`).toBe(typeof pt[chave]);
      }
    }
  });

  it("nenhum texto em inglês ficou em português por engano", () => {
    const suspeitas = /\b(pedido|endereço|frete|cidade|imposto|entrega|obrigat)/i;
    for (const [chave, valor] of Object.entries(TEXTOS.en as unknown as Record<string, unknown>)) {
      const texto = typeof valor === "function" ? String(valor("X", 1)) : String(valor);
      expect(suspeitas.test(texto), `${chave}: "${texto}"`).toBe(false);
    }
  });

  /**
   * O espanhol é a tradução PERIGOSA, e por isso o teste é mais duro que o
   * do inglês: "pedido", "entrega" e "total" são palavras espanholas
   * legítimas, então a lista de suspeitas do inglês não serve aqui — ela
   * daria falso positivo em texto correto e passaria pano no texto errado.
   *
   * O que denuncia português esquecido em espanhol é a ORTOGRAFIA: ç, ã e
   * õ não existem em espanhol, em nenhuma palavra. Junto delas vão as
   * palavras que as duas línguas escrevem diferente e que um copiar-colar
   * apressado deixaria passar.
   */
  it("nenhum texto em espanhol ficou em português por engano", () => {
    const soPortugues = /[çãõ]|\b(endereço|frete|você|não|obrigado|cidade|pedido será)\b/i;
    for (const [chave, valor] of Object.entries(TEXTOS.es as unknown as Record<string, unknown>)) {
      const texto = typeof valor === "function" ? String(valor("X", 1)) : String(valor);
      expect(soPortugues.test(texto), `${chave}: "${texto}"`).toBe(false);
    }
  });

  it("idioma desconhecido cai em português, não em tela vazia", () => {
    const t = textos("xx" as never);
    expect(t.checkoutTitulo).toBe(TEXTOS.pt.checkoutTitulo);
  });

  /**
   * O ternário antigo (`idioma === "en" ? "en" : "pt-BR"`) entregaria
   * `lang="pt-BR"` numa página em espanhol. É o atributo que o leitor de
   * tela usa para escolher a pronúncia.
   */
  it("o lang do HTML existe para as três línguas e nenhuma herda o pt-BR", () => {
    expect(LANG_HTML.pt).toBe("pt-BR");
    expect(LANG_HTML.en).toBe("en");
    expect(LANG_HTML.es).toBe("es");
    expect(Object.keys(LANG_HTML).sort()).toEqual(["en", "es", "pt"]);
  });
});

describe("idioma vem do país de entrega", () => {
  it("Estados Unidos, Reino Unido, Austrália e Canadá leem inglês", () => {
    for (const iso of ["US", "GB", "AU", "CA"]) {
      expect(idiomaDoPais(iso), iso).toBe("en");
    }
  });

  /**
   * Portugal é a razão de o idioma morar na tabela de países. É
   * internacional em tudo — euro, DHL, alfândega — e lê português. Uma
   * regra "é BR? então português" o quebraria.
   */
  it("Portugal é internacional e mesmo assim lê português", () => {
    expect(idiomaDoPais("PT")).toBe("pt");
    expect(regraDoPais("PT")?.moedaPadrao).toBe("EUR");
  });

  it("Brasil e país desconhecido leem português", () => {
    expect(idiomaDoPais("BR")).toBe("pt");
    expect(idiomaDoPais("ZZ")).toBe("pt");
  });

  it("Espanha lê espanhol e paga em euro", () => {
    expect(idiomaDoPais("ES")).toBe("es");
    expect(regraDoPais("ES")?.moedaPadrao).toBe("EUR");
    expect(localeDoPais("ES")).toBe("es-ES");
  });

  it("todo país da tabela tem idioma e locale", () => {
    for (const [iso, regra] of Object.entries(PAISES)) {
      expect(["pt", "en", "es"], iso).toContain(regra.idioma);
      expect(regra.locale, iso).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });

  /**
   * A regra que o Francisco deu em 29/08/2026 — "conforme as moedas" —
   * virando teste: país na tabela sem moeda suportada é país que o sistema
   * não sabe precificar. É o que barra a entrada do México (MXN) ou da
   * Argentina (ARS) só porque alguém traduziu a tela.
   */
  it("nenhum país entra sem moeda que o sistema saiba cobrar", () => {
    for (const [iso, regra] of Object.entries(PAISES)) {
      expect(ehMoedaSuportada(regra.moedaPadrao), `${iso} usa ${regra.moedaPadrao}`).toBe(true);
    }
  });

  it("o nome do país acompanha a língua", () => {
    expect(nomeDoPais("US", "pt")).toBe("Estados Unidos");
    expect(nomeDoPais("US", "en")).toBe("United States");
    // Sem idioma, o comportamento antigo: português. O admin depende disso.
    expect(nomeDoPais("US")).toBe("Estados Unidos");
  });

  /**
   * Espanha é o caso que o ternário de duas línguas errava: caía no `else`
   * e devolvia "Espanha" — o nome do próprio país escrito errado, na
   * primeira linha do endereço de quem está comprando.
   */
  it("o espanhol lê o nome do país em espanhol, não no português do else", () => {
    expect(nomeDoPais("ES", "es")).toBe("España");
    expect(nomeDoPais("ES", "pt")).toBe("Espanha");
    expect(nomeDoPais("ES", "en")).toBe("Spain");
    expect(nomeDoPais("AU", "es")).toBe("Australia");
    expect(nomeDoPais("AU", "pt")).toBe("Austrália");
  });
});

describe("dinheiro na tela do comprador", () => {
  /**
   * O agrupamento é o ponto: "1.250,00" para um americano não é mil
   * duzentos e cinquenta.
   */
  it("agrupa no locale de quem lê", () => {
    expect(formatarDinheiroParaComprador(125000, "USD", "en-US")).toBe("US$ 1,250.00");
    expect(formatarDinheiroParaComprador(125000, "BRL", "pt-BR")).toBe("R$ 1.250,00");
  });

  it("o símbolo continua vindo da nossa tabela, não do Intl", () => {
    // O Intl devolveria "$" para os três — foi o bug 5 de 27/08/2026.
    expect(formatarDinheiroParaComprador(85000, "AUD", "en-AU")).toContain("A$");
    expect(formatarDinheiroParaComprador(85000, "CAD", "en-CA")).toContain("CA$");
    expect(formatarDinheiroParaComprador(85000, "USD", "en-US")).toContain("US$");
  });

  /**
   * O espanhol tem uma regra que o português não tem, e ela surpreende:
   * es-ES NÃO separa o milhar quando o número tem exatamente quatro
   * dígitos. 1250 sai "1250,00"; 12500 sai "12.500,00". É norma da RAE, e
   * o Intl a implementa.
   *
   * Fica fixado porque "€ 1250,00" parece defeito de formatação para
   * qualquer brasileiro que abrir a tela — inclusive para quem for mexer
   * nisto depois. Sem este teste, o "conserto" viraria a regressão.
   */
  it("o espanhol não separa o milhar de quatro dígitos, e separa o de cinco", () => {
    expect(formatarDinheiroParaComprador(125000, "EUR", "es-ES")).toBe("€ 1250,00");
    expect(formatarDinheiroParaComprador(1250000, "EUR", "es-ES")).toBe("€ 12.500,00");
    // Portugal segue a MESMA regra do espanhol — e isso já valia antes
    // deste trabalho, sem ninguém ter reparado. Só o pt-BR agrupa quatro
    // dígitos.
    expect(formatarDinheiroParaComprador(125000, "EUR", "pt-PT")).toBe("€ 1250,00");
    expect(formatarDinheiroParaComprador(125000, "BRL", "pt-BR")).toBe("R$ 1.250,00");
    expect(formatarDinheiroParaComprador(125000, "EUR", "en-GB")).toBe("€ 1,250.00");
  });

  it("o formatador do admin não mudou", () => {
    expect(formatarDinheiro({ minor: 125000, moeda: "USD" })).toBe("US$ 1.250,00");
  });

  it("moeda desconhecida sai feia, sem fingir que é real", () => {
    const saida = formatarDinheiroParaComprador(1000, "XYZ", "en-US");
    expect(saida).toContain("XYZ");
    expect(saida).not.toContain("R$");
  });
});

describe("tela da Stripe", () => {
  it("traduz o locale do país para o que a Stripe aceita", () => {
    expect(localeDaStripe(localeDoPais("US"))).toBe("en");
    expect(localeDaStripe(localeDoPais("AU"))).toBe("en");
    expect(localeDaStripe(localeDoPais("BR"))).toBe("pt-BR");
    expect(localeDaStripe(localeDoPais("PT"))).toBe("pt");
    // "es-ES" a Stripe NÃO aceita; mandar o locale cru faria a sessão de
    // pagamento falhar em vez de abrir em espanhol.
    expect(localeDaStripe(localeDoPais("ES"))).toBe("es");
  });

  /**
   * Locale que a Stripe não conhece FAZ A SESSÃO FALHAR. "auto" é o
   * comportamento anterior ao campo existir — degradar para ele é perder
   * uma tradução, não uma venda.
   */
  it("locale desconhecido vira auto, nunca um valor inventado", () => {
    expect(localeDaStripe("ja-JP")).toBe("auto");
    expect(localeDaStripe(undefined)).toBe("auto");
  });
});

describe("aceite internacional", () => {
  it("existe nas três línguas e a versão é a mesma para as três", () => {
    expect(aceiteInternacional("pt").aceite.length).toBeGreaterThan(200);
    expect(aceiteInternacional("en").aceite.length).toBeGreaterThan(200);
    expect(aceiteInternacional("es").aceite.length).toBeGreaterThan(200);
    expect(ACEITE_INTERNACIONAL_VERSAO).toContain("v2");
    // O sufixo diz a verdade enquanto o jurídico não revisar.
    expect(ACEITE_INTERNACIONAL_VERSAO).toContain("pre-juridico");
  });

  /**
   * Regra da §4 da estrutura de envio, agora nas duas línguas: nunca
   * prometer que haverá — nem que não haverá — tributação.
   */
  it("nenhuma das línguas promete ausência nem certeza de imposto", () => {
    const pt = aceiteInternacional("pt");
    const en = aceiteInternacional("en");
    for (const texto of [pt.aceite, pt.avisoTexto]) {
      expect(texto).not.toMatch(/será taxad|não será taxad|sem impost|isento/i);
      expect(texto).toMatch(/poderá|eventuais/i);
    }
    for (const texto of [en.aceite, en.avisoTexto]) {
      expect(texto).not.toMatch(/will be taxed|no duties|tax[- ]free|duty[- ]free/i);
      // Linguagem condicional, na família que o inglês usa: "may be
      // subject", "may apply", "cannot guarantee", "not necessarily".
      expect(texto).toMatch(/may be subject|may apply|cannot guarantee|not necessarily/i);
    }
    const es = aceiteInternacional("es");
    for (const texto of [es.aceite, es.avisoTexto]) {
      // "exento" e "libre de impuestos" são as duas formas que um texto de
      // e-commerce espanhol usaria para prometer o que a alfândega desmente.
      expect(texto).not.toMatch(/exento|libre de impuestos|sin impuestos|no habrá/i);
      expect(texto).toMatch(/podrá estar sujeto|no puede garantizar|no necesariamente/i);
    }
  });

  it("os três textos cobrem os cinco requisitos da §6", () => {
    const pt = aceiteInternacional("pt").aceite;
    const en = aceiteInternacional("en").aceite;
    expect(pt).toMatch(/internacional/i);
    expect(pt).toMatch(/frete/i);
    expect(pt).toMatch(/desembaraço/i);
    expect(pt).toMatch(/impostos/i);
    expect(pt).toMatch(/modalidade de envio/i);
    expect(en).toMatch(/international/i);
    expect(en).toMatch(/shipping/i);
    expect(en).toMatch(/customs clearance/i);
    expect(en).toMatch(/import duties/i);
    expect(en).toMatch(/shipping method/i);
    const es = aceiteInternacional("es").aceite;
    expect(es).toMatch(/internacional/i);
    expect(es).toMatch(/envío/i);
    expect(es).toMatch(/despacho de aduana/i);
    expect(es).toMatch(/aranceles|impuestos de importación|cargos de importación/i);
    expect(es).toMatch(/modalidad de envío/i);
  });

  /**
   * A versão NÃO subiu com a entrada do espanhol, e isso é decisão, não
   * esquecimento: a v2 não mudou de conteúdo para ninguém, e subir para v3
   * diria a quem já aceitou que o acordo mudou. Se um dia o jurídico
   * decidir o contrário, é este teste que falha primeiro e obriga a
   * conversa.
   */
  it("as três línguas dizem o mesmo acordo, sob a mesma versão", () => {
    expect(ACEITE_INTERNACIONAL_VERSAO).toBe("2026-08-28.v2.pre-juridico");
    const linguas = ["pt", "en", "es"] as const;
    for (const l of linguas) {
      const a = aceiteInternacional(l);
      expect(a.avisoTitulo.length, l).toBeGreaterThan(10);
      expect(a.avisoTexto.length, l).toBeGreaterThan(150);
    }
  });
});

describe("erros de validação chegam na língua do comprador", () => {
  const enderecoUS = {
    pais: "US",
    destinatario: "Jane Doe",
    empresa: null,
    linha1: "1600 Pennsylvania Ave NW",
    linha2: null,
    cidade: "Washington",
    regiao: null, // exigido nos EUA — é o erro que queremos ler
    codigoPostal: "ZZZZZ", // formato inválido
    telefone: "+1 202 555 0100",
  };

  it("endereço americano recusado explica em inglês", () => {
    const r = validarEndereco(enderecoUS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const mensagens = r.erros.map((e) => e.mensagem).join(" ");
    expect(mensagens).toMatch(/Invalid ZIP Code/);
    expect(mensagens).toMatch(/Enter your State/);
    expect(mensagens).not.toMatch(/Informe|inválido —/);
  });

  it("endereço português recusado explica em português", () => {
    const r = validarEndereco({
      ...enderecoUS,
      pais: "PT",
      codigoPostal: "ZZZZZ",
      regiao: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const mensagens = r.erros.map((e) => e.mensagem).join(" ");
    expect(mensagens).toMatch(/Código Postal inválido/);
  });

  /**
   * Espanha não exige província (o CP já a identifica), então o erro que
   * precisa aparecer é o do código postal — e precisa aparecer em
   * espanhol, com o rótulo espanhol.
   */
  it("endereço espanhol recusado explica em espanhol", () => {
    const r = validarEndereco({
      ...enderecoUS,
      pais: "ES",
      cidade: "",
      codigoPostal: "ZZZZZ",
      regiao: null,
      telefone: "+34 600 000 000",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const mensagens = r.erros.map((e) => e.mensagem).join(" ");
    expect(mensagens).toMatch(/Código Postal no válido/);
    expect(mensagens).toMatch(/Introduce la ciudad/);
    // Nem português nem inglês vazando na tela do espanhol.
    expect(mensagens).not.toMatch(/Informe|inválido|Enter your|Invalid/);
  });

  it("endereço brasileiro continua em português, como sempre foi", () => {
    const r = validarEndereco({
      pais: "BR",
      destinatario: "João Silva",
      empresa: null,
      cep: "00000",
      rua: "",
      numero: "",
      complemento: null,
      bairro: "",
      cidade: "",
      uf: "XX",
      telefone: "123",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.map((e) => e.mensagem).join(" ")).toMatch(/Informe|inválido/);
  });
});
