// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CartDrawer, type CartDrawerProps } from "@/components/ui/CartDrawer";
import { Modal } from "@/components/ui/Modal";

let root: Root;
let host: HTMLDivElement;
let trigger: HTMLButtonElement;
const props: CartDrawerProps = {
  open: true, onClose: vi.fn(), items: [], subtotalCents: 0,
  onQuantityChange: vi.fn(), onRemove: vi.fn(), onCheckout: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function () {
    return [{ width: 44, height: 44 }] as unknown as DOMRectList;
  });
  document.body.innerHTML = '<button id="trigger">Abrir sacola</button><a href="#pt">PT</a><div id="host"></div>';
  trigger = document.querySelector<HTMLButtonElement>("#trigger")!;
  host = document.querySelector<HTMLDivElement>("#host")!;
  trigger.focus();
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render(extra: Partial<CartDrawerProps> = {}) {
  act(() => root.render(React.createElement(CartDrawer, { ...props, ...extra })));
}
function tab(shiftKey = false) {
  const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  document.activeElement!.dispatchEvent(event);
  return event;
}

it("dá ao diálogo o nome visível e foca Fechar ao abrir", () => {
  render();
  const dialog = document.querySelector('[role="dialog"]')!;
  const headingId = dialog.getAttribute("aria-labelledby");
  expect(headingId).toBeTruthy();
  expect(document.getElementById(headingId!)?.textContent).toBe("Sua sacola");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Fechar carrinho");
});
it("sacola vazia não deixa Tab ou Shift+Tab alcançar PT", () => {
  render();
  const close = document.activeElement;
  expect(tab().defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(close);
  expect(tab(true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(close);
});
it("circula entre primeiro e último controle, sem acionar mutações", () => {
  const callbacks = { onQuantityChange: vi.fn(), onRemove: vi.fn(), onCheckout: vi.fn() };
  render({ ...callbacks, items: [{ id: "item", name: "Peça", quantity: 1, unitPriceCents: 65000 }] });
  const close = document.activeElement;
  const checkout = [...host.querySelectorAll("button")].find(b => b.textContent === "Finalizar compra")!;
  tab(true);
  expect(document.activeElement).toBe(checkout);
  tab();
  expect(document.activeElement).toBe(close);
  Object.values(callbacks).forEach(fn => expect(fn).not.toHaveBeenCalled());
});
it("isola o fundo e restaura foco e atributos ao fechar", () => {
  const oldInert = document.createElement("div");
  oldInert.setAttribute("inert", "");
  document.body.append(oldInert);
  render();
  expect(trigger.hasAttribute("inert")).toBe(true);
  render({ open: false });
  expect(document.activeElement).toBe(trigger);
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(oldInert.hasAttribute("inert")).toBe(true);
});
it("Escape continua fechando; rerender não rouba foco dentro da sacola", () => {
  const onClose = vi.fn();
  render({ onClose, items: [{ id: "item", name: "Peça", quantity: 1, unitPriceCents: 65000 }] });
  tab(true);
  const focused = document.activeElement;
  render({ onClose, items: [{ id: "item", name: "Peça", quantity: 2, unitPriceCents: 65000 }] });
  expect(document.activeElement).toBe(focused);
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("fechar a sacola inferior não libera o fundo enquanto outro diálogo está aberto", () => {
  const closeCart = vi.fn();
  const closeModal = vi.fn();
  const pair = (cartOpen: boolean, modalOpen: boolean) => React.createElement(React.Fragment, null,
    React.createElement(CartDrawer, { ...props, open: cartOpen, onClose: closeCart }),
    React.createElement(Modal, { open: modalOpen, onClose: closeModal, title: "Ajuda", children: "Texto" }),
  );
  act(() => root.render(pair(true, false)));
  act(() => root.render(pair(true, true)));
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Fechar");
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(closeModal).toHaveBeenCalledTimes(1);
  expect(closeCart).not.toHaveBeenCalled();
  act(() => root.render(pair(false, true)));
  expect(trigger.hasAttribute("inert")).toBe(true);
  expect(tab().defaultPrevented).toBe(true);
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Fechar");
  act(() => root.render(pair(false, false)));
  expect(trigger.hasAttribute("inert")).toBe(false);
  expect(document.activeElement).toBe(trigger);
});

it("ao fechar o diálogo superior, retoma foco e isolamento da sacola", () => {
  const pair = (modalOpen: boolean) => React.createElement(React.Fragment, null,
    React.createElement(CartDrawer, props),
    React.createElement(Modal, { open: modalOpen, onClose: vi.fn(), children: "Texto" }),
  );
  act(() => root.render(pair(false)));
  act(() => root.render(pair(true)));
  expect(document.querySelector('[aria-label="Diálogo"]')).not.toBeNull();
  act(() => root.render(pair(false)));
  expect(trigger.hasAttribute("inert")).toBe(true);
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Fechar carrinho");
});
