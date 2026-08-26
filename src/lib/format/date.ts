/**
 * Formatação de data para o admin — extraído para cá porque pedidos,
 * dashboard, solicitações e conteúdo editável (os módulos criados na
 * auditoria de 26/08/2026) todos precisam mostrar `created_at`/`updated_at`
 * em pt-BR, e cada tela escrevendo `.toLocaleDateString("pt-BR", {...})`
 * com opções levemente diferentes é como duas datas do mesmo pedido acabam
 * parecendo formatadas por sistemas diferentes. Mesmo espírito de
 * src/lib/format/money.ts.
 */

export function formatarData(isoString: string): string {
  return new Date(isoString).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatarDataHora(isoString: string): string {
  return new Date(isoString).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
