import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const VERSAO = 1;
const DURACAO_MS = 10 * 60_000;

export interface SnapshotCotacaoInternacional {
  versao: 1;
  cartId: string;
  carrinhoHash: string;
  enderecoHash: string;
  moeda: string;
  subtotalCentavos: number;
  freteCentavos: number;
  totalCentavos: number;
  codigoServico: string;
  nomeServico: string;
  prazoDias: number | null;
  dataEntrega: string | null;
  termosVersao: string;
  emitidoEm: number;
  expiraEm: number;
}

function chaveAssinatura(): string {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave || chave.length < 32) {
    throw new Error("Chave de assinatura do checkout indisponível.");
  }
  return chave;
}

export function hashCheckout(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function emitirConfirmacaoCotacao(
  snapshot: Omit<SnapshotCotacaoInternacional, "versao" | "emitidoEm" | "expiraEm">
): string {
  const agora = Date.now();
  const payload: SnapshotCotacaoInternacional = {
    ...snapshot,
    versao: VERSAO,
    emitidoEm: agora,
    expiraEm: agora + DURACAO_MS,
  };
  const codificado = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const assinatura = createHmac("sha256", chaveAssinatura()).update(codificado).digest("base64url");
  return `${codificado}.${assinatura}`;
}

export function validarConfirmacaoCotacao(token: string): SnapshotCotacaoInternacional | null {
  if (token.length > 4096) return null;
  const [codificado, assinaturaRecebida, extra] = token.split(".");
  if (!codificado || !assinaturaRecebida || extra) return null;

  let assinaturaEsperada: Buffer;
  try {
    assinaturaEsperada = createHmac("sha256", chaveAssinatura()).update(codificado).digest();
  } catch {
    return null;
  }

  let assinatura: Buffer;
  try {
    assinatura = Buffer.from(assinaturaRecebida, "base64url");
  } catch {
    return null;
  }
  if (assinatura.length !== assinaturaEsperada.length || !timingSafeEqual(assinatura, assinaturaEsperada)) return null;

  try {
    const payload = JSON.parse(Buffer.from(codificado, "base64url").toString("utf8")) as SnapshotCotacaoInternacional;
    const agora = Date.now();
    if (
      payload.versao !== VERSAO ||
      !Number.isSafeInteger(payload.emitidoEm) ||
      !Number.isSafeInteger(payload.expiraEm) ||
      payload.emitidoEm > agora + 30_000 ||
      payload.expiraEm <= agora ||
      payload.expiraEm - payload.emitidoEm > DURACAO_MS
    ) return null;
    return payload;
  } catch {
    return null;
  }
}
