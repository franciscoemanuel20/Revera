"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { tipoDeMidiaPelaUrl } from "@/lib/conteudo/midia";
import { excluirFotoProduto, salvarFotoProduto } from "./fotos-actions";

export interface FotoDoProduto {
  id: string;
  url: string;
  altText: string;
  variantId: string | null;
  sortOrder: number;
  isPrimary: boolean;
  tipo: "image" | "video";
}

export interface VarianteParaFoto {
  id: string;
  /** "1B", "3.10", "1B 50%" — o nome da cor, que é como o Francisco fala. */
  rotulo: string;
  /** Cor desativada continua listada, mas avisada: o cliente não a vê. */
  corAtiva: boolean;
}

export interface FotoDisponivel {
  url: string;
  rotulo: string;
  grupo: string;
}

interface Props {
  productId: string;
  fotosIniciais: FotoDoProduto[];
  variantes: VarianteParaFoto[];
  disponiveis: FotoDisponivel[];
}

/**
 * FOTOS DO PRODUTO — a tela que faltava (03/09/2026).
 *
 * O painel nunca gravou uma linha de `product_media`: as fotos do site foram
 * criadas por script. A Biblioteca de Fotos mandava "copie a URL para usar no
 * cadastro de um produto" e não existia esse cadastro.
 *
 * O campo que motivou a tela é o de COR. Preenchido, a página do produto
 * troca a foto grande pela peça naquela cor quando o cliente clica na cartela
 * (ver ProdutoInterativo, `fotoDaCor`) — em vez de cair na foto genérica da
 * cartela de cores, que mostra a cor certa mas não promete ser este modelo.
 *
 * Fica FORA do <form> do ProductForm de propósito: aquele formulário grava
 * produto, variantes e regras de desconto numa tacada só, e é o caminho por
 * onde passa preço. Foto não tem por que dividir botão de salvar com preço —
 * cada linha aqui grava sozinha, na hora.
 */
export function FotosDoProduto({ productId, fotosIniciais, variantes, disponiveis }: Props) {
  const router = useRouter();
  const [fotos, setFotos] = useState<FotoDoProduto[]>(fotosIniciais);

  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /**
   * QUEM ESTÁ SALVANDO É UM CONJUNTO, NÃO UM id (03/09/2026, achado do Codex).
   *
   * Com um `salvandoId` só, começar a gravar a foto B enquanto a A ainda
   * estava no ar reabilitava a linha A antes da hora, e o fim de B liberava
   * tudo mesmo com A pendente. Cada linha agora responde pelo próprio estado.
   */
  const [salvando, setSalvando] = useState<ReadonlySet<string>>(new Set());
  const [confirmando, setConfirmando] = useState<FotoDoProduto | null>(null);

  /**
   * A LISTA SE RECONCILIA COM O SERVIDOR (03/09/2026, achado do Codex).
   *
   * `useState(fotosIniciais)` lê a prop UMA vez: depois disso, `router.refresh()`
   * trazia dados novos do servidor e a tela seguia mostrando o palpite local.
   * Isso importa nos desfechos meio-a-meio — por exemplo, a exclusão que
   * apagou a foto e falhou em promover a próxima principal: a linha já não
   * existe no banco e continuaria na tela até alguém recarregar.
   *
   * A comparação é por VALOR: a prop é um array novo a cada render do
   * servidor, então comparar referência dispararia sempre.
   *
   * E NÃO RECONCILIA COM GRAVAÇÃO EM CURSO (segundo achado do Codex, no mesmo
   * dia). Duas linhas podem estar salvando ao mesmo tempo; se a de trás
   * terminasse e trouxesse props novas, a troca integral da lista apagaria da
   * tela a edição da linha da frente, que ainda nem tinha chegado ao banco —
   * e o resultado seria a tela mostrando o valor velho de uma mudança que
   * gravou. Enquanto houver linha salvando, quem manda é o estado local; a
   * reconciliação acontece quando a última terminar (`salvando` está nas
   * dependências, então o efeito roda de novo sozinho).
   */
  const assinaturaDoServidor = JSON.stringify(fotosIniciais);
  const [ultimaAssinatura, setUltimaAssinatura] = useState(assinaturaDoServidor);
  useEffect(() => {
    if (salvando.size > 0) return;
    if (assinaturaDoServidor === ultimaAssinatura) return;
    setUltimaAssinatura(assinaturaDoServidor);
    setFotos(fotosIniciais);
  }, [assinaturaDoServidor, ultimaAssinatura, fotosIniciais, salvando]);


  // Estado do formulário de adicionar.
  const [novaUrl, setNovaUrl] = useState("");
  const [novaVarianteId, setNovaVarianteId] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  const grupos = Array.from(new Set(disponiveis.map((d) => d.grupo)));

  async function aplicar(foto: FotoDoProduto, mudanca: Partial<FotoDoProduto>) {
    const atualizada = { ...foto, ...mudanca };
    // Otimista: a tela responde na hora e volta atrás se o servidor recusar —
    // mesmo padrão do MidiaManager e do FaqManager.
    setFotos((atuais) => atuais.map((f) => (f.id === foto.id ? atualizada : f)));
    setSalvando((atuais) => new Set(atuais).add(foto.id));
    setErro(null);

    const resultado = await salvarFotoProduto({
      id: atualizada.id,
      productId,
      url: atualizada.url,
      altText: atualizada.altText || null,
      variantId: atualizada.variantId,
      sortOrder: atualizada.sortOrder,
      isPrimary: atualizada.isPrimary,
    });
    setSalvando((atuais) => {
      const proximo = new Set(atuais);
      proximo.delete(foto.id);
      return proximo;
    });

    if ("error" in resultado) {
      // Desfaz só ESTA linha — as outras podem ter mudado nesse meio-tempo.
      setFotos((atuais) => atuais.map((f) => (f.id === foto.id ? foto : f)));
      setErro(resultado.error);
      // Traz de volta o que o banco tem: se a recusa veio de algo que a tela
      // não sabia (a foto já ter sido apagada em outra aba, por exemplo),
      // continuar mostrando o palpite local seria mentir.
      router.refresh();
      return;
    }

    // Principal é uma só — o servidor desmarca as outras, e a tela acompanha.
    if (atualizada.isPrimary) {
      setFotos((atuais) =>
        atuais.map((f) => (f.id === atualizada.id ? f : { ...f, isPrimary: false }))
      );
    }
    setAviso("Foto salva.");
    router.refresh();
  }

  async function adicionar() {
    const url = novaUrl.trim();
    if (!url) {
      setErro("Escolha uma foto da biblioteca ou cole o endereço dela.");
      return;
    }
    setAdicionando(true);
    setErro(null);

    const resultado = await salvarFotoProduto({
      productId,
      url,
      altText: null,
      variantId: novaVarianteId || null,
      // Entra no fim da fila; a ordem é editável logo abaixo.
      sortOrder: fotos.length,
      // Nunca nasce principal: trocar a foto de capa da vitrine é uma decisão,
      // não um efeito colateral de adicionar uma foto de cor.
      isPrimary: false,
    });
    setAdicionando(false);

    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }

    setFotos((atuais) => [
      ...atuais,
      {
        id: resultado.id,
        url,
        altText: "",
        variantId: novaVarianteId || null,
        sortOrder: atuais.length,
        isPrimary: false,
        // Mesma dedução do servidor, para a miniatura já nascer certa.
        tipo: tipoDeMidiaPelaUrl(url),
      },
    ]);
    setNovaUrl("");
    setNovaVarianteId("");
    setAviso("Foto adicionada.");
    router.refresh();
  }

  async function confirmarExclusao() {
    if (!confirmando) return;
    const alvo = confirmando;
    setConfirmando(null);
    setErro(null);

    const resultado = await excluirFotoProduto(alvo.id, productId);
    if ("error" in resultado) {
      setErro(resultado.error);
      /**
       * Nem toda recusa aqui significa "a foto continua lá": a exclusão que
       * apaga a foto e falha em promover a próxima principal também volta como
       * erro. Em vez de adivinhar qual dos dois foi, a tela pede a verdade do
       * servidor — a reconciliação lá em cima acerta a lista sozinha.
       */
      router.refresh();
      return;
    }
    setFotos((atuais) => atuais.filter((f) => f.id !== alvo.id));
    setAviso("Foto excluída.");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 border-t border-sand pt-8">
      <div>
        <h2 className="font-display text-xl text-ink">Fotos do produto</h2>
        <p className="text-sm text-ink/70">
          A foto marcada como <strong>principal</strong> é a que abre a página e aparece na vitrine.
          Ao dizer <strong>de que cor</strong> uma foto é, ela passa a aparecer sozinha na foto
          grande quando o cliente clicar naquela cor — sem isso o site mostra a foto da cartela, que
          acerta a cor mas não é uma foto deste modelo. Para enviar uma foto nova, use a{" "}
          <a href="/admin/midia" className="underline decoration-gold underline-offset-4">
            Biblioteca de fotos
          </a>
          .
        </p>
      </div>

      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {aviso ? <Toast message={aviso} variant="success" onClose={() => setAviso(null)} /> : null}

      {variantes.length === 0 ? (
        <p className="rounded-md border border-sand bg-sand/30 px-4 py-3 text-sm text-ink/70">
          Este produto ainda não tem variante cadastrada, então não há cor para amarrar às fotos.
          Salve as variantes acima primeiro.
        </p>
      ) : null}

      {fotos.length === 0 ? (
        <p className="text-sm text-ink/60">Nenhuma foto cadastrada para este produto.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {fotos.map((foto) => (
            <li
              key={foto.id}
              className="flex flex-col gap-3 rounded-md border border-sand p-3 sm:flex-row sm:items-center"
            >
              {foto.tipo === "video" ? (
                <video src={foto.url} className="h-20 w-20 shrink-0 rounded object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a URL pode
                // ser do bucket do Supabase, domínio não cadastrado em
                // next.config.js; mesma decisão do MidiaManager.
                <img src={foto.url} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="truncate text-xs text-ink/60" title={foto.url}>
                  {foto.url}
                </span>

                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-sm text-ink">
                    De que cor é esta foto
                    <select
                      value={foto.variantId ?? ""}
                      onChange={(e) => aplicar(foto, { variantId: e.target.value || null })}
                      disabled={salvando.has(foto.id)}
                      className="rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink"
                    >
                      <option value="">Foto geral do produto (serve para todas as cores)</option>
                      {variantes.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.rotulo}
                          {v.corAtiva ? "" : " (cor desativada — o cliente não vê)"}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex w-24 flex-col gap-1 text-sm text-ink">
                    Ordem
                    <input
                      type="number"
                      min={0}
                      defaultValue={foto.sortOrder}
                      onBlur={(e) => {
                        const valor = Number(e.target.value);
                        if (!Number.isFinite(valor) || valor === foto.sortOrder) return;
                        aplicar(foto, { sortOrder: Math.max(0, Math.trunc(valor)) });
                      }}
                      disabled={salvando.has(foto.id)}
                      className="rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink"
                    />
                  </label>

                  <label className="flex items-center gap-2 pb-2 text-sm text-ink">
                    <input
                      type="radio"
                      name="foto-principal"
                      checked={foto.isPrimary}
                      onChange={() => aplicar(foto, { isPrimary: true })}
                      disabled={salvando.has(foto.id)}
                    />
                    Principal
                  </label>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmando(foto)}
                    disabled={salvando.has(foto.id)}
                  >
                    Excluir
                  </Button>

                  {salvando.has(foto.id) ? (
                    <span className="pb-2 text-xs text-ink/60">salvando…</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmando ? (
        <div className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-ink">
            Tirar esta foto do produto? O arquivo continua na Biblioteca de fotos; some só a ligação
            com este produto.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={confirmarExclusao}>
              Sim, tirar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-md border border-sand bg-sand/20 p-4">
        <h3 className="text-sm font-semibold text-ink">Adicionar foto</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-ink">
            Foto
            <select
              value={novaUrl}
              onChange={(e) => setNovaUrl(e.target.value)}
              className="rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink"
            >
              <option value="">Escolha uma foto…</option>
              {grupos.map((grupo) => (
                <optgroup key={grupo} label={grupo}>
                  {disponiveis
                    .filter((d) => d.grupo === grupo)
                    .map((d) => (
                      <option key={d.url} value={d.url}>
                        {d.rotulo}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-ink">
            …ou cole o endereço da foto
            <input
              type="text"
              value={novaUrl}
              onChange={(e) => setNovaUrl(e.target.value)}
              placeholder="/media/produtos/minha-foto.jpg"
              title="Um caminho do próprio site (começando com /) ou o endereço de uma foto da Biblioteca de fotos."
              className="rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="flex min-w-64 flex-col gap-1 text-sm text-ink">
            De que cor é
            <select
              value={novaVarianteId}
              onChange={(e) => setNovaVarianteId(e.target.value)}
              className="rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink"
            >
              <option value="">Foto geral do produto (serve para todas as cores)</option>
              {variantes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.rotulo}
                  {v.corAtiva ? "" : " (cor desativada — o cliente não vê)"}
                </option>
              ))}
            </select>
          </label>

          <Button type="button" size="sm" onClick={adicionar} disabled={adicionando}>
            {adicionando ? "Adicionando…" : "Adicionar"}
          </Button>
        </div>
        {novaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- conferência
          // visual antes de gravar; mesma decisão das miniaturas acima.
          <img src={novaUrl} alt="" className="h-24 w-24 rounded object-cover" />
        ) : null}
      </div>
    </section>
  );
}
