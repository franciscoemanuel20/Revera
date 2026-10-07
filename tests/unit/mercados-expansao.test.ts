import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAISES, idiomaDoPais } from "@/lib/internacional/paises";
import { validarEndereco } from "@/lib/internacional/endereco";
import { StripeProvider, urlCheckoutStripeSegura } from "@/lib/payments/stripe-provider";
// @ts-expect-error Script operacional ESM também é testado pelo Vitest.
import { precoProtegido, destinoReveraValido, variantePrecificavel } from "../../scripts/precificar-mercados.mjs";

const resposta = vi.hoisted(() => ({
  variantes: {
    data: [
      { id: "v1", price_cents: 65000, stock_qty: 10 },
      { id: "v2", price_cents: 75000, stock_qty: 10 },
    ],
    count: 2,
    error: null as unknown,
  },
  precos: { data: [{ variant_id: "v1" }, { variant_id: "v2" }], count: 2, error: null as unknown },
}));
vi.mock("@/lib/supabase/server", () => ({createAdminClient: () => ({from: (table: string) => {
  let id: string | undefined;
  const filtrosGt: Array<[string, number]> = [];
  const q = { select: () => q, eq: (key: string, value: string) => { if(key === "id") id=value; return q; }, gt: (key: string, value: number) => { filtrosGt.push([key, value]); return q; },
    lte:()=>q,gte:()=>q,order:()=>q,limit:()=>q,
    maybeSingle:async()=>({data:table === "shipping_quotes"
      ? {id:"quote-1",order_id:"pedido-1",carrier:"DHL",price_cents:6600,service_name:"Express",eta_days:4,created_at:new Date().toISOString(),raw_response:{source:"mydhl-production",environment:"producao",country:"US",currency:"USD",product_code:"8",service_name:"Express",eta_days:4,delivery_date:null,quoted_at:new Date().toISOString()}}
      : {id:id??"cotacao-nova",carrier:"DHL",service_name:"Express",currency:"USD",price_cents:id?6600:6800,valid_until:"2026-10-02"},error:null}),
    then: (resolve: (x: unknown) => unknown) => {
      if (table !== "product_variants") return Promise.resolve(resolve(resposta.precos));
      const data = resposta.variantes.data.filter((linha) =>
        filtrosGt.every(([key, value]) => Number((linha as Record<string, unknown>)[key] ?? 0) > value)
      );
      return Promise.resolve(resolve({ ...resposta.variantes, data, count: data.length }));
    } };
  return q;
}})}));

beforeEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  resposta.variantes = {
    data: [
      { id: "v1", price_cents: 65000, stock_qty: 10 },
      { id: "v2", price_cents: 75000, stock_qty: 10 },
    ],
    count: 2,
    error: null,
  };
  resposta.precos = { data: [{variant_id:"v1"},{variant_id:"v2"}], count:2,error:null };
});

describe("todos os destinos", () => {
  for (const pais of Object.values(PAISES).filter(p=>p.iso!=="BR")) {
    it(`${pais.iso}: endereço, postal, idioma e moeda Stripe`, async () => {
      const entrada = { pais:pais.iso,destinatario:"Checkout Test",linha1:"Test street 10",cidade:"City",regiao:pais.exigeRegiao?"Region":null,codigoPostal:pais.exigeCodigoPostal===false?"":pais.postalExemplo,telefone:`${pais.ddi}123456789` };
      expect(validarEndereco(entrada).ok).toBe(true);
      expect(validarEndereco({...entrada,codigoPostal:""}).ok).toBe(pais.iso==="AE");
      vi.stubEnv("STRIPE_SECRET_KEY","sk_test_fixture");
      const mock = vi.fn(async () => new Response(JSON.stringify({id:"cs_test_fixture",url:"https://checkout.stripe.com/c/pay/test"})));
      vi.stubGlobal("fetch",mock);
      await new StripeProvider().createCharge({orderId:"fixture",orderNumber:"TEST",currency:pais.moedaPadrao,locale:idiomaDoPais(pais.iso),amountCents:17000,redirectUrl:"https://www.reveraprotesecapilar.com/pedido/test",webhookUrl:"https://www.reveraprotesecapilar.com/api/test",items:[{description:"Produto",quantity:1,priceCents:10000},{description:"DHL",quantity:1,priceCents:7000}]});
      const args = mock.mock.calls as unknown as Array<[string,RequestInit]>;
      const primeiraChamada = args[0];
      if (!primeiraChamada) throw new Error("StripeProvider não chamou fetch");
      const body = new URLSearchParams(String(primeiraChamada[1].body));
      expect(body.get("locale")).toBe(pais.idioma);
      expect(body.get("line_items[0][price_data][currency]")).toBe(pais.moedaPadrao.toLowerCase());
      expect(body.get("adaptive_pricing[enabled]")).toBe("false");
    });
  }
});

it("recusa catálogo incompleto mesmo que o item no carrinho tenha preço", async () => {
  const {catalogoCompletoNoMercado} = await import("@/lib/internacional/mercado");
  expect(await catalogoCompletoNoMercado("USD")).toBe(true);
  resposta.precos.data=[{variant_id:"v1"}];resposta.precos.count=1;
  expect(await catalogoCompletoNoMercado("USD")).toBe(false);
  resposta.precos.error={message:"indisponivel"};
  expect(await catalogoCompletoNoMercado("USD")).toBe(false);
});

it("não deixa variante não vendável travar mercado internacional", async () => {
  const { catalogoCompletoNoMercado } = await import("@/lib/internacional/mercado");
  resposta.variantes = {
    data: [
      { id: "v1", price_cents: 65000, stock_qty: 10 },
      { id: "sem-preco", price_cents: 0, stock_qty: 999 },
      { id: "sem-estoque", price_cents: 65000, stock_qty: 0 },
    ],
    count: 3,
    error: null,
  };
  resposta.precos = { data: [{ variant_id: "v1" }], count: 1, error: null };
  expect(await catalogoCompletoNoMercado("USD")).toBe(true);
});

it("não toma consulta truncada como catálogo completo",async()=>{
  const {catalogoCompletoNoMercado} = await import("@/lib/internacional/mercado");
  resposta.precos.count=1001;
  expect(await catalogoCompletoNoMercado("USD")).toBe(false);
});

it("pedido só paga com recibo DHL ao vivo vinculado ao próprio pedido",async()=>{
  vi.stubEnv("CHECKOUT_PAISES","BR,US");
  vi.stubEnv("STRIPE_SECRET_KEY","sk_test_fixture");vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_fixture");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({charges_enabled:true,payouts_enabled:true,capabilities:{card_payments:"active"}}))));
  const {pedidoInternacionalPagavel,cotacaoFreteInternacional} = await import("@/lib/internacional/mercado");
  expect((await cotacaoFreteInternacional("US","USD"))?.priceCents).toBe(6800);
  expect((await cotacaoFreteInternacional("US","USD","cotacao-original"))?.priceCents).toBe(6600);
  expect((await pedidoInternacionalPagavel("US","USD","pedido-1",6600,"quote-1")).pagavel).toBe(true);
  expect((await pedidoInternacionalPagavel("US","EUR","pedido-1",6600,"quote-1")).pagavel).toBe(false);
  expect((await pedidoInternacionalPagavel("US","USD","pedido-1",6800,"quote-1")).pagavel).toBe(false);
  expect((await pedidoInternacionalPagavel("US","USD","other-order",6600,"quote-1")).pagavel).toBe(false);
});

it("reserva 3 h para iniciar PayPal, a chamada do gateway e 3 h para a ordem expirar", async () => {
  const { cotacaoPermiteNovoPayPal, JANELA_MAXIMA_PAGAMENTO_INTERNACIONAL_MS } = await import("@/lib/internacional/mercado");
  const cotadaEm = new Date("2026-10-06T12:00:00.000Z");
  expect(JANELA_MAXIMA_PAGAMENTO_INTERNACIONAL_MS).toBe(6 * 60 * 60_000 + 20_000);
  expect(cotacaoPermiteNovoPayPal(cotadaEm, cotadaEm.getTime())).toBe(true);
  expect(cotacaoPermiteNovoPayPal(cotadaEm, cotadaEm.getTime() + 60 * 60_000)).toBe(true);
  expect(cotacaoPermiteNovoPayPal(cotadaEm, cotadaEm.getTime() + 2 * 60 * 60_000 + 58 * 60_000)).toBe(true);
  expect(cotacaoPermiteNovoPayPal(cotadaEm, cotadaEm.getTime() + 3 * 60 * 60_000 - 60_000)).toBe(true);
  expect(cotacaoPermiteNovoPayPal(cotadaEm, cotadaEm.getTime() + 3 * 60 * 60_000 - 59_999)).toBe(false);
  expect(cotacaoPermiteNovoPayPal(cotadaEm, cotadaEm.getTime() - 30_001)).toBe(false);
});

it("converte o preço brasileiro pela PTAX sem repetir o número", async () => {
  const { converterCentavosBrl } = await import("@/lib/internacional/cambio-ptax");
  expect(converterCentavosBrl(65000, 5.2238)).toBe(12444);
  expect(converterCentavosBrl(65000, 1)).toBe(65000);
  expect(() => converterCentavosBrl(65000, 0)).toThrow();
});

it("conta suspensa, chave inválida ou indisponibilidade bloqueiam pagamento", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY","sk_test_fixture");vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_fixture");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({charges_enabled:false,capabilities:{card_payments:"active"}}))));
  expect(await new StripeProvider().disponivel()).toBe(false);
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({charges_enabled:true,payouts_enabled:true,capabilities:{card_payments:"active"}}))));
  expect(await new StripeProvider().disponivel()).toBe(true);
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({charges_enabled:true,payouts_enabled:false,capabilities:{card_payments:"active"}}))));
  expect(await new StripeProvider().disponivel()).toBe(false);
  vi.stubEnv("STRIPE_SECRET_KEY","");
  expect(await new StripeProvider().disponivel()).toBe(false);
});

it("preserva base BRL líquida da tarifa de referência e nunca reduz preço",()=>{
  for(const base of [65000,70000,75000]) for(const rate of [5.1143,5.9469,6.9196,3.6664,3.7036]) {
    const valor=precoProtegido(base,rate);
    expect(valor*rate*0.9401-39).toBeGreaterThanOrEqual(base);
    expect(valor%100).toBe(0);
    expect(precoProtegido(base,rate,valor+100)).toBe(valor+100);
  }
  expect(()=>precoProtegido(65000,0)).toThrow();
});

it("precificação internacional ignora variante administrativa sem preço ou estoque", () => {
  const base = { id: "v", is_active: true, product_status: "active", price_cents: 65000, stock_qty: 1 };
  expect(variantePrecificavel(base)).toBe(true);
  expect(variantePrecificavel({ ...base, price_cents: 0 })).toBe(false);
  expect(variantePrecificavel({ ...base, stock_qty: 0 })).toBe(false);
  expect(variantePrecificavel({ ...base, is_active: false })).toBe(false);
  expect(variantePrecificavel({ ...base, product_status: "draft" })).toBe(false);
});

it("links Stripe recusam domínio parecido, protocolo perigoso e credenciais",()=>{
  expect(urlCheckoutStripeSegura("https://checkout.stripe.com/c/pay/abc")).toBe(true);
  for(const url of ["javascript:alert(1)","https://checkout.stripe.com.evil.test/a","https://evil.test/","https://u@checkout.stripe.com/a","http://checkout.stripe.com/a","//checkout.stripe.com/a"]) expect(urlCheckoutStripeSegura(url)).toBe(false);
});

it("o banco escrito precisa pertencer à mesma produção validada",()=>{
  const api="https://ngnaemfiytutyplolgxb.supabase.co";
  expect(destinoReveraValido(api,"postgresql://postgres:fixture@db.ngnaemfiytutyplolgxb.supabase.co/postgres")).toBe(true);
  expect(destinoReveraValido(api,"postgresql://postgres.ngnaemfiytutyplolgxb:fixture@aws-0-sa-east-1.pooler.supabase.com/postgres")).toBe(true);
  expect(destinoReveraValido(api,"postgresql://postgres.other:fixture@aws-0-sa-east-1.pooler.supabase.com/postgres")).toBe(false);
  expect(destinoReveraValido(api,"postgresql://postgres:fixture@db.other.supabase.co/postgres")).toBe(false);
});
