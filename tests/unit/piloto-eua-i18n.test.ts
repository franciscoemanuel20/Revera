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

  it("preserva o checkout nos quatro idiomas internacionais", () => {
    const english = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/en/checkout")
    );
    const spanish = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/es/checkout")
    );

    expect(english.headers.get("location")).toBeNull();
    expect(english.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("en");
    expect(spanish.headers.get("location")).toBeNull();
    expect(spanish.headers.get(`x-middleware-request-${LOCALE_HEADER}`)).toBe("es");
  });

  it("redireciona produto pela geolocalizacao para o mercado localizado", () => {
    const response = middleware(
      new NextRequest("https://www.reveraprotesecapilar.com/produtos/micropele-008", {
        headers: { "x-vercel-ip-country": "DE" },
      })
    );

    expect(response.headers.get("location")).toBe("https://www.reveraprotesecapilar.com/de/produtos/micropele-008");
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

    expect(localizedCart).toContain('redirect(`/${locale}/checkout`)');
    expect(provider).toContain('if (locale !== "pt") router.push(`/${locale}/checkout`)');
  });

  it("mantem o checkout americano na URL canonica em ingles", () => {
    const checkout = readFileSync(
      join(process.cwd(), "src/app/checkout/page.tsx"),
      "utf8"
    );

    expect(checkout).toContain('redirect("/en/checkout")');
    expect(checkout).toContain('iso === "US" ? "/en/checkout"');
  });

  it("nao transforma idioma compartilhado em pais de entrega errado", () => {
    const localizedCheckout = readFileSync(
      join(process.cwd(), "src/app/[locale]/checkout/page.tsx"),
      "utf8"
    );

    expect(localizedCheckout).toContain("detected === fallback");
    expect(localizedCheckout).toContain("checkoutDoPais(pais)");
  });
});
