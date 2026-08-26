import "server-only";

import type {
  ShippableOrder,
  ShipmentResult,
  ShipmentStatus,
  ShippingDestination,
  ShippingOrigin,
  ShippingPackageInfo,
  ShippingProvider,
  ShippingQuote,
} from "./provider";
import { ShippingUnavailable } from "./provider";

/**
 * Adapter real da SuperFrete.
 *
 * ===========================================================================
 * PROCEDÊNCIA
 * ===========================================================================
 * Os endpoints, os nomes de campo e os tetos de seguro daqui NÃO foram
 * inventados nem deduzidos: vieram da documentação oficial
 * (superfrete.readme.io), conferida em 19/08/2026 durante a construção do
 * site irmão, e já rodaram contra a API de produção lá. Este arquivo é a
 * mesma integração, adaptada ao contrato da Reverá.
 *
 * O que MUDA em relação ao irmão, de propósito:
 *   - o User-Agent identifica a Reverá, não a outra marca (a SuperFrete
 *     registra esse campo; se um dia o suporte deles precisar investigar um
 *     envio, dá para separar o que veio de cada loja);
 *   - `platform` na etiqueta idem.
 * O TOKEN pode ser o mesmo — é a mesma carteira, a mesma operação e o mesmo
 * endereço de origem. Trocar depois é mudar uma variável de ambiente.
 *
 * ===========================================================================
 * ARQUITETURA
 * ===========================================================================
 * A SuperFrete é a PLATAFORMA; quem leva a caixa é Correios, Loggi, Jadlog
 * ou J&T. Por isso `carrier` e `serviceName` andam separados do provider:
 * trocar de plataforma um dia não obriga a mexer no resto.
 */

const BASE =
  process.env.SUPERFRETE_SANDBOX === "1"
    ? "https://sandbox.superfrete.com"
    : "https://api.superfrete.com";

/**
 * OBRIGATÓRIO, e a documentação pede nome, versão e e-mail de contato
 * técnico. Sem ele a requisição é RECUSADA — não é firula, é requisito.
 */
const USER_AGENT =
  process.env.SUPERFRETE_USER_AGENT ??
  "Revera Protese Capilar 1.0 (franciscoemanuel20@gmail.com)";

/** Códigos dos serviços, conforme a documentação. */
export const SERVICO = {
  PAC: 1,
  SEDEX: 2,
  MINI: 17,
  JADLOG: 3,
  LOGGI: 31,
  JT: 33,
} as const;

/**
 * Teto de seguro por transportadora, da documentação.
 *
 * IMPORTANTE para a Reverá: a peça vale R$ 1.600 e o teto da Jadlog e da J&T
 * é R$ 1.500. Elas NÃO cobrem o valor declarado desta prótese. Por isso não
 * entram na lista padrão de cotação — mandar sem cobertura total é transferir
 * o risco do extravio para a operação sem ninguém perceber.
 */
export const TETO_SEGURO_CENTS: Record<number, number> = {
  [SERVICO.PAC]: 300_000,
  [SERVICO.SEDEX]: 300_000,
  [SERVICO.MINI]: 300_000,
  [SERVICO.LOGGI]: 300_000,
  [SERVICO.JADLOG]: 150_000,
  [SERVICO.JT]: 150_000,
};

/**
 * Serviços cotados por padrão. PAC e SEDEX cobrem o valor da peça e cobrem o
 * país inteiro; a Loggi entra porque em várias praças sai mais barata que o
 * SEDEX com a mesma cobertura.
 *
 * O Mini Envios (17) fica de fora: tem limite de tamanho que a caixa da
 * prótese estoura, e cotá-lo só produziria uma linha de erro em todo pedido.
 */
const SERVICOS_PADRAO = [SERVICO.PAC, SERVICO.SEDEX, SERVICO.LOGGI];

function token(): string {
  const t = process.env.SUPERFRETE_TOKEN ?? "";
  if (!t) {
    throw new ShippingUnavailable("SUPERFRETE_TOKEN não configurado.");
  }
  return t;
}

function cabecalhos(): Record<string, string> {
  return {
    Authorization: `Bearer ${token()}`,
    "User-Agent": USER_AGENT,
    accept: "application/json",
    "content-type": "application/json",
  };
}

async function interpretar(r: Response, caminho: string): Promise<unknown> {
  const texto = await r.text();
  if (!r.ok) {
    throw new ShippingUnavailable(
      `SuperFrete ${caminho} → HTTP ${r.status}: ${texto.slice(0, 300)}`
    );
  }
  try {
    return JSON.parse(texto);
  } catch {
    throw new ShippingUnavailable(
      `SuperFrete devolveu resposta não-JSON em ${caminho}: ${texto.slice(0, 200)}`
    );
  }
}

async function postar(caminho: string, corpo: unknown): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(`${BASE}/api/v0${caminho}`, {
      method: "POST",
      headers: cabecalhos(),
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
  } catch (e) {
    throw new ShippingUnavailable(`SuperFrete não respondeu em ${caminho}: ${e}`);
  }
  return interpretar(r, caminho);
}

async function buscar(caminho: string): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(`${BASE}/api/v0${caminho}`, {
      headers: cabecalhos(),
      cache: "no-store",
    });
  } catch (e) {
    throw new ShippingUnavailable(`SuperFrete não respondeu em ${caminho}: ${e}`);
  }
  return interpretar(r, caminho);
}

function paraCentavos(valor: unknown): number {
  const n = typeof valor === "string" ? parseFloat(valor) : Number(valor ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function soDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Remetente — o endereço de onde a peça sai.
 *
 * Os padrões são o endereço da operação, confirmado na base dos Correios em
 * 19/08/2026: Rua Síria 71, sala 39 — Jardim Oswaldo Cruz, São José dos
 * Campos/SP, CEP 12216-530. Fica no código porque endereço comercial não é
 * segredo, e assim a cotação funciona sem depender de configuração. Toda
 * variável de ambiente continua mandando quando definida — mudar de endereço
 * não exige deploy.
 *
 * `name` precisa ter nome E sobrenome: a documentação avisa que nome de uma
 * palavra só quebra o processamento.
 */
function remetente() {
  return {
    name: process.env.SUPERFRETE_REMETENTE_NOME || "Francisco Oliveira",
    address: process.env.SUPERFRETE_REMETENTE_RUA || "Rua Síria",
    number: process.env.SUPERFRETE_REMETENTE_NUMERO || "71",
    complement: process.env.SUPERFRETE_REMETENTE_COMPLEMENTO || "Sala 39",
    district: process.env.SUPERFRETE_REMETENTE_BAIRRO || "Jardim Oswaldo Cruz",
    city: process.env.SUPERFRETE_REMETENTE_CIDADE || "São José dos Campos",
    state_abbr: process.env.SUPERFRETE_REMETENTE_UF || "SP",
    postal_code: cepDeOrigem(),
  };
}

export function cepDeOrigem(): string {
  const cep = soDigitos(process.env.SUPERFRETE_CEP_ORIGEM || "12216530");
  if (cep.length !== 8) {
    throw new ShippingUnavailable(
      "SUPERFRETE_CEP_ORIGEM inválido — precisa de 8 dígitos."
    );
  }
  return cep;
}

export class SuperFreteShippingProvider implements ShippingProvider {
  readonly name = "superfrete";

  async quote(
    origin: ShippingOrigin,
    destination: ShippingDestination,
    packageInfo: ShippingPackageInfo,
    declaredValueCents: number
  ): Promise<ShippingQuote[]> {
    const cepOrigem = soDigitos(origin.cep) || cepDeOrigem();
    const cepDestino = soDigitos(destination.cep);
    if (cepDestino.length !== 8) {
      throw new ShippingUnavailable(`CEP de destino inválido: "${destination.cep}"`);
    }

    const bruto = await postar("/calculator", {
      from: { postal_code: cepOrigem },
      to: { postal_code: cepDestino },
      services: SERVICOS_PADRAO.join(","),
      options: {
        own_hand: false,
        receipt: false,
        insurance_value: declaredValueCents / 100,
        use_insurance_value: true,
      },
      // A API fala em kg e cm; o nosso contrato guarda gramas, porque peso de
      // produto em ponto flutuante é fonte clássica de arredondamento errado.
      package: {
        weight: packageInfo.weightGrams / 1000,
        height: packageInfo.heightCm,
        width: packageInfo.widthCm,
        length: packageInfo.lengthCm,
      },
    });

    const lista: Array<Record<string, unknown>> = Array.isArray(bruto)
      ? (bruto as Array<Record<string, unknown>>)
      : ((bruto as { data?: Array<Record<string, unknown>> })?.data ?? []);

    return lista.map((o) => {
      const serviceId = Number(o.id ?? o.service_id ?? 0);
      const teto = TETO_SEGURO_CENTS[serviceId] ?? 0;
      const empresa = o.company as { name?: string } | string | undefined;
      return {
        serviceId,
        serviceName: String(o.name ?? ""),
        carrier:
          typeof empresa === "string" ? empresa : String(empresa?.name ?? ""),
        priceCents: paraCentavos(o.price ?? o.custom_price),
        etaDays: o.delivery_time != null ? Number(o.delivery_time) : 0,
        coversInsurance: teto >= declaredValueCents,
        error: o.error ? String(o.error) : undefined,
      };
    });
  }

  /**
   * Passo 1 — POST /cart. A etiqueta nasce `pending`: existe na conta deles,
   * mas não foi paga, não tem rastreio e não debitou nada.
   *
   * `non_commercial: true` = declaração de conteúdo em vez de nota fiscal. Se
   * o contador definir que o envio sai com NF-e, este é o ponto exato que
   * muda (entra o objeto `invoice` com a chave de 44 dígitos).
   */
  async createLabel(order: ShippableOrder): Promise<ShipmentResult> {
    const d = order.recipient;

    const corpo = {
      from: remetente(),
      to: {
        name: d.name,
        address: d.street,
        number: d.number || "",
        complement: d.complement || "",
        // A documentação recusa bairro vazio; "NA" é o preenchimento que ela
        // própria sugere para endereço sem bairro.
        district: d.neighborhood || "NA",
        city: d.city,
        state_abbr: (d.state || "").toUpperCase(),
        postal_code: soDigitos(d.cep),
        // CPF/CNPJ é OBRIGATÓRIO para todas as transportadoras (DC-e).
        document: soDigitos(d.document),
        email: d.email ?? null,
        phone: d.phone ? soDigitos(d.phone).slice(-11) : null,
      },
      service: order.serviceId,
      products: [
        {
          name: "Prótese capilar personalizada",
          quantity: 1,
          unitary_value: order.declaredValueCents / 100,
        },
      ],
      volumes: {
        weight: order.packageInfo.weightGrams / 1000,
        height: order.packageInfo.heightCm,
        width: order.packageInfo.widthCm,
        length: order.packageInfo.lengthCm,
      },
      options: {
        insurance_value: order.declaredValueCents / 100,
        receipt: false,
        own_hand: false,
        non_commercial: true,
      },
      tag: order.orderNumber,
      platform: "Revera",
    };

    const criada = (await postar("/cart", corpo)) as
      | { id?: unknown; status?: unknown; data?: { id?: unknown } }
      | undefined;

    const id = String(criada?.id ?? criada?.data?.id ?? "");
    if (!id) {
      throw new ShippingUnavailable(
        `SuperFrete não devolveu id da etiqueta: ${JSON.stringify(criada).slice(0, 200)}`
      );
    }

    return {
      providerShipmentId: id,
      status: String(criada?.status ?? "pending"),
      trackingCode: null,
      carrier: null,
      labelUrl: null,
    };
  }

  /**
   * Passo 2 — POST /checkout. Debita o frete do saldo da carteira e a
   * etiqueta vira `released`. É AQUI que o dinheiro sai.
   *
   * Saldo insuficiente falha exatamente neste ponto, com a etiqueta já
   * criada. É um cenário real e a operação precisa enxergá-lo: pedido pago
   * pelo cliente, etiqueta presa por falta de saldo. Por isso o erro sobe com
   * a mensagem original em vez de virar um "falhou" genérico — e com o id,
   * para ninguém criar uma segunda e pagar duas.
   */
  async payLabel(providerShipmentId: string): Promise<void> {
    try {
      await postar("/checkout", { orders: [providerShipmentId] });
    } catch (e) {
      throw new ShippingUnavailable(
        `A etiqueta ${providerShipmentId} foi criada, mas o pagamento dela falhou (saldo na carteira?): ${
          e instanceof Error ? e.message : e
        }`
      );
    }
  }

  async getShipmentStatus(providerShipmentId: string): Promise<ShipmentStatus> {
    const r = (await buscar(
      `/order/info/${encodeURIComponent(providerShipmentId)}`
    )) as Record<string, unknown> | undefined;

    const empresa = r?.company as { name?: string } | undefined;
    return {
      status: String(r?.status ?? "pending"),
      trackingCode: r?.tracking ? String(r.tracking) : null,
      carrier: (r?.service_name as string) ?? empresa?.name ?? null,
    };
  }

  /** O PDF da etiqueta, para a equipe imprimir e colar na caixa. */
  async getLabelUrl(providerShipmentId: string): Promise<string | null> {
    const r = (await postar("/tag/print", {
      orders: [providerShipmentId],
      mode: "private",
    })) as { url?: unknown } | undefined;
    return r?.url ? String(r.url) : null;
  }
}
