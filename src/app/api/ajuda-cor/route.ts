import { NextResponse } from "next/server";
import {
  enviarPedidoAjudaCor,
  TAMANHO_MAXIMO_FOTO_AJUDA_COR_BYTES,
} from "@/lib/color-help/enviar-pedido";
import { consumirLimitePublico, identificarCliente } from "@/lib/http/limite-publico";

const TAMANHO_MAXIMO_REQUISICAO_BYTES = TAMANHO_MAXIMO_FOTO_AJUDA_COR_BYTES + 256 * 1024;

export async function POST(request: Request) {
  const limite = consumirLimitePublico({
    escopo: "ajuda-cor",
    cliente: identificarCliente(request.headers),
    maximo: 3,
    janelaMs: 10 * 60_000,
  });
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "Aguarde alguns minutos antes de enviar outra foto." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeconds) } }
    );
  }

  const tamanhoDeclarado = Number(request.headers.get("content-length"));
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > TAMANHO_MAXIMO_REQUISICAO_BYTES) {
    return NextResponse.json({ error: "A imagem precisa ter até 5MB." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await lerFormDataLimitado(request, TAMANHO_MAXIMO_REQUISICAO_BYTES);
  } catch (erro) {
    if (erro instanceof LimiteDeCorpoExcedido) {
      return NextResponse.json({ error: "A imagem precisa ter até 5MB." }, { status: 413 });
    }
    return NextResponse.json({ error: "Não foi possível ler o envio da foto." }, { status: 400 });
  }

  const resultado = await enviarPedidoAjudaCor(formData);
  return NextResponse.json(resultado, { status: "error" in resultado ? 400 : 201 });
}

async function lerFormDataLimitado(request: Request, maximoBytes: number): Promise<FormData> {
  if (!request.body) throw new Error("corpo ausente");
  const leitor = request.body.getReader();
  const partes: BlobPart[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximoBytes) {
        await leitor.cancel();
        throw new LimiteDeCorpoExcedido();
      }
      // Copia para um ArrayBuffer próprio: o tipo do stream admite memória
      // compartilhada, mas Blob aceita somente o buffer transferível comum.
      partes.push(new Uint8Array(value).buffer);
    }
  } finally {
    leitor.releaseLock();
  }
  const contentType = request.headers.get("content-type");
  if (!contentType) throw new Error("content type ausente");
  return new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: new Blob(partes) }).formData();
}

class LimiteDeCorpoExcedido extends Error {}
