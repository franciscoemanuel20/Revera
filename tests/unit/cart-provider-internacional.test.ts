// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/produtos/micropele-008",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("@/lib/cart/actions", () => ({
  obterCarrinhoAction: vi.fn(async () => ({
    cartId: "cart",
    items: [{
      cartItemId: "item",
      variantId: "variant",
      productName: "Micropele",
      variantLabel: "Cor 1B",
      colorPhotoUrl: null,
      quantity: 1,
      stockQty: 2,
      basePriceCents: 65000,
      compareAtPriceCents: null,
      unitPriceCents: 65000,
      subtotalCents: 65000,
      discountCents: 0,
      discountRules: [],
    }],
    subtotalSemDescontoCents: 65000,
    subtotalCents: 65000,
    discountCents: 0,
    totalCents: 65000,
  })),
  adicionarAoCarrinhoAction: vi.fn(),
  alterarQuantidadeAction: vi.fn(),
  removerDoCarrinhoAction: vi.fn(),
}));

import { CartProvider } from "@/components/cart/CartProvider";
import { CartTriggerButton } from "@/components/cart/CartTriggerButton";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  navigation.pathname = "/produtos/micropele-008";
  navigation.push.mockClear();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function app() {
  return React.createElement(CartProvider, null, React.createElement(CartTriggerButton));
}

it("fecha imediatamente o drawer BRL quando a navegacao entra na jornada americana", async () => {
  await act(async () => root.render(app()));
  await act(async () => Promise.resolve());

  const trigger = host.querySelector("button")!;
  act(() => trigger.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();

  navigation.pathname = "/en/produtos/micropele-008";
  await act(async () => root.render(app()));

  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
