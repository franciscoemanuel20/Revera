import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { LOCALE_HEADER } from "@/lib/i18n/site";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("piloto internacional dos Estados Unidos", () => {
  it("preserva a pagina de produto em ingles quando o clique vem do anuncio", () => {
    const response = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/en/produtos/micropele-008")
    );

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("en");
  });

  it("preserva o checkout em ingles e nao abre os demais idiomas antes da hora", () => {
    const english = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/en/checkout")
    );
    const spanish = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/es/checkout")
    );

    expect(english.headers.get("location")).toBeNull();
    expect(english.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("en");
    expect(spanish.headers.get("location")).toBe(
      "https://www.reveraprotesecapilar.com/checkout"
    );
  });

  it("nao redireciona automaticamente produto sem prefixo para mercados ainda fechados", () => {
    const response = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/produtos/micropele-008", {
        headers: { "x-vercel-ip-country": "DE" },
      })
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("nao expoe o resumo BRL do carrinho ao comprador americano", () => {
    const localizedCart = readFileSync(
      join(process.cwd(), "src/app/[locale]/carrinho/page.tsx"),
      "utf8"
    );
    const provider = readFileSync(
      join(process.cwd(), "src/components/cart/CartProvider.tsx"),
      "utf8"
    );

    expect(localizedCart).toContain('if (locale === "en") redirect("/en/checkout")');
    expect(provider).toContain('if (locale === "en") router.push("/en/checkout")');
  });

  it("mantem o checkout americano na URL canonica em ingles", () => {
    const checkout = readFileSync(
      join(process.cwd(), "src/app/checkout/page.tsx"),
      "utf8"
    );

    expect(checkout).toContain('redirect("/en/checkout")');
    expect(checkout).toContain('iso === "US" ? "/en/checkout"');
  });
});
