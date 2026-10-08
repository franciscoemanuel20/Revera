import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration(numero: string) {
  return readFileSync(
    join(process.cwd(), "supabase", "migrations", numero),
    "utf8"
  );
}

describe("integridade das migrations de exportação", () => {
  it.each([
    "00000000000034_exportacao_por_pedido.sql",
    "00000000000037_fix_export_lock_order_document_status.sql",
  ])("impede transferir embalagem ou documento fiscal entre pedidos em %s", (arquivo) => {
    const sql = migration(arquivo);

    expect(sql).toMatch(
      /if tg_op = 'UPDATE' then\s+if tg_table_name in \('order_export_packages','order_export_documents'\)[\s\S]*new\.order_id is distinct from old\.order_id/
    );
    expect(sql).toContain("Pedido da embalagem ou documento fiscal é imutável");
  });

  it("mantém OLD.status restrito ao ramo UPDATE de documentos", () => {
    const sql = migration("00000000000037_fix_export_lock_order_document_status.sql");
    const ramoDocumentos = sql.slice(sql.indexOf("if tg_table_name = 'order_export_documents' then"));

    expect(ramoDocumentos).toMatch(
      /if tg_op = 'UPDATE' then[\s\S]*if old\.status = 'verified' then/
    );
  });

  it.each([
    "00000000000034_exportacao_por_pedido.sql",
    "00000000000037_fix_export_lock_order_document_status.sql",
  ])("impede vincular arquivo fiscal ao diretório de outro pedido em %s", (arquivo) => {
    const sql = migration(arquivo);

    expect(sql).toContain("new.storage_path not like pedido_id::text || '/%'");
    expect(sql).toContain("Arquivo fiscal deve pertencer ao diretório do pedido");
  });

  it("aplica a unicidade somente depois da correção urgente do gatilho", () => {
    const urgente = migration("00000000000037_fix_export_lock_order_document_status.sql");
    const unicidade = migration("00000000000038_unique_export_document_storage_path.sql");

    expect(urgente).not.toContain("create unique index");
    expect(unicidade).toMatch(
      /unique index if not exists order_export_documents_storage_path_unico[\s\S]*on order_export_documents\(storage_path\)/
    );
    expect(unicidade).toMatch(/group by storage_path having count\(\*\) > 1/);
    expect(unicidade).toContain("sanear antes de aplicar a unicidade");
    expect(migration("../rollback/00000000000038_unique_export_document_storage_path.sql"))
      .not.toContain("drop index");
  });

  it.each([
    "00000000000034_exportacao_por_pedido.sql",
    "00000000000037_fix_export_lock_order_document_status.sql",
  ])("isola OLD/NEW por operação no checkout e nas remessas em %s", (arquivo) => {
    const sql = migration(arquivo);

    expect(sql).toMatch(
      /if tg_table_name = 'order_items' then\s+if tg_op = 'UPDATE' then\s+if new\.order_id is distinct from old\.order_id/
    );
    expect(sql).toMatch(
      /elsif tg_op = 'DELETE' then\s+if old\.provider = 'dhl' then/
    );
    expect(sql).not.toContain("elsif tg_op = 'DELETE' and old.provider");
    expect(sql).toMatch(/if tg_op = 'DELETE' then\s+if old\.status = 'verified' then/);
    expect(sql).not.toContain("tg_op = 'DELETE' and old.status");
  });
});
