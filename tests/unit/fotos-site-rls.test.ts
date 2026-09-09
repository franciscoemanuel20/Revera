import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/00000000000019_fotos_site_gerenciaveis.sql"),
  "utf8"
);

describe("RLS da biblioteca de fotos", () => {
  it("não concede escrita para todo usuário autenticado", () => {
    expect(migration).not.toContain('to authenticated using (true) with check (true)');
    expect(migration).toContain('create policy "admin manage site media assets"');
    expect(migration).toContain("exists (select 1 from admin_users where id = auth.uid())");
  });
});
