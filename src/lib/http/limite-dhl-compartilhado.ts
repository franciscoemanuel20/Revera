import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { identificarCliente } from "./limite-publico";

interface ResultadoLimite {
  permitido: boolean;
  retryAfterSeconds: number;
  indisponivel?: boolean;
}

function hashIdentificador(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

/**
 * Limite compartilhado e atômico, aplicado antes de cada chamada à DHL.
 * A função SQL não recebe nem persiste identificadores em claro.
 */
export async function consumirLimiteDhlCompartilhado(
  cabecalhos: { get(name: string): string | null },
  cartId: string
): Promise<ResultadoLimite> {
  const ipHash = hashIdentificador(identificarCliente(cabecalhos as Headers));
  const cartHash = hashIdentificador(cartId);
  const limites = [
    { scope: "dhl-ip-minute", hash: ipHash, maximum: 30, seconds: 60 },
    { scope: "dhl-cart-minute", hash: cartHash, maximum: 6, seconds: 60 },
    { scope: "dhl-ip-day", hash: ipHash, maximum: 240, seconds: 86400 },
    { scope: "dhl-cart-day", hash: cartHash, maximum: 30, seconds: 86400 },
  ];

  // Cada bucket é atômico no banco. As cotas são consumidas em paralelo e
  // conservadoramente mesmo se outra cota negar ou falhar; assim não há
  // caminho parcial que permita exceder um limite por concorrência.
  try {
    const admin = createAdminClient();
    const resultados = await Promise.all(limites.map((limite) =>
      admin.rpc("consume_public_rate_limit", {
        p_scope: limite.scope,
        p_client_hash: limite.hash,
        p_maximum: limite.maximum,
        p_window_seconds: limite.seconds,
      })
    ));

    let retryAfterSeconds = 0;
    for (const resultado of resultados) {
      if (resultado.error) {
        console.error("[checkout-intl] rate limit DHL indisponível", {
          errorCode: resultado.error.code ?? "unknown",
        });
        return { permitido: false, retryAfterSeconds: 60, indisponivel: true };
      }
      const linha = Array.isArray(resultado.data) ? resultado.data[0] : resultado.data;
      if (!linha || linha.allowed !== true) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          Number(linha?.retry_after_seconds) || 1
        );
      }
    }
    return retryAfterSeconds > 0
      ? { permitido: false, retryAfterSeconds }
      : { permitido: true, retryAfterSeconds: 0 };
  } catch {
    console.error("[checkout-intl] rate limit DHL indisponível", { errorCode: "exception" });
    return { permitido: false, retryAfterSeconds: 60, indisponivel: true };
  }
}
