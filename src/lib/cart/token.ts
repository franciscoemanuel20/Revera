import "server-only";
import { cookies } from "next/headers";

// Identidade do carrinho anônimo — um uuid opaco em cookie httpOnly, NUNCA
// em localStorage nem decidido pelo IP. httpOnly porque o valor não precisa
// (e não deve) ser lido por JavaScript no navegador: só o servidor lê, e um
// script malicioso na página não consegue roubar o carrinho de outra pessoa
// através dele. Ver justificativa completa de por que isto substitui RLS
// para carts/cart_items em supabase/migrations/00000000000003_cart_policies.sql
// e no comentário no topo de store.ts.
export const CART_COOKIE_NAME = "revera_cart_token";

// 90 dias — carrinho de prótese capilar tem ciclo de decisão longo (preço
// alto, R$ 1.600+ conforme regras comerciais do projeto); um carrinho que
// expira em poucos dias jogaria fora consideração de compra real. Não é
// prazo de nenhuma regra comercial nova, só o cookie de identificação.
const COOKIE_MAX_AGE_SEGUNDOS = 60 * 60 * 24 * 90;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tokenTemFormatoValido(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor);
}

export async function lerTokenDoCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE_NAME)?.value ?? null;
}

export async function gravarTokenNoCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE_NAME, token, {
    httpOnly: true,
    // secure só em produção — em dev local (http://localhost) o navegador
    // descarta cookie secure=true silenciosamente, e o carrinho pareceria
    // "não persistir" sem erro nenhum indicando o motivo.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEGUNDOS,
  });
}

export async function limparTokenDoCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE_NAME);
}
