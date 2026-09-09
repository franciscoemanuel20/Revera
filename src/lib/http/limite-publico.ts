import "server-only";

/**
 * Freio curto para rotas públicas que acionam serviços pagos ou recebem
 * arquivos. Não é uma identidade de segurança (o IP pode mudar), mas evita
 * repetição acidental e abuso em rajada dentro da mesma instância.
 *
 * Se a operação crescer para várias instâncias, este limite deve migrar para
 * armazenamento compartilhado. Enquanto isso, as validações de negócio e as
 * cotas dos provedores continuam sendo a barreira definitiva.
 */
type Registro = { inicio: number; expiraEm: number; quantidade: number };

const registros = new Map<string, Registro>();
const MAX_REGISTROS = 2_000;

export function identificarCliente(headers: Headers): string {
  // Na Vercel este cabeçalho é preenchido pela plataforma. Em desenvolvimento
  // o fallback mantém testes e uso local previsíveis, sem confiar em um valor
  // enviado pelo corpo da requisição.
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]?.trim() || "desconhecido";

  const encaminhado = headers.get("x-forwarded-for");
  return encaminhado?.split(",")[0]?.trim() || "desconhecido";
}

export function consumirLimitePublico(input: {
  escopo: string;
  cliente: string;
  maximo: number;
  janelaMs: number;
  agora?: number;
}): { permitido: boolean; retryAfterSeconds: number } {
  const agora = input.agora ?? Date.now();
  if (registros.size >= MAX_REGISTROS) {
    for (const [chaveRegistrada, registro] of registros) {
      if (registro.expiraEm <= agora) registros.delete(chaveRegistrada);
    }
    while (registros.size >= MAX_REGISTROS) {
      const maisAntigo = registros.keys().next().value;
      if (!maisAntigo) break;
      registros.delete(maisAntigo);
    }
  }
  const chave = `${input.escopo}:${input.cliente}`;
  const existente = registros.get(chave);

  if (!existente || existente.expiraEm <= agora) {
    registros.set(chave, { inicio: agora, expiraEm: agora + input.janelaMs, quantidade: 1 });
    return { permitido: true, retryAfterSeconds: 0 };
  }

  if (existente.quantidade >= input.maximo) {
    return {
      permitido: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existente.expiraEm - agora) / 1000)),
    };
  }

  existente.quantidade += 1;
  return { permitido: true, retryAfterSeconds: 0 };
}
