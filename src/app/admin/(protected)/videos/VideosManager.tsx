"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { trocarVideo, restaurarOriginal } from "./actions";

export interface VideoItemView {
  chave: string;
  rotulo: string;
  /** Nome da página em português — só para o cartão dizer onde o vídeo mora. */
  pagina: string;
  /** O caminho versionado em public/ que volta ao restaurar. */
  padrao: string;
  /** O que está no site hoje: edição do banco, ou o próprio padrão. */
  valorAtual: string;
  editado: boolean;
  updatedBy: string | null;
}

export function VideosManager({
  itens,
  somenteLeitura,
}: {
  itens: VideoItemView[];
  somenteLeitura: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {itens.map((item) => (
        <ItemVideo key={item.chave} item={item} somenteLeitura={somenteLeitura} />
      ))}
    </div>
  );
}

/**
 * O cartão de um vídeo do site — mesmo desenho de ItemImagem
 * (textos/TextosManager.tsx): escolher do computador, subir, e só então
 * existe um valor para gravar. NÃO EXISTE CAMPO PARA DIGITAR O ENDEREÇO,
 * pelo mesmo motivo de lá: endereço errado não deixa o vídeo quebrado,
 * deixa a PÁGINA quebrada.
 */
function ItemVideo({ item, somenteLeitura }: { item: VideoItemView; somenteLeitura: boolean }) {
  const router = useRouter();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  async function enviar() {
    if (!arquivo) {
      setErro("Escolha um vídeo antes de enviar.");
      return;
    }
    setErro(null);
    setSucesso(false);
    setEnviando(true);
    const dados = new FormData();
    dados.append("arquivo", arquivo);
    const resultado = await trocarVideo(item.chave, dados);
    setEnviando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    setArquivo(null);
    if (inputArquivo.current) inputArquivo.current.value = "";
    setSucesso(true);
    router.refresh();
  }

  async function restaurar() {
    const confirmou = window.confirm(
      `Voltar "${item.rotulo}" ao vídeo original do site? O vídeo enviado aqui deixa de aparecer.`
    );
    if (!confirmou) return;
    setErro(null);
    setRestaurando(true);
    const resultado = await restaurarOriginal(item.chave);
    setRestaurando(false);
    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-md border p-4 ${
        item.editado ? "border-gold bg-gold/5" : "border-sand"
      }`}
    >
      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? (
        <Toast message="Vídeo trocado." variant="success" onClose={() => setSucesso(false)} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{item.rotulo}</p>
        <span className="text-xs text-ink/40">
          {item.pagina} · {item.chave}
        </span>
      </div>

      <span
        className={`w-fit rounded-full px-2 py-0.5 text-xs ${
          item.editado ? "bg-gold/20 text-ink" : "bg-sand text-ink/60"
        }`}
      >
        {item.editado ? `Trocado${item.updatedBy ? ` por ${item.updatedBy}` : ""}` : "Vídeo original"}
      </span>

      <figure className="flex flex-col gap-1">
        <span className="text-xs text-ink/60">No site agora</span>
        <video
          src={item.valorAtual}
          controls
          muted
          className="h-40 w-full max-w-xs rounded border border-sand bg-ink object-contain sm:w-64"
        />
      </figure>

      {somenteLeitura ? null : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Trocar por um vídeo do computador
            <input
              ref={inputArquivo}
              type="file"
              accept="video/mp4"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                setErro(null);
                setSucesso(false);
              }}
              className="min-h-toque rounded-md border border-sand bg-paper px-3 py-2 text-ink"
            />
          </label>
          <p className="text-xs text-ink/50">MP4, até 25 MB. O vídeo novo entra no site em instantes.</p>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={enviar} disabled={enviando || !arquivo}>
              {enviando ? "Enviando…" : "Enviar e trocar"}
            </Button>
            {item.editado ? (
              <Button type="button" variant="ghost" size="sm" onClick={restaurar} disabled={restaurando}>
                {restaurando ? "Restaurando…" : "Voltar ao vídeo original"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
