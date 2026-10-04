import {afterEach,describe,it,expect,vi} from 'vitest';
import {FakeSupabase} from '../stubs/fake-supabase';
const fixture=vi.hoisted(()=>({client:null as any,registrar:vi.fn(),despachar:vi.fn(),avisar:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createAdminClient:()=>fixture.client}));
vi.mock('@/lib/payments/revera',()=>({getReveraProviderByName:()=>provider,getReveraProviderForCurrency:()=>provider}));
const provider={name:'infinitepay',confirmPayment:async()=>({paid:true,paidAmountCents:10000,currency:'BRL',method:'pix',raw:{paid:true}})};
vi.mock('@/lib/tracking/purchase',()=>({registrarPurchasePendente:fixture.registrar}));
vi.mock('@/lib/tracking/despachar',()=>({despacharPurchase:fixture.despachar}));
vi.mock('@/lib/notificacoes/venda-paga',()=>({avisarVendaPaga:fixture.avisar}));
import {confirmarPagamento} from '@/lib/payments/confirmar';
afterEach(()=>vi.clearAllMocks());
describe('prova de pagamento antes da transição atômica',()=>{
 it('falha de persistência mantém pending e permite recuperação sem perder a fila',async()=>{
  const fake=new FakeSupabase({orders:[{id:'order-test',status:'new',payment_status:'pending',total_cents:10000,currency:'BRL'}]});
  let falhar=true;
  fixture.client={from:(table:string)=>{const q=fake.from(table);if(table==='payments'&&falhar)q.insert=()=>Promise.resolve({data:null,error:{code:'timeout'}}) as any;return q;}};
  vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(await confirmarPagamento('order-test')).toEqual({estado:'indisponivel',motivo:'erro ao registrar confirmação'});
  expect(fake.tabela('orders')[0]?.payment_status).toBe('pending');expect(fixture.despachar).not.toHaveBeenCalled();expect(fixture.registrar).not.toHaveBeenCalled();expect(fixture.avisar).not.toHaveBeenCalled();
  falhar=false;
  expect(await confirmarPagamento('order-test')).toEqual({estado:'pago',jaEstavaPago:false});
  expect(fake.tabela('payments')[0]?.status).toBe('approved');expect(fake.tabela('orders')[0]?.payment_status).toBe('paid');expect(fixture.despachar).toHaveBeenCalledTimes(1);expect(fixture.registrar).toHaveBeenCalledTimes(1);
 });
});
