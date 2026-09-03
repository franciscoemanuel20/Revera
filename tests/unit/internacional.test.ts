import { describe, expect, it } from "vitest";
import {
  daLinha,
  ehEnderecoBR,
  formatarEndereco,
  paraLinha,
  validarEndereco,
  type EnderecoInternacional,
} from "@/lib/internacional/endereco";
import { ehPaisSuportado, paisesDoCheckout, regraDoPais } from "@/lib/internacional/paises";
import {
  dinheiro,
  ehMoedaSuportada,
  formatarNumeroDinheiro,
  paraMoedaFiscal,
  precoNaMoeda,
  somar,
  type Moeda,
} from "@/lib/internacional/moeda";
import {
  derivarExportStatus,
  montarChecklist,
  type DadosFiscaisProduto,
} from "@/lib/internacional/exportacao";

/* =========================================================================
 * FASE 11 — O BRASIL NÃO PODE QUEBRAR
 * =======================================================================*/

const BR_VALIDO = {
  pais: "BR",
  destinatario: "Maria Souza",
  empresa: null,
  cep: "12245-000",
  rua: "Rua das Flores",
  numero: "100",
  complemento: "Apto 21",
  bairro: "Centro",
  cidade: "São José dos Campos",
  uf: "sp",
  telefone: "(11) 97654-3210",
};

describe("Brasil continua funcionando exatamente como antes", () => {
  it("endereço brasileiro completo é aceito", () => {
    const r = validarEndereco(BR_VALIDO);
    expect(r.ok).toBe(true);
  });

  it("CEP, UF e telefone são normalizados como sempre foram", () => {
    const r = validarEndereco(BR_VALIDO);
    if (!r.ok) throw new Error("deveria ter passado");
    if (!ehEnderecoBR(r.endereco)) throw new Error("deveria ser BR");
    expect(r.endereco.cep).toBe("12245000");
    expect(r.endereco.uf).toBe("SP");
    expect(r.endereco.telefone).toBe("11976543210");
  });

  it("brasileiro SEM bairro continua sendo recusado", () => {
    const r = validarEndereco({ ...BR_VALIDO, bairro: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.some((e) => e.campo === "bairro")).toBe(true);
  });

  it("brasileiro com CEP inválido continua sendo recusado", () => {
    const r = validarEndereco({ ...BR_VALIDO, cep: "123" });
    expect(r.ok).toBe(false);
  });

  it("brasileiro com UF de 3 letras continua sendo recusado", () => {
    const r = validarEndereco({ ...BR_VALIDO, uf: "SPX" });
    expect(r.ok).toBe(false);
  });

  it("o checkout público continua oferecendo só o Brasil", () => {
    // Enquanto não houver gateway internacional, abrir o seletor faria a
    // pessoa preencher tudo para descobrir no fim que não consegue pagar.
    expect(paisesDoCheckout()).toEqual(["BR"]);
  });
});

/* =========================================================================
 * FASE 1 e 12 — OS CINCO DESTINOS
 * =======================================================================*/

const US_VALIDO = {
  pais: "US",
  destinatario: "Michael Smith",
  empresa: null,
  linha1: "1600 Pennsylvania Ave NW",
  linha2: "Apt 2",
  cidade: "Washington",
  regiao: "DC",
  codigoPostal: "20500",
  telefone: "+1 202 555 0123",
};

describe("Estados Unidos", () => {
  it("é aceito SEM CPF — o campo nem existe no formato internacional", () => {
    const r = validarEndereco(US_VALIDO);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toContain("cpf");
  });

  it("não exige UF brasileira de duas letras — 'California' passa", () => {
    const r = validarEndereco({ ...US_VALIDO, regiao: "California" });
    expect(r.ok).toBe(true);
  });

  it("exige estado, porque endereço americano sem estado não entrega", () => {
    const r = validarEndereco({ ...US_VALIDO, regiao: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.some((e) => e.campo === "regiao")).toBe(true);
  });

  it("ZIP+4 é válido", () => {
    expect(validarEndereco({ ...US_VALIDO, codigoPostal: "20500-0003" }).ok).toBe(true);
  });

  it("CEP brasileiro NÃO é aceito como ZIP", () => {
    const r = validarEndereco({ ...US_VALIDO, codigoPostal: "12245-000" });
    expect(r.ok).toBe(false);
  });
});

describe("Portugal", () => {
  const PT = {
    pais: "PT",
    destinatario: "Ana Ferreira",
    empresa: null,
    linha1: "Rua Augusta 120, 2º Esq",
    linha2: null,
    cidade: "Lisboa",
    regiao: null,
    codigoPostal: "1100-053",
    telefone: "+351 912 345 678",
  };

  it("é aceito SEM região — Portugal não usa distrito no endereço postal", () => {
    expect(validarEndereco(PT).ok).toBe(true);
  });

  it("código postal 0000-000 é obrigatório no formato certo", () => {
    expect(validarEndereco({ ...PT, codigoPostal: "1100053" }).ok).toBe(false);
  });
});

describe("Reino Unido", () => {
  const GB = {
    pais: "GB",
    destinatario: "James Clarke",
    empresa: "Clarke & Sons Ltd",
    linha1: "10 Downing Street",
    linha2: null,
    cidade: "London",
    regiao: null,
    codigoPostal: "SW1A 2AA",
    telefone: "+44 20 7946 0958",
  };

  it("postcode ALFANUMÉRICO é aceito — é aqui que um validador de CEP quebraria", () => {
    expect(validarEndereco(GB).ok).toBe(true);
  });

  it("aceita as várias formas do formato britânico", () => {
    for (const cp of ["M1 1AA", "B33 8TH", "CR2 6XH", "EC1A 1BB", "W1A0AX"]) {
      expect(validarEndereco({ ...GB, codigoPostal: cp }).ok).toBe(true);
    }
  });

  it("empresa é preservada quando existe", () => {
    const r = validarEndereco(GB);
    if (!r.ok) throw new Error("deveria passar");
    expect((r.endereco as EnderecoInternacional).empresa).toBe("Clarke & Sons Ltd");
  });
});

describe("Austrália e Canadá", () => {
  it("postcode australiano de 4 dígitos", () => {
    const r = validarEndereco({
      pais: "AU",
      destinatario: "Sarah Jones",
      empresa: null,
      linha1: "1 Macquarie St",
      linha2: null,
      cidade: "Sydney",
      regiao: "NSW",
      codigoPostal: "2000",
      telefone: "+61 2 9374 4000",
    });
    expect(r.ok).toBe(true);
  });

  it("postal code canadense alfanumérico, com e sem espaço", () => {
    const base = {
      pais: "CA",
      destinatario: "Marc Tremblay",
      empresa: null,
      linha1: "80 Wellington St",
      linha2: null,
      cidade: "Ottawa",
      regiao: "ON",
      codigoPostal: "K1A 0A2",
      telefone: "+1 613 555 0199",
    };
    expect(validarEndereco(base).ok).toBe(true);
    expect(validarEndereco({ ...base, codigoPostal: "K1A0A2" }).ok).toBe(true);
  });
});

describe("campos opcionais e país inválido", () => {
  it("linha 2 ausente não impede nada", () => {
    expect(validarEndereco({ ...US_VALIDO, linha2: null }).ok).toBe(true);
  });

  it("país que não atendemos é recusado", () => {
    const r = validarEndereco({ ...US_VALIDO, pais: "JP" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erros.some((e) => e.campo === "pais")).toBe(true);
  });

  it("país inexistente é recusado", () => {
    expect(validarEndereco({ ...US_VALIDO, pais: "ZZ" }).ok).toBe(false);
    expect(ehPaisSuportado("ZZ")).toBe(false);
  });

  it("telefone internacional aceita comprimentos que a regra brasileira recusaria", () => {
    // 12 dígitos: inválido pela regra de DDD, válido em E.164.
    expect(validarEndereco({ ...US_VALIDO, telefone: "+351912345678" }).ok).toBe(true);
  });

  it("telefone curto demais é recusado", () => {
    expect(validarEndereco({ ...US_VALIDO, telefone: "123" }).ok).toBe(false);
  });
});

/* =========================================================================
 * IDA E VOLTA COM O BANCO
 * =======================================================================*/

describe("gravar e reler não perde nem mistura os formatos", () => {
  it("endereço BR não escreve nada nos campos internacionais", () => {
    const r = validarEndereco(BR_VALIDO);
    if (!r.ok) throw new Error("deveria passar");
    const linha = paraLinha(r.endereco);
    expect(linha.country).toBe("BR");
    expect(linha.line1).toBeNull();
    expect(linha.postal_code).toBeNull();
    expect(linha.region).toBeNull();
    expect(linha.cep).toBe("12245000");
  });

  it("endereço internacional não escreve nada nos campos brasileiros", () => {
    const r = validarEndereco(US_VALIDO);
    if (!r.ok) throw new Error("deveria passar");
    const linha = paraLinha(r.endereco);
    expect(linha.cep).toBeNull();
    expect(linha.street).toBeNull();
    expect(linha.neighborhood).toBeNull();
    expect(linha.state).toBeNull();
    expect(linha.line1).toBe("1600 Pennsylvania Ave NW");
  });

  it("volta do banco com a mesma forma", () => {
    const r = validarEndereco(US_VALIDO);
    if (!r.ok) throw new Error("deveria passar");
    const devolta = daLinha(paraLinha(r.endereco), "12025550123");
    expect(devolta).not.toBeNull();
    expect(ehEnderecoBR(devolta!)).toBe(false);
  });

  it("linha incoerente devolve null em vez de um endereço pela metade", () => {
    const r = validarEndereco(US_VALIDO);
    if (!r.ok) throw new Error("fixture inválida");
    const quebrado = { ...paraLinha(r.endereco), line1: null };
    expect(daLinha(quebrado, "1")).toBeNull();
  });

  it("o endereço impresso muda de forma conforme o país", () => {
    const br = validarEndereco(BR_VALIDO);
    const us = validarEndereco(US_VALIDO);
    if (!br.ok || !us.ok) throw new Error("deveriam passar");
    expect(formatarEndereco(br.endereco).join(" ")).toContain("CEP 12245-000");
    expect(formatarEndereco(us.endereco).join(" ")).toContain("UNITED STATES");
    expect(formatarEndereco(us.endereco).join(" ")).not.toContain("CEP");
  });
});

/* =========================================================================
 * FASE 3 — MOEDA
 * =======================================================================*/

describe("dinheiro é inteiro, e a moeda anda junto", () => {
  it("as seis moedas são aceitas e o resto não", () => {
    for (const m of ["BRL", "USD", "EUR", "GBP", "AUD", "CAD"]) {
      expect(ehMoedaSuportada(m)).toBe(true);
    }
    expect(ehMoedaSuportada("JPY")).toBe(false);
    expect(ehMoedaSuportada("BTC")).toBe(false);
  });

  it("float em dinheiro é recusado na porta", () => {
    expect(() => dinheiro(1050.5, "USD")).toThrow(/inteiro/i);
  });

  it("somar moedas diferentes é erro, não conversão silenciosa", () => {
    expect(() => somar(dinheiro(1000, "USD"), dinheiro(1000, "BRL"))).toThrow(/USD/);
  });

  it("valores continuam inteiros depois de somar e multiplicar", () => {
    const total = somar(dinheiro(32000, "USD"), dinheiro(1550, "USD"));
    expect(Number.isInteger(total.minor)).toBe(true);
    expect(total.minor).toBe(33550);
  });

  it("pedido em BRL não muda de comportamento", () => {
    const v = dinheiro(160000, "BRL");
    expect(formatarNumeroDinheiro(v)).toBe("1600.00");
  });

  it("pedido em USD preserva USD — nada é convertido para real na exibição", () => {
    const v = dinheiro(32000, "USD");
    expect(v.moeda).toBe("USD");
    expect(formatarNumeroDinheiro(v)).toBe("320.00");
  });
});

describe("moeda cobrada e moeda fiscal são coisas diferentes", () => {
  it("USD vira BRL só com taxa explícita, e o resultado é inteiro", () => {
    const fiscal = paraMoedaFiscal(dinheiro(32000, "USD"), {
      taxa: 5.42,
      fonte: "PTAX",
      data: "2026-08-27",
    });
    expect(fiscal.moeda).toBe("BRL");
    expect(fiscal.minor).toBe(173440); // 320.00 * 5.42 = 1734.40
    expect(Number.isInteger(fiscal.minor)).toBe(true);
  });

  it("BRL não é convertido", () => {
    const v = dinheiro(160000, "BRL");
    expect(paraMoedaFiscal(v, { taxa: 1, fonte: "n/a", data: "2026-08-27" })).toEqual(v);
  });

  it("taxa zero ou negativa é recusada", () => {
    expect(() =>
      paraMoedaFiscal(dinheiro(100, "USD"), { taxa: 0, fonte: "x", data: "2026-08-27" })
    ).toThrow();
  });
});

describe("preço por mercado é decisão comercial, não câmbio do dia", () => {
  const precos = [
    { moeda: "BRL" as Moeda, precoMinor: 65000, compareAtMinor: null },
    { moeda: "USD" as Moeda, precoMinor: 19900, compareAtMinor: null },
  ];

  it("devolve o preço cadastrado da moeda", () => {
    expect(precoNaMoeda(precos, "USD")?.minor).toBe(19900);
  });

  it("sem preço cadastrado devolve NULL — nunca converte o preço em real", () => {
    expect(precoNaMoeda(precos, "EUR")).toBeNull();
    expect(precoNaMoeda(precos, "GBP")).toBeNull();
  });
});

/* =========================================================================
 * FASES 5, 6, 7 e 8 — EXPORTAÇÃO
 * =======================================================================*/

const PRODUTO_SEM_DADOS: DadosFiscaisProduto = {
  nome: "Prótese Afro",
  ncm: null,
  hsCode: null,
  paisOrigem: null,
  descricaoEn: null,
  pesoLiquidoG: null,
};

const PRODUTO_COMPLETO: DadosFiscaisProduto = {
  nome: "Prótese Afro",
  ncm: "67042000",
  hsCode: "670420",
  paisOrigem: "CN",
  descricaoEn: "Human hair prosthesis",
  pesoLiquidoG: 90,
};

const SEM_PROVEDOR = { nfe: false, invoice: false, dhl: false };

function enderecoUS() {
  const r = validarEndereco(US_VALIDO);
  if (!r.ok) throw new Error("fixture inválida");
  return r.endereco;
}

describe("produto sem NCM mostra pendência e não inventa código", () => {
  const etapas = montarChecklist({
    pago: true,
    endereco: enderecoUS(),
    clienteTemContato: true,
    produtos: [PRODUTO_SEM_DADOS],
    provedores: SEM_PROVEDOR,
  });
  const fiscal = etapas.find((e) => e.chave === "fiscal_produto")!;

  it("a etapa fica pendente", () => {
    expect(fiscal.estado).toBe("pendente");
  });

  it("o detalhe nomeia o produto E o campo que falta", () => {
    expect(fiscal.detalhe).toContain("Prótese Afro");
    expect(fiscal.detalhe).toContain("NCM");
    expect(fiscal.detalhe).toContain("HS Code");
  });

  it("nenhum código aparece do nada em lugar nenhum", () => {
    const tudo = JSON.stringify(etapas);
    expect(tudo).not.toMatch(/\b6704\d{4}\b/);
  });
});

describe("terceiros ausentes aparecem como NÃO CONFIGURADO, nunca como pendente", () => {
  const etapas = montarChecklist({
    pago: true,
    endereco: enderecoUS(),
    clienteTemContato: true,
    produtos: [PRODUTO_COMPLETO],
    provedores: SEM_PROVEDOR,
  });

  it("NF-e, invoice e DHL estão em nao_configurado", () => {
    for (const chave of ["nfe", "invoice", "dhl"]) {
      expect(etapas.find((e) => e.chave === chave)!.estado).toBe("nao_configurado");
    }
  });

  it("mesmo com TODOS os dados nossos prontos, não promete despacho", () => {
    const status = derivarExportStatus(true, etapas);
    expect(status).toBe("ready_for_documents");
    expect(status).not.toBe("ready_for_dispatch");
  });
});

describe("o eixo de exportação", () => {
  it("pedido nacional nunca entra no fluxo de exportação", () => {
    expect(derivarExportStatus(false, [])).toBe("not_required");
  });

  it("falta de dado nosso é 'configuração pendente'", () => {
    const etapas = montarChecklist({
      pago: true,
      endereco: enderecoUS(),
      clienteTemContato: true,
      produtos: [PRODUTO_SEM_DADOS],
      provedores: SEM_PROVEDOR,
    });
    expect(derivarExportStatus(true, etapas)).toBe("pending_data");
  });

  it("pedido internacional não pago fica pendente, e a etapa de pagamento aponta isso", () => {
    const etapas = montarChecklist({
      pago: false,
      endereco: enderecoUS(),
      clienteTemContato: true,
      produtos: [PRODUTO_COMPLETO],
      provedores: SEM_PROVEDOR,
    });
    expect(etapas.find((e) => e.chave === "pagamento")!.estado).toBe("pendente");
    expect(derivarExportStatus(true, etapas)).toBe("pending_data");
  });

  it("endereço brasileiro num fluxo internacional é marcado como incompleto", () => {
    const br = validarEndereco(BR_VALIDO);
    if (!br.ok) throw new Error("fixture");
    const etapas = montarChecklist({
      pago: true,
      endereco: br.endereco,
      clienteTemContato: true,
      produtos: [PRODUTO_COMPLETO],
      provedores: SEM_PROVEDOR,
    });
    expect(etapas.find((e) => e.chave === "endereco")!.estado).toBe("pendente");
  });
});

describe("regras de país são dado, não condicional espalhada", () => {
  it("cada país declara o que exige", () => {
    expect(regraDoPais("US")!.exigeRegiao).toBe(true);
    expect(regraDoPais("PT")!.exigeRegiao).toBe(false);
    expect(regraDoPais("BR")!.rotuloPostal).toBe("CEP");
    expect(regraDoPais("GB")!.rotuloPostal).toBe("Postcode");
  });

  it("a moeda padrão de cada mercado está declarada", () => {
    expect(regraDoPais("US")!.moedaPadrao).toBe("USD");
    expect(regraDoPais("PT")!.moedaPadrao).toBe("EUR");
    expect(regraDoPais("GB")!.moedaPadrao).toBe("GBP");
    expect(regraDoPais("CA")!.moedaPadrao).toBe("CAD");
  });
});
