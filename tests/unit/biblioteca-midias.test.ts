import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/00000000000025_biblioteca_midias.sql"),
  "utf8"
);

describe("biblioteca de mídias", () => {
  it("organiza fotos e vídeos sem alterar a política de acesso existente", () => {
    expect(migration).toContain("add column if not exists categoria");
    expect(migration).toContain("site_media_assets_categoria_idx");
    expect(migration).not.toContain("create policy");
  });
});
