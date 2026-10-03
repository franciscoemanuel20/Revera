// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Header } from "@/components/ui/Header";
import { Footer } from "@/components/ui/Footer";
import { ProdutosContent } from "@/app/produtos/ProdutosContent";

vi.mock("next/navigation", () => ({ usePathname: () => "/produtos" }));
vi.mock("@/components/cart/CartTriggerButton", () => ({ CartTriggerButton: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  from: () => ({ select: () => ({ order: async () => ({ data: [] }) }) }),
}) }));
vi.mock("@/lib/conteudo/fotos-do-site", () => ({ urlDaFotoDoSite: async (path: string) => path }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const logo = "/media/marca/logo-revera.png";

it("logo preserva proporção e arquivo, com candidatos de até 384px", () => {
  for (const component of [Header, Footer]) {
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(React.createElement(component, { logo })), "text/html");
    const img = doc.querySelector("img")!;
    expect(Number(img.width) / Number(img.height)).toBeCloseTo(1500 / 920, 5);
    const urls = img.srcset.split(", ").map(entry => new URL(entry.split(" ")[0]!, "https://example.test"));
    expect(urls.length).toBeGreaterThan(0);
    expect(Math.max(...urls.map(url => Number(url.searchParams.get("w"))))).toBeLessThanOrEqual(384);
    expect(urls.every(url => url.searchParams.get("url") === logo)).toBe(true);
  }
});
it("hero entrega a mesma foto pelo otimizador, mantendo recorte e espaço reservado", async () => {
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(await ProdutosContent()), "text/html");
  const img = doc.querySelector<HTMLImageElement>('img[alt="Prótese capilar Reverá com acabamento natural"]')!;
  expect(img.srcset).toContain("/_next/image?");
  expect(new URL(img.getAttribute("src")!, "https://example.test").searchParams.get("url")).toBe("/media/hero/produto-close-1.jpeg");
  expect(img.sizes).toContain("768px");
  expect(img.className).toContain("object-cover");
  expect(img.parentElement?.className).toContain("aspect-[4/3]");
});
it("copyright tem contraste WCAG AA usando as cores atuais da marca", () => {
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(React.createElement(Footer, { logo })), "text/html");
  const copyright = doc.querySelector("footer p")!;
  const alpha = Number(copyright.className.match(/text-paper\/(\d+)/)?.[1] ?? 100) / 100;
  const tokens = readFileSync("src/styles/tokens.css", "utf8");
  const rgb = (name: string) => tokens.match(new RegExp(`--${name}-rgb: ([\\d ]+);`))![1]!.split(" ").map(Number);
  const bg = rgb("ink");
  const fg = rgb("paper").map((channel, i) => channel * alpha + bg[i]! * (1 - alpha));
  const luminance = (color: number[]) => color.map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i]!, 0);
  expect((luminance(fg) + 0.05) / (luminance(bg) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
