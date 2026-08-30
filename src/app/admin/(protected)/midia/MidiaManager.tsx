"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { formatarBytes, tipoAceito, TAMANHO_MAXIMO_BYTES } from "@/lib/conteudo/midia";
import { formatarDataHora } from "@/lib/format/date";
import { enviarImagem, excluirImagem } from "./actions";

export interface FotoEnviada {
  caminho: string;
  nome: string;
  tamanho: number;
  criadoEm: string;
  tipo: string;
  url: string;
}

// Manager da aba "Fotos enviadas pelo painel" — a metade EDITÁVEL da
// Biblioteca de Fotos. Mesmo padrão de estado local otimista dos outros
// Managers deste admin (ver FaqManager.tsx): a lista some/aparece na hora,
// sem esperar um recarregamento da página inteira, porque quem está do
// outro lado é o Francisco fazendo upload de foto de produto, uma atrás da
// outra — esperar um round-trip de navegação a cada foto seria tedioso.
export function MidiaManager({ fotosIniciais }: { fotosIniciais: FotoEnviada[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<FotoEnviada[]>(fotosIniciais);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<FotoEnviada | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    // Limpa o input já aqui — sem isso, escolher o MESMO arquivo duas vezes
    // seguidas (ex.: depois de corrigir e tentar de novo) não dispara onChange.
    e.target.value = "";
    if (!arquivo) return;

    setErro(null);
    setSucesso(null);

    // Validação client-side é só conforto (resposta na hora, sem gastar a
    // viagem ao servidor num erro óbvio) — quem decide de verdade é
    // enviarImagem, no servidor, que roda mesmo se alguém pular esta tela.
    if (!tipoAceito(arquivo.type)) {
      setErro("Formato não aceito. Envie uma foto em JPG, PNG, WEBP, AVIF ou um vídeo MP4.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      setErro("O arquivo é grande demais. O tamanho máximo é 10 MB.");
      return;
    }

    setEnviando(true);
    const formData = new FormData();
    formData.set("arquivo", arquivo);
    const resultado = await enviarImagem(formData);
    setEnviando(false);

    if ("error" in resultado) {
      setErro(resultado.error);
      return;
    }

    setFotos((atuais) => [
      {
        caminho: resultado.caminho,
        nome: arquivo.name,
        tamanho: arquivo.size,
        criadoEm: new Date().toISOString(),
        tipo: arquivo.type,
        url: resultado.url,
      },
      ...atuais,
    ]);
    setSucesso("Foto enviada. A URL já está pronta para colar em um produto ou banner.");
    router.refresh();
  }

  async function copiarUrl(foto: FotoEnviada) {
    try {
      await navigator.clipboard.writeText(foto.url);
      setCopiado(foto.caminho);
      setTimeout(() => setCopiado((atual) => (atual === foto.caminho ? null : atual)), 2000);
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione e copie a URL manualmente.");
    }
  }

  async function confirmarExclusao() {
    if (!confirmando) return;
    setExcluindo(true);
    const resultado = await excluirImagem(confirmando.caminho);
    setExcluindo(false);

    if ("error" in resultado) {
      setErro(resultado.error);
      setConfirmando(null);
      return;
    }

    setFotos((atuais) => atuais.filter((f) => f.caminho !== confirmando.caminho));
    setSucesso("Foto excluída.");
    setConfirmando(null);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl text-ink">Fotos enviadas pelo painel</h2>
        <p className="text-sm text-ink/70">
          Envie uma foto aqui e copie a URL dela para usar no cadastro de um produto ou de um banner.
        </p>
      </div>

      {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
      {sucesso ? <Toast message={sucesso} variant="success" onClose={() => setSucesso(null)} /> : null}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,video/mp4"
          className="hidden"
          onChange={aoEscolherArquivo}
          disabled={enviando}
        />
        <Button type="button" size="lg" onClick={() => inputRef.current?.click()} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar foto"}
        </Button>
      </div>

      {fotos.length === 0 ? (
        <p className="text-sm text-ink/60">Nenhuma foto enviada pelo painel ainda.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {fotos.map((foto) => (
            <figure key={foto.caminho} className="flex flex-col gap-2 rounded-md border border-sand p-2">
              {foto.tipo.startsWith("video/") ? (
                <video src={foto.url} className="aspect-square w-full rounded object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- URL pública
                // do bucket "site-media" (domínio do projeto Supabase); usar
                // next/image exigiria cadastrar esse domínio em next.config.js,
                // fora do escopo desta entrega (mesma decisão de ColorHelpTab.tsx).
                <img src={foto.url} alt={foto.nome} className="aspect-square w-full rounded object-cover" />
              )}
              <figcaption className="truncate text-xs text-ink" title={foto.nome}>
                {foto.nome}
              </figcaption>
              <span className="text-xs text-ink/60">
                {formatarBytes(foto.tamanho)} · {formatarDataHora(foto.criadoEm)}
              </span>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => copiarUrl(foto)}>
                  {copiado === foto.caminho ? "URL copiada!" : "Copiar URL"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(foto)}>
                  Excluir
                </Button>
              </div>
            </figure>
          ))}
        </div>
      )}

      {confirmando ? (
        <div className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-ink">
            Excluir a foto <strong>{confirmando.nome}</strong>? Isso não pode ser desfeito.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={confirmarExclusao} disabled={excluindo}>
              {excluindo ? "Excluindo…" : "Sim, excluir"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(null)} disabled={excluindo}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
