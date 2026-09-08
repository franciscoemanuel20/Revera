import { createClient } from "@/lib/supabase/server";
import { REGISTRO, chavesDeVideo, nomeDaPagina } from "@/lib/conteudo/registro";
import { VideosManager, type VideoItemView } from "./VideosManager";

// Painel de vídeos editáveis (08/09/2026) — separado de /admin/textos de
// propósito: pedido do Francisco de ter os vídeos num lugar próprio, sem
// misturar com foto ou texto (mesmo raciocínio que já separou "Biblioteca"
// de "Textos e fotos", ver o comentário em admin/layout.tsx).
//
// Por baixo é o MESMO mecanismo de site_texts (ver textos/page.tsx e o
// cabeçalho da migration 12) — esta tela só filtra por tipo "video" em vez
// de agrupar por página, porque hoje existe um vídeo só e "página: Página
// inicial" seria uma seção de uma linha.
export default async function VideosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_texts").select("chave, valor, updated_by");

  // migration 00000000000012_conteudo_editavel.sql (ou a 16, que acrescenta
  // o tipo "video") pode não ter sido aplicada ainda. O registro segue
  // completo independente disso, então a tela mostra o vídeo original; só
  // a troca fica bloqueada até a migration existir de verdade no banco.
  const somenteLeitura = Boolean(error);

  const edicoes = new Map<string, { valor: string; updatedBy: string | null }>();
  if (!error && data) {
    for (const linha of data) {
      if (typeof linha.valor === "string" && linha.valor.trim() !== "") {
        edicoes.set(linha.chave as string, {
          valor: linha.valor as string,
          updatedBy: (linha.updated_by as string | null) ?? null,
        });
      }
    }
  }

  const itens: VideoItemView[] = chavesDeVideo().map((chave) => {
    const registro = REGISTRO[chave];
    const edicao = edicoes.get(chave);
    return {
      chave,
      rotulo: registro.rotulo,
      pagina: nomeDaPagina(registro.pagina),
      padrao: registro.padrao,
      valorAtual: edicao?.valor ?? registro.padrao,
      editado: Boolean(edicao),
      updatedBy: edicao?.updatedBy ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6 pb-16">
      <h1 className="font-display text-2xl text-ink">Vídeos do site</h1>
      <p className="text-sm text-ink/60">
        Envie um vídeo em MP4, até 25 MB, e clique em &quot;Enviar e trocar&quot; —
        a mudança aparece no site em instantes. &quot;Voltar ao vídeo original&quot;
        apaga a troca e devolve o vídeo que veio no código.
      </p>

      {somenteLeitura ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ainda não é possível trocar vídeo aqui: a tabela de conteúdo não foi
          encontrada no banco. O mais provável é faltar aplicar
          supabase/aplicar/CONTEUDO-EDITAVEL.sql, supabase/aplicar/CONTEUDO-BUCKET.sql
          e supabase/aplicar/VIDEO-EDITAVEL.sql no Supabase, nessa ordem — aplique e
          recarregue esta página. Enquanto isso, o vídeo abaixo é o mesmo que já
          está no site, só que sem poder trocar.
        </p>
      ) : null}

      {itens.length === 0 ? (
        <p className="text-sm text-ink/60">Nenhum vídeo cadastrado ainda.</p>
      ) : (
        <VideosManager itens={itens} somenteLeitura={somenteLeitura} />
      )}
    </div>
  );
}
