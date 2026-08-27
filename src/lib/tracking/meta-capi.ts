import "server-only";
import { createHash } from "node:crypto";
import { META_PIXEL_ID, MOEDA, centavosParaMoeda } from "./config";
import { ehProducao, descricaoDoAmbiente } from "@/lib/config/ambiente";
import { codigoDeEventoDeTeste } from "./permissao";

/**
 * Conversions API da Meta — o Purchase que sai do SERVIDOR.
 *
 * ===========================================================================
 * POR QUE O CAMINHO DE SERVIDOR É O PRINCIPAL, E NÃO O REFORÇO
 * ===========================================================================
 * Quem paga por Pix sai do site para o aplicativo do banco e frequentemente
 * NÃO VOLTA. Um Purchase que depende do navegador perde essas vendas — e, pior,
 * conta vendas fantasma de quem dá refresh na tela de obrigado.
 *
 * Aqui o evento sai quando o pagamento foi reconfirmado com o gateway, esteja
 * a pessoa na tela ou não. O disparo de navegador continua existindo, com o
 * MESMO event_id, só para melhorar a correspondência — e a Meta deduplica.
 *
 * ===========================================================================
 * SOBRE O HASH
 * ===========================================================================
 * A Meta exige que dado pessoal (e-mail, telefone, nome, CPF) chegue em
 * SHA-256, minúsculo e sem formatação. Não é burocracia: é o que permite
 * casar o comprador com o usuário do Facebook sem que nenhum dos dois lados
 * receba o dado cru do outro. Mandar sem hash é vazar dado de cliente para
 * uma plataforma de anúncios.
 */

const VERSAO = "v21.0";

export interface DadosPessoa {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  cpf?: string | null;
  cep?: string | null;
  city?: string | null;
  state?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}

export interface ResultadoEnvio {
  sucesso: boolean;
  motivoPulado?: string;
  httpStatus?: number;
  resposta?: unknown;
}

/** SHA-256 do valor normalizado. `null` quando não há o que mandar. */
function hash(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor.trim().toLowerCase();
  if (!limpo) return null;
  return createHash("sha256").update(limpo).digest("hex");
}

/** Telefone: só dígitos, com DDI. A Meta rejeita máscara. */
function hashTelefone(valor: string | null | undefined): string | null {
  if (!valor) return null;
  let d = valor.replace(/\D/g, "");
  if (!d) return null;
  // 10 ou 11 dígitos = número brasileiro sem DDI. Acrescenta o 55, senão a
  // Meta lê como número de outro país e a correspondência falha em silêncio.
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return createHash("sha256").update(d).digest("hex");
}

/** Nome: a Meta quer primeiro e último separados. */
function partesDoNome(nome: string | null | undefined): {
  fn: string | null;
  ln: string | null;
} {
  if (!nome) return { fn: null, ln: null };
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { fn: null, ln: null };
  return {
    fn: hash(partes[0] ?? null),
    ln: partes.length > 1 ? hash(partes[partes.length - 1] ?? null) : null,
  };
}

function semNulos(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)
  );
}

export async function enviarPurchaseMeta(input: {
  /**
   * CAMADA 3 de 3 (P0-3): envio marcado como TESTE na Meta. Quem decide é
   * src/lib/tracking/permissao.ts — aqui só se obedece. Eventos com
   * `test_event_code` aparecem no Gerenciador de Eventos para conferência e
   * NÃO entram na otimização das campanhas.
   */
  comoTeste?: boolean;
  eventId: string;
  eventTimeSegundos: number;
  valorCents: number;
  orderNumber: string;
  sourceUrl: string;
  contents: Array<{ id: string; quantity: number; item_price: number }>;
  numItems: number;
  pessoa: DadosPessoa;
}): Promise<ResultadoEnvio> {
  const token = process.env.META_CAPI_TOKEN;

  // Diz QUAL variável falta. "Não configurado" não ajuda ninguém a resolver.
  if (!META_PIXEL_ID) {
    return { sucesso: false, motivoPulado: "NEXT_PUBLIC_META_PIXEL_ID vazia" };
  }
  if (!token) {
    return { sucesso: false, motivoPulado: "META_CAPI_TOKEN vazia" };
  }

  /**
   * Guarda própria, redundante de propósito. Esta função é exportada e
   * qualquer código futuro pode chamá-la direto, pulando despachar.ts. Um
   * envio para a conta real a partir de desenvolvimento não pode depender de
   * quem chamou ter lembrado de checar.
   */
  if (!ehProducao() && !input.comoTeste) {
    return {
      sucesso: false,
      motivoPulado: `envio à Meta bloqueado fora de produção (${descricaoDoAmbiente()}) e sem test_event_code`,
    };
  }

  const { fn, ln } = partesDoNome(input.pessoa.fullName);

  const userData = semNulos({
    em: hash(input.pessoa.email),
    ph: hashTelefone(input.pessoa.phone),
    fn,
    ln,
    // external_id: o CPF serve como identificador estável do cliente. Vai
    // hasheado como todo o resto.
    external_id: hash(input.pessoa.cpf?.replace(/\D/g, "") ?? null),
    zp: hash(input.pessoa.cep?.replace(/\D/g, "") ?? null),
    ct: hash(input.pessoa.city?.replace(/\s/g, "") ?? null),
    st: hash(input.pessoa.state),
    country: hash("br"),
    // fbp e fbc vão CRUS — são identificadores do próprio pixel, não dado
    // pessoal. Hashear estes seria quebrá-los.
    fbp: input.pessoa.fbp ?? null,
    fbc: input.pessoa.fbc ?? null,
    client_ip_address: input.pessoa.clientIp ?? null,
    client_user_agent: input.pessoa.userAgent ?? null,
  });

  const corpo = {
    data: [
      {
        event_name: "Purchase",
        event_time: input.eventTimeSegundos,
        // A CHAVE DA DEDUPLICAÇÃO: mesmo id do disparo de navegador.
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.sourceUrl,
        user_data: userData,
        custom_data: {
          currency: MOEDA,
          value: centavosParaMoeda(input.valorCents),
          content_type: "product",
          content_ids: input.contents.map((c) => c.id),
          contents: input.contents,
          num_items: input.numItems,
          order_id: input.orderNumber,
        },
      },
    ],
    // Só existe quando o envio foi autorizado como teste. A Meta separa
    // esses eventos e não os usa para otimizar.
    ...(input.comoTeste && codigoDeEventoDeTeste()
      ? { test_event_code: codigoDeEventoDeTeste() }
      : {}),
  };

  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/${VERSAO}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        cache: "no-store",
      }
    );
  } catch (e) {
    return {
      sucesso: false,
      motivoPulado: `Meta não respondeu: ${e instanceof Error ? e.message : e}`,
    };
  }

  const texto = await res.text();
  let resposta: unknown = texto;
  try {
    resposta = JSON.parse(texto);
  } catch {
    /* resposta não-JSON: guarda o texto cru, que é melhor que nada */
  }

  return { sucesso: res.ok, httpStatus: res.status, resposta };
}
