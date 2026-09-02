import { createClient } from "@/lib/supabase/server";
import { REGISTRO, paginasComTexto, chavesDaPagina, nomeDaPagina } from "@/lib/conteudo/registro";
import { TextosManager, type GrupoTextos } from "./TextosManager";

// Painel de textos editáveis (30/08/2026); ganhou as FOTOS em 02/09/2026.
//
// A foto entrou por aqui, e não numa tela nova, porque para quem usa o
// painel não existe a diferença entre "trocar o título da seção" e "trocar
// a foto da seção": é a mesma seção da mesma página. Separar em duas telas
// obrigaria a lembrar em qual delas mora cada pedaço.
//
// Por dentro, a foto também é o mesmo mecanismo: chave no registro, valor
// em site_texts, ausência de linha = volta ao que veio no código. Só a
// caixa que o painel desenha muda (ver TextoRegistrado.tipo).
//
// A LISTA vem do REGISTRO (src/lib/conteudo/registro.ts), não da tabela
// site_texts — essa foi a correção de rota do Francisco depois da primeira
// versão desta tela: listar a tabela deixaria o painel vazio até alguém
// semear os ~90 textos nela, e um seed é exatamente o tipo de cópia que
// apodrece na primeira vez que a página mudar no código sem que alguém
// lembre de atualizar o banco também.
//
// Aqui o registro é a fonte da lista e do texto original; a tabela só entra
// para dizer "isto aqui foi editado, e para que valor". Por isso esta tela
// NUNCA fica vazia (o registro sempre tem alguma página) e nunca mente sobre
// qual é o texto de verdade do site.
export default async function TextosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_texts").select("chave, valor, updated_by");

  // migration 00000000000012_conteudo_editavel.sql pode não ter sido
  // aplicada ainda — a tabela nem existe, e a consulta falha. O registro
  // segue completo independente disso (ele mora no código), então a tela
  // continua mostrando todo o texto original; só a edição fica bloqueada
  // até a migration existir de verdade no banco.
  const somenteLeitura = Boolean(error);

  const edicoes = new Map<string, { valor: string; updatedBy: string | null }>();
  if (!error && data) {
    for (const linha of data) {
      // Valor em branco conta como "não editado" — é o mesmo critério de
      // src/lib/conteudo/textos.ts, e precisa ser o mesmo dos dois lados:
      // se um lado tratasse linha em branco como edição válida, o painel
      // mostraria "editado" para um texto que o site já trata como original.
      if (typeof linha.valor === "string" && linha.valor.trim() !== "") {
        edicoes.set(linha.chave as string, {
          valor: linha.valor as string,
          updatedBy: (linha.updated_by as string | null) ?? null,
        });
      }
    }
  }

  const grupos: GrupoTextos[] = paginasComTexto().map((pagina) => ({
    pagina,
    titulo: nomeDaPagina(pagina),
    itens: chavesDaPagina(pagina).map((chave) => {
      const registro = REGISTRO[chave];
      const edicao = edicoes.get(chave);
      return {
        chave,
        rotulo: registro.rotulo,
        tipo: registro.tipo,
        padrao: registro.padrao,
        valorAtual: edicao?.valor ?? registro.padrao,
        editado: Boolean(edicao),
        updatedBy: edicao?.updatedBy ?? null,
      };
    }),
  }));

  return (
    <div className="flex flex-col gap-6 pb-16">
      <h1 className="font-display text-2xl text-ink">Textos e fotos do site</h1>
      <p className="text-sm text-ink/60">
        Edite um texto e clique em salvar — a mudança aparece no site em instantes.
        Nas fotos, escolha um arquivo do computador e clique em &quot;Enviar e
        trocar&quot;. Em qualquer um dos dois, &quot;voltar ao original&quot; apaga a
        alteração e devolve o que veio no site.
      </p>

      {somenteLeitura ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ainda não é possível salvar edições aqui: a tabela de textos não foi
          encontrada no banco. O mais provável é que a migration
          00000000000012_conteudo_editavel.sql não tenha sido aplicada no Supabase
          — aplique-a e recarregue esta página. Enquanto isso, os textos abaixo são
          os mesmos que já estão no site, só que sem poder editar — e as fotos
          não podem ser trocadas.
        </p>
      ) : null}

      <TextosManager grupos={grupos} somenteLeitura={somenteLeitura} />
    </div>
  );
}
