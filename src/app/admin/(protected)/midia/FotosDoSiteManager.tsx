"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import type { FotoDoRepositorio } from "@/lib/conteudo/fotos-do-repositorio";
import { adicionarFotoDoSite, excluirFotoDoSite, migrarFotosQueVieramComOSite, substituirFotoDoSite } from "./actions";

export type FotoGerenciavel = { id: string; source_path: string | null; storage_path: string; url: string; nome: string; tamanho: number; tipo: string; categoria: string; ativo: boolean; usos?: string[] };

const CATEGORIAS_PADRAO = ["Geral", "Página inicial", "Produtos", "Cores", "Bases", "Marca"];
const eVideo = (midia: FotoGerenciavel) => midia.tipo.startsWith("video/");

/** Biblioteca única: arquivo, prévia, organização e o lugar onde ele aparece. */
export function FotosDoSiteManager({ originais, fotosIniciais }: { originais: FotoDoRepositorio[]; fotosIniciais: FotoGerenciavel[] }) {
  const router = useRouter();
  const adicionarRef = useRef<HTMLInputElement>(null);
  const substituirRef = useRef<HTMLInputElement>(null);
  const [midias, setMidias] = useState(fotosIniciais.filter((m) => m.ativo));
  const [substituir, setSubstituir] = useState<FotoGerenciavel | null>(null);
  const [confirmando, setConfirmando] = useState<FotoGerenciavel | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [categoria, setCategoria] = useState("Geral");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "foto" | "video">("todos");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => setMidias(fotosIniciais.filter((m) => m.ativo)), [fotosIniciais]);
  useEffect(() => {
    if (!arquivo) { setPrevia(null); return; }
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);
  const porOrigem = new Map(midias.filter((m) => m.source_path).map((m) => [m.source_path!, m]));
  const pendentes = originais.filter((foto) => !porOrigem.has(foto.caminho));
  const categorias = [...new Set([...CATEGORIAS_PADRAO, ...midias.map((m) => m.categoria || "Geral")])];
  const filtradas = useMemo(() => midias.filter((m) => {
    const texto = `${m.nome} ${m.categoria} ${(m.usos ?? []).join(" ")}`.toLocaleLowerCase("pt-BR");
    return (filtro === "todos" || (filtro === "video" ? eVideo(m) : !eVideo(m))) && texto.includes(busca.toLocaleLowerCase("pt-BR"));
  }), [midias, busca, filtro]);

  async function preparar() { setOcupado(true); setErro(null); const resultado = await migrarFotosQueVieramComOSite(); setOcupado(false); if ("error" in resultado) setErro(resultado.error); else { setSucesso("Mídias atuais migradas. Agora você pode administrar sem deploy."); router.refresh(); } }
  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) { const novo = e.target.files?.[0] ?? null; e.target.value = ""; setArquivo(novo); setErro(null); }
  async function salvarArquivo() { if (!arquivo) return; setOcupado(true); setErro(null); const fd = new FormData(); fd.set("arquivo", arquivo); fd.set("categoria", categoria); const alvo = substituir; const resultado = alvo ? await substituirFotoDoSite(alvo.id, fd) : await adicionarFotoDoSite(fd); setOcupado(false); if ("error" in resultado) { setErro(resultado.error); return; } setArquivo(null); setSubstituir(null); setSucesso(alvo ? "Mídia substituída e atualizada onde estava sendo usada." : "Mídia adicionada à biblioteca."); router.refresh(); }
  async function excluir() { if (!confirmando) return; setOcupado(true); setErro(null); const resultado = await excluirFotoDoSite(confirmando.id); setOcupado(false); if ("error" in resultado) setErro(resultado.error); else { setMidias((itens) => itens.filter((m) => m.id !== confirmando.id)); setSucesso("Mídia excluída."); } setConfirmando(null); }
  function iniciarSubstituicao(midia: FotoGerenciavel) { setSubstituir(midia); setArquivo(null); setCategoria(midia.categoria || "Geral"); substituirRef.current?.click(); }

  return <section className="flex flex-col gap-5">
    {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}
    {sucesso ? <Toast message={sucesso} variant="success" onClose={() => setSucesso(null)} /> : null}
    <div className="rounded-lg border border-sand p-4"><h2 className="font-display text-xl text-ink">Adicionar à biblioteca</h2><p className="mt-1 text-sm text-ink/70">Envie uma foto ou vídeo e organize-o antes de colocá-lo em uma seção ou produto.</p><input ref={adicionarRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4" onChange={escolherArquivo} disabled={ocupado} /><input ref={substituirRef} className="hidden" type="file" accept={substituir && eVideo(substituir) ? "video/mp4" : "image/jpeg,image/png,image/webp,image/avif"} onChange={escolherArquivo} disabled={ocupado} /><div className="mt-3 flex flex-wrap items-end gap-3"><Button type="button" onClick={() => { setSubstituir(null); setArquivo(null); adicionarRef.current?.click(); }} disabled={ocupado}>Adicionar foto ou vídeo</Button><label className="flex flex-col gap-1 text-sm text-ink">Categoria<select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="min-h-toque rounded border border-sand bg-paper px-2">{categorias.map((item) => <option key={item}>{item}</option>)}</select></label></div>{arquivo && previa ? <div className="mt-4 flex flex-wrap items-end gap-3 rounded-md bg-sand/50 p-3"><div><p className="mb-1 text-sm font-medium text-ink">Prévia antes de salvar</p>{arquivo.type.startsWith("video/") ? <video src={previa} controls className="h-36 w-56 rounded bg-ink object-contain" /> : <img src={previa} alt="Prévia da nova mídia" className="h-36 w-56 rounded bg-paper object-contain" />}</div><div className="flex flex-col gap-2"><span className="text-sm text-ink/70">{substituir ? `Substituir: ${substituir.nome}` : arquivo.name}</span><Button type="button" onClick={salvarArquivo} disabled={ocupado}>{ocupado ? "Salvando…" : substituir ? "Confirmar substituição" : "Adicionar à biblioteca"}</Button><Button type="button" variant="ghost" onClick={() => { setArquivo(null); setSubstituir(null); }}>Cancelar</Button></div></div> : null}</div>
    {pendentes.length > 0 ? <div className="rounded-lg border border-gold/50 bg-gold/5 p-4"><p className="text-sm text-ink">Há {pendentes.length} fotos originais do site que ainda não entraram na biblioteca. Elas continuam no ar; migre uma vez para poder organizá-las e substituí-las.</p><Button className="mt-3" type="button" variant="secondary" onClick={preparar} disabled={ocupado}>{ocupado ? "Migrando…" : "Trazer fotos atuais para a biblioteca"}</Button></div> : null}
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-xl text-ink">Arquivos do site</h2><p className="text-sm text-ink/60">Veja a prévia e os vínculos antes de editar ou excluir.</p></div><div className="flex flex-wrap gap-2"><input aria-label="Buscar mídia" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou uso" className="min-h-toque rounded border border-sand bg-paper px-3 text-sm" />{(["todos", "foto", "video"] as const).map((item) => <Button key={item} type="button" size="sm" variant={filtro === item ? "primary" : "ghost"} onClick={() => setFiltro(item)}>{item === "todos" ? "Todos" : item === "foto" ? "📷 Fotos" : "🎥 Vídeos"}</Button>)}</div></div>
    {filtradas.length === 0 ? <p className="text-sm text-ink/60">Nenhuma mídia encontrada.</p> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtradas.map((midia) => <li key={midia.id} className="flex flex-col gap-3 rounded-lg border border-sand p-3"><div className="aspect-video overflow-hidden rounded bg-sand">{eVideo(midia) ? <video src={midia.url} controls preload="metadata" className="h-full w-full object-contain" /> : <img src={midia.url} alt={midia.nome} className="h-full w-full object-cover" />}</div><div><p className="truncate font-medium text-ink" title={midia.nome}>{midia.nome}</p><p className="text-xs text-ink/60">{eVideo(midia) ? "Vídeo" : "Foto"} · {midia.categoria || "Geral"}</p></div><div><p className="text-xs font-medium text-ink/70">Onde aparece</p>{midia.usos?.length ? <ul className="mt-1 flex flex-col gap-1">{midia.usos.map((uso) => <li key={uso} className="text-xs text-ink/60">• {uso}</li>)}</ul> : <p className="mt-1 text-xs text-ink/50">Ainda não está vinculada a uma seção.</p>}</div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => iniciarSubstituicao(midia)} disabled={ocupado}>Substituir</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(midia)} disabled={ocupado}>Excluir</Button></div></li>)}</ul>}
    {confirmando ? <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4"><p className="text-sm text-ink">Tem certeza que deseja excluir esta mídia?{confirmando.usos?.length ? " Ela será removida dos locais abaixo; onde houver conteúdo original, ele voltará a aparecer." : ""}</p>{confirmando.usos?.length ? <ul className="text-sm text-ink/70">{confirmando.usos.map((uso) => <li key={uso}>• {uso}</li>)}</ul> : null}<div className="flex gap-2"><Button type="button" variant="secondary" size="sm" onClick={excluir} disabled={ocupado}>{ocupado ? "Excluindo…" : "Sim, excluir"}</Button><Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(null)} disabled={ocupado}>Cancelar</Button></div></div> : null}
  </section>;
}
