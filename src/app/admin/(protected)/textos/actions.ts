"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { REGISTRO, rotaDaPagina, type ChaveDeTexto } from "@/lib/conteudo/registro";
import {
  BUCKET_MIDIA,
  TAMANHO_MAXIMO_BYTES,
  motivoDeImagemInvalida,
  nomeArquivoSeguro,
  tipoAceito,
} from "@/lib/conteudo/midia";

// Server Actions do painel /admin/textos. Esta tela nunca CRIA chave nova —
// o conjunto de chaves possíveis é o REGISTRO (src/lib/conteudo/registro.ts,
// arquivo do Francisco), e uma chave que não está lá nem compila do lado do
// cliente (ChaveDeTexto = keyof typeof REGISTRO). O que estas ações fazem é
// só gravar ou apagar a EDIÇÃO daquela chave em site_texts — o mesmo
// espírito de "só edita, nunca cria" de content_blocks
// (ver src/app/admin/(protected)/conteudo/actions.ts).

export type ResultadoTexto = { error: string } | { ok: true };

/**
 * A página pública correspondente a cada `pagina` do registro, para saber o
 * que revalidar depois de salvar. Feito à mão (não por convenção de nome)
 * porque nem toda página do site vive na raiz do slug — e quem descobrir
 * isso tarde é o Francisco vendo o site com texto velho.
 *
 * Quem migrar uma página nova para o registro e não encontrar a entrada
 * aqui: adicione-a. Sem ela, o salvar continua funcionando (a tabela grava
 * normal), só o cache da página pública demora até expirar sozinho.
 */
function revalidarRotas(pagina: string) {
  revalidatePath("/admin/textos");
  // A rota vem do registro, junto do nome da página. Antes era um mapa à
  // parte aqui — e um mapa à parte é um mapa que alguém esquece de
  // atualizar ao cadastrar página nova.
  const rota = rotaDaPagina(pagina);
  if (rota) revalidatePath(rota);
}

const chaveSchema = z
  .string()
  .trim()
  .min(1, "Chave inválida.")
  .refine((c): c is ChaveDeTexto => c in REGISTRO, "Este texto não existe no registro do site.");

/**
 * Grava a edição de `chave`. Duas situações viram "apagar a linha" em vez de
 * gravar, e as duas têm o mesmo motivo — é assim que se volta ao original,
 * está no cabeçalho da migration 12:
 *
 * 1. Valor em branco: ninguém edita um texto para deixá-lo vazio de
 *    propósito; é quase sempre um apagão sem querer, e o resultado não pode
 *    ser um título sumido da página.
 * 2. Valor igual ao original do registro: gravar uma cópia idêntica do texto
 *    do código só cria uma linha para alguém manter sincronizada depois, e
 *    faria o painel mentir dizendo "editado" para um texto que não mudou.
 */
export async function salvarTexto(chave: string, valor: string): Promise<ResultadoTexto> {
  const parsedChave = chaveSchema.safeParse(chave);
  if (!parsedChave.success) {
    return { error: parsedChave.error.issues[0]?.message ?? "Chave inválida." };
  }

  const padrao = REGISTRO[parsedChave.data].padrao;
  const valorLimpo = valor.trim();

  if (valorLimpo === "" || valorLimpo === padrao.trim()) {
    return restaurarOriginal(chave);
  }

  // Chave de foto nunca aceita um endereço qualquer. Ver o comentário de
  // motivoDeImagemInvalida: um `src` ruim não deixa a foto quebrada, deixa
  // a PÁGINA quebrada — e a promessa da migration 12 é justamente que
  // nenhuma edição feita no painel consiga derrubar uma página.
  if (REGISTRO[parsedChave.data].tipo === "imagem") {
    const motivo = motivoDeImagemInvalida(valorLimpo);
    if (motivo) return { error: motivo };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pagina } = REGISTRO[parsedChave.data];

  const { error } = await supabase.from("site_texts").upsert(
    {
      chave: parsedChave.data,
      valor,
      pagina,
      rotulo: REGISTRO[parsedChave.data].rotulo,
      tipo: REGISTRO[parsedChave.data].tipo,
      updated_at: new Date().toISOString(),
      updated_by: user?.email ?? null,
    },
    { onConflict: "chave" }
  );

  if (error) {
    return {
      error:
        "Não foi possível salvar. Confira se a migration 00000000000012_conteudo_editavel.sql já foi aplicada no Supabase.",
    };
  }

  await registrarAuditoria(supabase, {
    action: "textos.salvar",
    entityType: "site_texts",
    entityId: parsedChave.data,
    diff: { chave: parsedChave.data },
  });

  revalidarRotas(pagina);
  return { ok: true };
}

/** Apaga a edição de `chave` — o texto volta a vir do registro (do código). */
export async function restaurarOriginal(chave: string): Promise<ResultadoTexto> {
  const parsedChave = chaveSchema.safeParse(chave);
  if (!parsedChave.success) {
    return { error: parsedChave.error.issues[0]?.message ?? "Chave inválida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("site_texts").delete().eq("chave", parsedChave.data);

  if (error) {
    return {
      error:
        "Não foi possível restaurar o texto original. Confira se a migration 00000000000012_conteudo_editavel.sql já foi aplicada no Supabase.",
    };
  }

  await registrarAuditoria(supabase, {
    action: "textos.restaurar",
    entityType: "site_texts",
    entityId: parsedChave.data,
    diff: null,
  });

  revalidarRotas(REGISTRO[parsedChave.data].pagina);
  return { ok: true };
}

export type ResultadoTrocarImagem = { error: string } | { ok: true; url: string };

/**
 * Envia uma foto do computador e já a coloca no lugar de `chave` — um passo
 * só.
 *
 * POR QUE NÃO REAPROVEITOU `enviarImagem` DE /admin/midia
 * ---------------------------------------------------------------------------
 * Aquela ação faz metade disto: sobe o arquivo e devolve a URL. Chamá-la
 * daqui e depois chamar `salvarTexto` funcionaria, e foi a primeira ideia. O
 * problema é o meio do caminho: se o upload dá certo e o salvar falha, sobra
 * uma foto no bucket que ninguém referencia e que ninguém sabe que existe —
 * e /admin/midia passa a mostrar lixo acumulado que nem dá para excluir com
 * segurança, porque quem olha não sabe mais o que é lixo e o que está em uso.
 *
 * Aqui os dois passos vivem na mesma função, então o caso "subiu mas não
 * colou" tem dono: a foto órfã é apagada antes de a mensagem de erro sair.
 *
 * O FLUXO EM SI é o pedido do Francisco de 02/09: "tudo que você puder fazer
 * para ela conseguir alterar dentro do administrador". Trocar uma foto tinha
 * três passos (ir na Biblioteca, subir, copiar a URL, voltar e colar) e um
 * deles era copiar uma URL à mão — que é exatamente onde uma pessoa que não
 * é programadora erra, e o erro derruba a página.
 */
export async function trocarImagem(
  chave: string,
  formData: FormData
): Promise<ResultadoTrocarImagem> {
  const parsedChave = chaveSchema.safeParse(chave);
  if (!parsedChave.success) {
    return { error: parsedChave.error.issues[0]?.message ?? "Chave inválida." };
  }
  if (REGISTRO[parsedChave.data].tipo !== "imagem") {
    return { error: "Este item do site não é uma foto." };
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Escolha uma foto antes de enviar." };
  }
  // Pelo content-type real, não pela extensão do nome: o nome quem escolhe é
  // quem envia. Mesmo critério de /admin/midia e de /cores.
  if (!tipoAceito(arquivo.type) || !arquivo.type.startsWith("image/")) {
    return { error: "Formato não aceito. Envie uma foto em JPG, PNG, WEBP ou AVIF." };
  }
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { error: "A foto é grande demais. O tamanho máximo é 5 MB." };
  }

  const supabase = await createClient();
  const caminho = nomeArquivoSeguro(arquivo.name, arquivo.type);

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_MIDIA)
    .upload(caminho, await arquivo.arrayBuffer(), {
      contentType: arquivo.type,
      upsert: false, // o nome já sai com sufixo aleatório; colisão aqui seria bug
    });

  if (erroUpload) {
    const bucketAusente = erroUpload.message?.toLowerCase().includes("bucket not found");
    return {
      error: bucketAusente
        ? "O espaço das fotos do site ainda não foi criado no banco (falta aplicar supabase/aplicar/CONTEUDO-BUCKET.sql). Avise quem cuida do site."
        : "Não foi possível enviar a foto agora. Tente de novo em instantes.",
    };
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET_MIDIA).getPublicUrl(caminho);
  const url = publicUrlData.publicUrl;

  // A MESMA validação da digitação à mão, aplicada ao que o próprio Storage
  // devolveu. Parece paranoia e não é: se um dia o bucket deixar de ser
  // público, ou a URL vier em http, o que chega aqui é um endereço que o
  // next/image recusa — e o estrago sairia na página pública, não aqui.
  const motivo = motivoDeImagemInvalida(url);
  if (motivo) {
    await supabase.storage.from(BUCKET_MIDIA).remove([caminho]);
    return { error: "A foto foi enviada, mas o endereço gerado não serve para o site. Avise quem cuida do site." };
  }

  const resultado = await salvarTexto(parsedChave.data, url);
  if ("error" in resultado) {
    // Não colou: a foto não pode ficar no bucket sem dono (ver o cabeçalho).
    await supabase.storage.from(BUCKET_MIDIA).remove([caminho]);
    return resultado;
  }

  await registrarAuditoria(supabase, {
    action: "textos.trocarImagem",
    entityType: "site_texts",
    entityId: parsedChave.data,
    diff: { arquivo: caminho, nomeOriginal: arquivo.name, tamanho: arquivo.size },
  });

  revalidatePath("/admin/midia");
  return { ok: true, url };
}
