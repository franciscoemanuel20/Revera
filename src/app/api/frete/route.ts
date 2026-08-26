import { NextResponse } from "next/server";
import { lerCarrinhoCompleto } from "@/lib/cart/store";
import { cotarFrete } from "@/lib/shipping/cotar";

/**
 * Cotação de frete para a tela de checkout — para o cliente VER o valor
 * antes de decidir pagar, em vez de descobrir no extrato.
 *
 * ===========================================================================
 * O QUE ESTA ROTA ACEITA DO NAVEGADOR: só o CEP.
 * ===========================================================================
 * Quantidade e valor declarado NÃO vêm do corpo da requisição — são lidos do
 * carrinho no servidor, pelo cookie, com `lerCarrinhoCompleto()`, que
 * recalcula tudo a partir do banco.
 *
 * O motivo é o de sempre: qualquer campo aceito do navegador é um campo que
 * alguém pode mudar no console. Aceitar `quantidade` aqui deixaria mandar
 * `quantidade: 1` numa sacola de dez peças e ver um frete que não é o do
 * pedido. Aceitar `valorDeclarado` seria pior — mudaria o seguro contratado.
 *
 * O CEP pode vir do cliente porque é o endereço DELE: mentir ali só produz
 * uma cotação errada para si mesmo, e o valor que vale é o recotado no
 * servidor na hora de criar o pedido (src/app/checkout/actions.ts). Esta rota
 * informa; ela não decide preço nenhum.
 */
export async function POST(request: Request) {
  let corpo: { cep?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const cep = String(corpo.cep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) {
    return NextResponse.json({ erro: "CEP inválido." }, { status: 400 });
  }

  const carrinho = await lerCarrinhoCompleto();
  if (!carrinho.cartId || carrinho.items.length === 0) {
    return NextResponse.json({ erro: "Sacola vazia." }, { status: 400 });
  }

  const quantidade = carrinho.items.reduce((soma, i) => soma + i.quantity, 0);

  const cotacao = await cotarFrete({
    cepDestino: cep,
    valorDeclaradoCents: carrinho.subtotalSemDescontoCents,
    quantidade,
  });

  if (!cotacao.escolhida) {
    // 200, não 5xx: "não consegui cotar" é uma resposta legítima desta rota,
    // não uma falha dela. A tela mostra o aviso e deixa a compra seguir — o
    // pedido é criado do mesmo jeito (ver actions.ts).
    return NextResponse.json({
      disponivel: false,
      motivo: cotacao.indisponivel ?? "Nenhuma transportadora atende este CEP com a cobertura necessária.",
    });
  }

  return NextResponse.json({
    disponivel: true,
    priceCents: cotacao.escolhida.priceCents,
    serviceName: cotacao.escolhida.serviceName,
    carrier: cotacao.escolhida.carrier,
    etaDays: cotacao.escolhida.etaDays,
  });
}
