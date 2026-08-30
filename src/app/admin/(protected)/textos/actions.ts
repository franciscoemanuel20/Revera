"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/admin/audit";
import { REGISTRO, rotaDaPagina, type ChaveDeTexto } from "@/lib/conteudo/registro";

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
