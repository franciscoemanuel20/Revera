import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require("../../next.config.js");

describe("redirect legado de produto", () => {
  it("mantem /produto/:slug apontando para a rota vendavel /produtos/:slug", async () => {
    const redirects = await nextConfig.redirects();

    expect(redirects).toContainEqual({
      source: "/produto/:slug",
      destination: "/produtos/:slug",
      permanent: true,
    });
  });
});
