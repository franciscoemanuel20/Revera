import CheckoutPage from "./page";

/** Entrada interna das rotas localizadas, sem depender de query string. */
export async function checkoutDoPais(pais: string) {
  return CheckoutPage({
    searchParams: Promise.resolve({ pais, rotaLocalizada: "1" }),
  });
}
