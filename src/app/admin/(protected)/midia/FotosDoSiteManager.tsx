"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { FotoDoRepositorio } from "@/lib/conteudo/fotos-do-repositorio";
import { adicionarFotoDoSite, excluirFotoDoSite, migrarFotosQueVieramComOSite, substituirFotoDoSite } from "./actions";

export type FotoGerenciavel = {
  id: string; source_path: string | null; storage_path: string; url: string;
  nome: string; tamanho: number; tipo: string; ativo: boolean;
};

export function FotosDoSiteManager({ originais, fotosIniciais }: { originais: FotoDoRepositorio[]; fotosIniciais: FotoGerenciavel[] }) {
  const router = useRouter();
  const adicionarRef = useRef<HTMLInputElement>(null);
  const substituirRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState(fotosIniciais.filter((foto) => foto.ativo));
  const [substituir, setSubstituir] = useState<FotoGerenciavel | null>(null);
  const [confirmando, setConfirmando] = useState<FotoGerenciavel | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  useEffect(() => { setFotos(fotosIniciais.filter((foto) => foto.ativo)); }, [fotosIniciais]);
  const porOrigem = new Map(fotos.filter((foto) => foto.source_path).map((foto) => [foto.source_path!, foto]));
  const pendentes = originais.filter((foto) => !porOrigem.has(foto.caminho));

  async function preparar() {
    setOcupado(true); setErro(null);
    const resultado = await migrarFotosQueVieramComOSite();
    setOcupado(false);
    if ("error" in resultado) setErro(resultado.error);
    else { setSucesso("Fotos atuais migradas. Agora você pode adicionar, substituir ou excluir sem deploy."); router.refresh(); }
  }
  async function arquivoNovo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]; e.target.value = "";
    if (!arquivo) return;
    setOcupado(true); setErro(null);
    const fd = new FormData(); fd.set("arquivo", arquivo);
    const fotoParaSubstituir = substituir;
    const resultado = fotoParaSubstituir ? await substituirFotoDoSite(fotoParaSubstituir.id, fd) : await adicionarFotoDoSite(fd);
    setOcupado(false); setSubstituir(null);
    if ("error" in resultado) setErro(resultado.error);
    else { setSucesso(fotoParaSubstituir ? "Foto substituída." : "Foto adicionada à biblioteca."); router.refresh(); }
  }
  async function excluir() {
    if (!confirmando) return;
    setOcupado(true); setErro(null);
    const resultado = await excluirFotoDoSite(confirmando.id);
    setOcupado(false);
    if ("error" in resultado) setErro(resultado.error);
    else { setFotos((atuais) => atuais.filter((foto) => foto.id !== confirmando.id)); setSucesso("Foto excluída e removida das páginas que a utilizavam."); }
    setConfirmando(null);
  }
  function escolherSubstituicao(foto: FotoGerenciavel) { setSubstituir(foto); substituirRef.current?.click(); }

  return <section className="flex flex-col gap-4">
    <div>
      <h2 className="font-display text-xl text-ink">Fotos do site</h2>
      <p className="text-sm text-ink/70">Esta é a biblioteca que aparece no site. As fotos atuais são copiadas para o armazenamento do painel uma única vez; depois disso, qualquer alteração entra no ar sem deploy.</p>
    </div>
    {erro && <Toast message={erro} variant="error" onClose={() => setErro(null)} />}
    {sucesso && <Toast message={sucesso} variant="success" onClose={() => setSucesso(null)} />}
    <input ref={adicionarRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={arquivoNovo} disabled={ocupado} />
    <input ref={substituirRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={arquivoNovo} disabled={ocupado} />
    <div className="flex flex-wrap gap-2">
      {pendentes.length > 0 && <Button type="button" variant="secondary" onClick={preparar} disabled={ocupado}>{ocupado ? "Preparando…" : `Migrar ${pendentes.length} fotos atuais`}</Button>}
      <Button type="button" size="lg" onClick={() => adicionarRef.current?.click()} disabled={ocupado}>{ocupado ? "Enviando…" : "Adicionar foto"}</Button>
    </div>
    {pendentes.length > 0 && <p className="text-xs text-ink/60">As fotos abaixo ainda são as cópias originais do deploy. Clique em “Migrar” uma vez para habilitar a gestão completa delas.</p>}
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {pendentes.map((foto) => <figure key={foto.caminho} className="flex flex-col gap-2 rounded-md border border-sand p-2 opacity-80">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={foto.caminho} alt={foto.caminho} className="aspect-square w-full rounded object-cover" />
        <figcaption className="truncate text-xs text-ink" title={foto.caminho}>{foto.caminho.split("/").pop()}</figcaption>
        <span className="text-xs text-ink/60">Pronta para migrar</span>
        <Button type="button" variant="secondary" size="sm" onClick={preparar} disabled={ocupado}>Gerenciar</Button>
      </figure>)}
      {fotos.map((foto) => <figure key={foto.id} className="flex flex-col gap-2 rounded-md border border-sand p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={foto.url} alt={foto.nome} className="aspect-square w-full rounded object-cover" />
        <figcaption className="truncate text-xs text-ink" title={foto.nome}>{foto.nome}</figcaption>
        <span className="truncate text-xs text-ink/60">{foto.source_path ?? "Foto adicionada"}</span>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => escolherSubstituicao(foto)} disabled={ocupado}>Substituir</Button><Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(foto)} disabled={ocupado}>Excluir</Button></div>
      </figure>)}
    </div>
    {confirmando && <div className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-4"><p className="text-sm text-ink">Tem certeza que deseja excluir esta foto? Ela deixará de aparecer no site.</p><div className="flex gap-2"><Button type="button" variant="secondary" size="sm" onClick={excluir} disabled={ocupado}>{ocupado ? "Excluindo…" : "Sim, excluir"}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(null)} disabled={ocupado}>Cancelar</Button></div></div>}
  </section>;
}
