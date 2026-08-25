import "server-only";
import type { ShippingProvider } from "./provider";
import { MockShippingProvider } from "./mock-provider";

// Não há uma env "SHIPPING_PROVIDER" separada (diferente de payments): a
// escolha segue a presença de SUPERFRETE_TOKEN (.env.example), mesmo
// princípio do factory de providers do projeto irmão — credencial ausente
// => mock, sem precisar de uma segunda variável só para isso.
export function getShippingProvider(): ShippingProvider {
  if (process.env.SUPERFRETE_TOKEN) {
    // não implementado — Fase 3. Ver src/lib/shipping/provider.ts para o
    // contrato que o adapter real (SuperFreteShippingProvider) vai cumprir.
    throw new Error("SUPERFRETE_TOKEN presente, mas o adapter real não implementado — Fase 3.");
  }

  return new MockShippingProvider();
}
