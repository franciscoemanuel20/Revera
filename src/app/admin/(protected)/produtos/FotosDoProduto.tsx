"use client";

import { ChangeEvent, DragEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { tipoDeMidiaPelaUrl } from "@/lib/conteudo/midia";
import { enviarMidiaProduto, excluirFotoProduto, salvarFotoProduto } from "./fotos-actions";

export interface FotoDoProduto { id: string; url: string; altText: string; variantId: string | null; sortOrder: number; isPrimary: boolean; tipo: "image" | "video"; }
export interface VarianteParaFoto { id: string; rotulo: string; corAtiva: boolean; }
export interface FotoDisponivel { url: string; rotulo: string; grupo: string; }
interface Props { productId: string; fotosIniciais: FotoDoProduto[]; variantes: VarianteParaFoto[]; disponiveis: FotoDisponivel[]; }

/** Mídias ficam fora do formulário de preço: cada mudança é salva isoladamente. */
export function FotosDoProduto({ productId, fotosIniciais, variantes, disponiveis }: Props) {
  const router = useRouter();
  const [midias, setMidias] = useState(fotosIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set());
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [escolhidaPorGrupo, setEscolhidaPorGrupo] = useState<Record<string, string>>({});

  useEffect(() => { if (ocupados.size === 0) setMidias(fotosIniciais); }, [fotosIniciais, ocupados.size]);
  function ocupar(id: string, valor: boolean) { setOcupados((antes) => { const depois = new Set(antes); valor ? depois.add(id) : depois.delete(id); return depois; }); }
  function proximaOrdem(variantId: string | null, tipo: "image" | "video") { return midias.filter((m) => m.variantId === variantId && m.tipo === tipo).length; }

  async function salvar(midia: FotoDoProduto, alteracao: Partial<FotoDoProduto>) {
    const proxima = { ...midia, ...alteracao };
    setMidias((antes) => antes.map((item) => item.id === midia.id ? proxima : item));
    ocupar(midia.id, true); setErro(null);
    const resultado = await salvarFotoProduto({ id: proxima.id, productId, url: proxima.url, altText: proxima.altText || null, variantId: proxima.variantId, sortOrder: proxima.sortOrder, isPrimary: proxima.isPrimary });
    ocupar(midia.id, false);
    if ("error" in resultado) { setMidias((antes) => antes.map((item) => item.id === midia.id ? midia : item)); setErro(resultado.error); router.refresh(); return false; }
    if (proxima.isPrimary) setMidias((antes) => antes.map((item) => item.id === proxima.id || item.tipo !== "image" || item.variantId !== proxima.variantId ? item : { ...item, isPrimary: false }));
    router.refresh(); return true;
  }

  async function adicionarArquivo(variantId: string | null, event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0]; event.target.value = ""; if (!arquivo) return;
    const chave = `novo-${variantId ?? "geral"}`; ocupar(chave, true); setErro(null);
    const dados = new FormData(); dados.set("arquivo", arquivo); const envio = await enviarMidiaProduto(dados);
    if ("error" in envio) { ocupar(chave, false); setErro(envio.error); return; }
    const tipo = tipoDeMidiaPelaUrl(envio.url); const ordem = proximaOrdem(variantId, tipo);
    const resultado = await salvarFotoProduto({ productId, url: envio.url, altText: null, variantId, sortOrder: ordem, isPrimary: false });
    ocupar(chave, false);
    if ("error" in resultado) { setErro(resultado.error); return; }
    setMidias((antes) => [...antes, { id: resultado.id, url: envio.url, altText: "", variantId, sortOrder: ordem, isPrimary: tipo === "image" && !antes.some((m) => m.variantId === variantId && m.tipo === "image"), tipo }]);
    setAviso(tipo === "video" ? "Vídeo adicionado." : "Foto adicionada."); router.refresh();
  }

  async function adicionarDaBiblioteca(variantId: string | null) {
    const chave = `novo-${variantId ?? "geral"}`;
    const url = escolhidaPorGrupo[chave];
    if (!url) return;
    const tipo = tipoDeMidiaPelaUrl(url);
    ocupar(chave, true); setErro(null);
    const ordem = proximaOrdem(variantId, tipo);
    const resultado = await salvarFotoProduto({ productId, url, altText: null, variantId, sortOrder: ordem, isPrimary: false });
    ocupar(chave, false);
    if ("error" in resultado) { setErro(resultado.error); return; }
    setMidias((antes) => [...antes, { id: resultado.id, url, altText: "", variantId, sortOrder: ordem, isPrimary: tipo === "image" && !antes.some((m) => m.variantId === variantId && m.tipo === "image"), tipo }]);
    setEscolhidaPorGrupo((antes) => ({ ...antes, [chave]: "" })); setAviso("Mídia da Biblioteca adicionada ao produto."); router.refresh();
  }

  async function substituir(midia: FotoDoProduto, event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0]; event.target.value = ""; if (!arquivo) return;
    if (tipoDeMidiaPelaUrl(arquivo.name) !== midia.tipo) { setErro(midia.tipo === "image" ? "Escolha uma foto para substituir esta foto." : "Escolha um vídeo para substituir este vídeo."); return; }
    ocupar(midia.id, true); const dados = new FormData(); dados.set("arquivo", arquivo); const envio = await enviarMidiaProduto(dados); ocupar(midia.id, false);
    if ("error" in envio) { setErro(envio.error); return; }
    await salvar(midia, { url: envio.url }); setAviso(midia.tipo === "video" ? "Vídeo substituído." : "Foto substituída.");
  }

  async function excluir(midia: FotoDoProduto) {
    if (!window.confirm(`Excluir este ${midia.tipo === "video" ? "vídeo" : "foto"} da variante? O arquivo continua na biblioteca.`)) return;
    ocupar(midia.id, true); const resultado = await excluirFotoProduto(midia.id, productId); ocupar(midia.id, false);
    if ("error" in resultado) { setErro(resultado.error); router.refresh(); return; }
    setMidias((antes) => antes.filter((item) => item.id !== midia.id)); setAviso("Mídia excluída."); router.refresh();
  }

  async function soltar(target: FotoDoProduto, event: DragEvent<HTMLLIElement>) {
    event.preventDefault(); const origem = midias.find((m) => m.id === arrastando); setArrastando(null);
    if (!origem || origem.id === target.id || origem.tipo !== "image" || origem.variantId !== target.variantId) return;
    const fotos = midias.filter((m) => m.variantId === target.variantId && m.tipo === "image").sort((a, b) => a.sortOrder - b.sortOrder);
    const semOrigem = fotos.filter((m) => m.id !== origem.id); const destino = semOrigem.findIndex((m) => m.id === target.id); const ordenadas = [...semOrigem.slice(0, destino), origem, ...semOrigem.slice(destino)];
    setMidias((antes) => antes.map((m) => { const posicao = ordenadas.findIndex((f) => f.id === m.id); return posicao >= 0 ? { ...m, sortOrder: posicao } : m; }));
    for (let i = 0; i < ordenadas.length; i += 1) await salvar(ordenadas[i]!, { sortOrder: i });
    setAviso("Ordem das fotos atualizada.");
  }

  const grupos = [{ id: null, rotulo: "Mídias gerais do produto", corAtiva: true }, ...variantes];
  return <section className="flex flex-col gap-5 border-t border-sand pt-8">
    <div><h2 className="font-display text-xl text-ink">Mídias por variante</h2><p className="text-sm text-ink/70">Cada cor possui fotos e vídeos próprios. Ao escolher uma cor, o cliente vê somente as mídias gerais e as daquela cor.</p></div>
    {erro ? <Toast message={erro} variant="error" onClose={() => setErro(null)} /> : null}{aviso ? <Toast message={aviso} variant="success" onClose={() => setAviso(null)} /> : null}
    {variantes.length === 0 ? <p className="rounded-md border border-sand bg-sand/30 px-4 py-3 text-sm text-ink/70">Salve ao menos uma variante antes de cadastrar mídias específicas.</p> : null}
    {grupos.map((grupo) => {
      const desteGrupo = midias.filter((m) => m.variantId === grupo.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
      const fotos = desteGrupo.filter((m) => m.tipo === "image"); const videos = desteGrupo.filter((m) => m.tipo === "video"); const chave = `novo-${grupo.id ?? "geral"}`;
      return <article key={grupo.id ?? "geral"} className="flex flex-col gap-4 rounded-lg border border-sand p-4">
        <div><h3 className="font-semibold text-ink">{grupo.rotulo}{!grupo.corAtiva ? " (desativada)" : ""}</h3><p className="text-sm text-ink/60">A foto principal abre em destaque quando esta variante for escolhida.</p></div>
        <Secao titulo="Fotos da variante" vazio="Nenhuma foto cadastrada."><ul className="grid gap-3 sm:grid-cols-2">{fotos.map((midia) => <li key={midia.id} draggable onDragStart={() => setArrastando(midia.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => soltar(midia, e)} className="flex gap-3 rounded-md border border-sand p-2"><Miniatura midia={midia} /><div className="flex min-w-0 flex-1 flex-col gap-2"><span className="text-xs text-ink/60">Arraste para reorganizar</span><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={midia.isPrimary ? "secondary" : "ghost"} onClick={() => salvar(midia, { isPrimary: true })} disabled={ocupados.has(midia.id)}>{midia.isPrimary ? "Principal" : "Definir principal"}</Button><Arquivo label="Substituir" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => substituir(midia, e)} /><Button type="button" size="sm" variant="ghost" onClick={() => excluir(midia)} disabled={ocupados.has(midia.id)}>Excluir</Button></div></div></li>)}</ul><Envio accept="image/jpeg,image/png,image/webp,image/avif" label="Adicionar fotos" ocupado={ocupados.has(chave)} onChange={(e) => adicionarArquivo(grupo.id, e)} /></Secao>
        <Secao titulo="Vídeos da variante" vazio="Nenhum vídeo cadastrado."><ul className="grid gap-3 sm:grid-cols-2">{videos.map((midia) => <li key={midia.id} className="flex gap-3 rounded-md border border-sand p-2"><Miniatura midia={midia} /><div className="flex flex-1 items-center gap-2"><Arquivo label="Substituir" accept="video/mp4" onChange={(e) => substituir(midia, e)} /><Button type="button" size="sm" variant="ghost" onClick={() => excluir(midia)} disabled={ocupados.has(midia.id)}>Excluir</Button></div></li>)}</ul><Envio accept="video/mp4" label="Adicionar vídeo" ocupado={ocupados.has(chave)} onChange={(e) => adicionarArquivo(grupo.id, e)} /></Secao>
        {disponiveis.length > 0 ? <div className="flex flex-wrap items-end gap-2 rounded bg-sand/40 p-3"><label className="flex min-w-56 flex-1 flex-col gap-1 text-sm text-ink">Adicionar da Biblioteca<select value={escolhidaPorGrupo[chave] ?? ""} onChange={(e) => setEscolhidaPorGrupo((antes) => ({ ...antes, [chave]: e.target.value }))} className="min-h-toque rounded border border-sand bg-paper px-2"><option value="">Escolha uma foto ou vídeo</option>{disponiveis.map((midia) => <option key={midia.url} value={midia.url}>{midia.grupo} — {midia.rotulo}</option>)}</select></label><Button type="button" size="sm" variant="secondary" onClick={() => adicionarDaBiblioteca(grupo.id)} disabled={ocupados.has(chave) || !escolhidaPorGrupo[chave]}>Adicionar esta mídia</Button></div> : null}
      </article>;
    })}
    {disponiveis.length > 0 ? <p className="text-xs text-ink/50">Os arquivos já enviados continuam na Biblioteca de fotos; esta tela envia e associa novos arquivos diretamente à variante.</p> : null}
  </section>;
}

function Secao({ titulo, vazio, children }: { titulo: string; vazio: string; children: React.ReactNode }) { return <section className="flex flex-col gap-3"><h4 className="text-sm font-semibold text-ink">{titulo}</h4>{children}<p className="sr-only">{vazio}</p></section>; }
function Arquivo({ label, accept, onChange }: { label: string; accept: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) { return <label className="cursor-pointer rounded-md border border-sand px-3 py-2 text-sm text-ink"><span>{label}</span><input className="sr-only" type="file" accept={accept} onChange={onChange} /></label>; }
function Envio({ accept, label, ocupado, onChange }: { accept: string; label: string; ocupado: boolean; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) { return <label className="flex min-h-toque w-fit cursor-pointer items-center rounded-md border border-dashed border-gold px-3 py-2 text-sm text-ink"><span>{ocupado ? "Enviando…" : label}</span><input className="sr-only" type="file" accept={accept} disabled={ocupado} onChange={onChange} /></label>; }
function Miniatura({ midia }: { midia: FotoDoProduto }) { return midia.tipo === "video" ? <video src={midia.url} className="h-20 w-20 shrink-0 rounded object-cover" muted preload="metadata" /> : <img src={midia.url} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />; }
