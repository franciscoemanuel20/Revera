/**
 * De onde a pessoa veio — lido no NAVEGADOR, no momento do checkout.
 *
 * Roda no cliente porque é lá que os cookies das plataformas existem: _fbp e
 * _fbc são escritos pelo pixel da Meta, _ga pelo gtag do Google. O servidor
 * não os enxerga sozinho de forma confiável.
 *
 * O que este arquivo NÃO faz: decidir preço, quantidade, ou qualquer coisa
 * que valha dinheiro. Tudo aqui é sinal de medição. É por isso que aceitar
 * estes campos do navegador é seguro, enquanto aceitar `total` não seria —
 * o pior que alguém consegue mentindo aqui é sujar o próprio relatório.
 */

export interface Atribuicao {
  fbp: string | null;
  fbc: string | null;
  gaClientId: string | null;
  fbclid: string | null;
  gclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}

function cookie(nome: string): string | null {
  if (typeof document === "undefined") return null;
  const achado = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${nome}=`));
  return achado ? decodeURIComponent(achado.slice(nome.length + 1)) : null;
}

/**
 * O client_id do GA4 vive DENTRO do cookie _ga, que tem o formato
 * `GA1.1.123456789.1700000000`. O client_id é só a parte final:
 * `123456789.1700000000` — os dois primeiros trechos são versão e
 * profundidade de domínio.
 *
 * Mandar o cookie inteiro para o Measurement Protocol é o erro clássico: o
 * GA4 aceita, trata como um usuário desconhecido, e a compra aparece
 * desligada da visita que a gerou.
 */
function gaClientIdDoCookie(): string | null {
  const bruto = cookie("_ga");
  if (!bruto) return null;
  const partes = bruto.split(".");
  if (partes.length < 4) return null;
  return `${partes[2]}.${partes[3]}`;
}

/**
 * Guarda os parâmetros de campanha na primeira visita.
 *
 * Sem isto, a atribuição se perderia: a pessoa chega em
 * `/?utm_source=instagram`, navega para o produto, vai ao carrinho — e no
 * checkout a query string já não tem nada. A campanha que trouxe a venda
 * ficaria sem crédito.
 *
 * `sessionStorage` e não `localStorage` de propósito: campanha é da visita.
 * Guardar para sempre faria uma compra de daqui a três meses, vinda de busca
 * orgânica, ser creditada ao anúncio de hoje.
 *
 * E só grava se AINDA NÃO houver valor: a primeira origem da sessão é a que
 * vale, não a última.
 */
const CHAVE = "revera_atribuicao";

export function guardarAtribuicaoDaUrl(): void {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const campos = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "fbclid",
    "gclid",
  ];

  const presentes = campos.filter((c) => params.get(c));
  if (presentes.length === 0) return;

  try {
    if (sessionStorage.getItem(CHAVE)) return;
    const guardar: Record<string, string> = {};
    for (const c of presentes) {
      const v = params.get(c);
      if (v) guardar[c] = v.slice(0, 500);
    }
    sessionStorage.setItem(CHAVE, JSON.stringify(guardar));
  } catch {
    // Navegação privada pode recusar sessionStorage. Perder atribuição é
    // ruim; quebrar a página por causa dela seria pior.
  }
}

function guardado(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function lerAtribuicao(): Atribuicao {
  const g = guardado();
  const url =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  // A URL de agora ganha do guardado só quando o guardado não tem — assim
  // uma pessoa que volta pelo mesmo anúncio não perde nada, e a primeira
  // origem continua valendo.
  const pega = (nome: string) => g[nome] ?? url.get(nome) ?? null;

  return {
    fbp: cookie("_fbp"),
    fbc: cookie("_fbc"),
    gaClientId: gaClientIdDoCookie(),
    fbclid: pega("fbclid"),
    gclid: pega("gclid"),
    utmSource: pega("utm_source"),
    utmMedium: pega("utm_medium"),
    utmCampaign: pega("utm_campaign"),
    utmContent: pega("utm_content"),
    utmTerm: pega("utm_term"),
  };
}
